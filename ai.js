/* ============================================================
   EXAMIVO — AI client
   All AI traffic flows: Browser → Cloud Function → AI provider.
   No API keys exist in this frontend. Function errors are mapped
   to human language — raw Firebase/API errors never surface.
   ============================================================ */

import { app, sdk, firebaseConfig } from './firebase.js';
import { HumanError } from './utils.js';

const FUNCTIONS_BASE = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

let functions = null;
async function fns() {
  if (!functions) {
    const { getFunctions } = await sdk('functions');
    functions = getFunctions(app);
  }
  return functions;
}

async function call(name, payload) {
  try {
    const { httpsCallable } = await sdk('functions');
    const callable = httpsCallable(await fns(), name, { timeout: 240000 });
    const result = await callable(payload);
    return result.data;
  } catch (err) {
    throw await mapFunctionError(err, name);
  }
}

/**
 * Live reachability probe against the health endpoint (CORS-enabled).
 * Healthy v2 callable functions answer browser CORS preflights automatically —
 * so when the SDK reports a bare `internal` failure, the request never reached
 * a healthy function (not deployed, deploy failed, wrong project/region, or a
 * cold-start crash). This probe tells those cases apart so the student gets a
 * real answer, not a riddle.
 */
async function probeBackend() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${FUNCTIONS_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function mapFunctionError(err) {
  const code = err?.code || '';
  const message = String(err?.message || '');
  console.warn('[EXAMIVO] AI call failed:', code, message);

  // Signature of a request that never reached a healthy function:
  // code functions/internal with the bare message "internal" — typically a
  // CORS preflight failure (function missing / deploy failed / crashed).
  const unreachable = code === 'functions/internal' && /^internal$/i.test(message.trim());
  if (unreachable) {
    const healthy = await probeBackend();
    if (!healthy) {
      return new HumanError(
        'EXAMIVO can’t reach its AI backend — the Cloud Functions aren’t responding on this Firebase project, ' +
          'which almost always means they aren’t deployed yet or the deploy failed. ' +
          'In the project folder run: firebase functions:secrets:set AI_API_KEY (the Blaze plan is required), ' +
          'then: firebase deploy --only functions — and reload this page. Full checklist: README §9.',
        { retryable: false }
      );
    }
    return new HumanError(
      'EXAMIVO’s AI backend is online but didn’t answer that call. It may have been waking up — ' +
        'wait a few seconds and try again. If it keeps failing, run: firebase functions:log'
    );
  }

  if (code.includes('unavailable') || code.includes('deadline-exceeded') || code.includes('network')) {
    return new HumanError('EXAMIVO couldn’t reach its AI backend just now. Check your connection and try again.');
  }
  if (code.includes('not-found') || code.includes('unimplemented')) {
    return new HumanError(
      'EXAMIVO’s AI backend isn’t deployed yet. Follow the README in the project to deploy the Cloud Functions, then try again (troubleshooting: README §9).',
      { retryable: false }
    );
  }
  if (code.includes('permission-denied')) {
    return new HumanError('EXAMIVO couldn’t authorize that request. Try signing in again.', { retryable: false });
  }
  if (code.includes('resource-exhausted')) {
    return new HumanError('EXAMIVO is receiving a lot of requests right now. Give it a moment and try again.');
  }
  if (code.includes('invalid-argument')) {
    return new HumanError(err.message || 'That request could not be processed. Adjust your material and try again.');
  }
  // functions/internal + everything else — message from server is already human-safe
  if (message && message.length < 220 && !/internal|Error:/i.test(message)) {
    return new HumanError(message);
  }
  return new HumanError('EXAMIVO couldn’t complete that request. Please try again.');
}

/* ============================================================
   Pipeline calls (real, staged)
   ============================================================ */

/** Stage 1 — material/content/class/exam analysis → exam focus. */
export function analyzeMaterial(config) {
  return call('analyzeMaterial', config);
}

/** Stage 2 — question generation from the returned analysis. */
export function generateQuestions({ analysis, config }) {
  return call('generateQuestions', { analysis, config });
}

/** Open-ended grading after submission. */
export function gradeAnswers({ questions }) {
  return call('gradeAnswers', { questions });
}

/** Revision notes for mistakes. */
export function studyMistakes({ config, wrongQuestions, weakTopics }) {
  return call('studyMistakes', { config, wrongQuestions, weakTopics });
}

/* ============================================================
   Client-side validation (defense in depth — the backend also
   validates before returning anything).
   ============================================================ */

const VALID_TYPES = new Set([
  'multiple_choice',
  'true_false',
  'fill_blank',
  'short_answer',
  'theory',
  'essay',
  'calculation',
  'scenario',
  'matching',
]);
const VALID_DIFFICULTY = new Set(['easy', 'medium', 'hard', 'exam_level', 'mixed']);
const OPEN_TYPES = new Set(['short_answer', 'theory', 'essay']);

/** Normalize + validate AI questions. Returns { questions, rejected } */
export function validateQuestions(raw, { expectedCount = 10 } = {}) {
  const valid = [];
  let rejected = 0;
  const seen = new Set();

  for (const q of Array.isArray(raw) ? raw : raw?.questions || []) {
    try {
      const type = String(q.type || 'multiple_choice');
      if (!VALID_TYPES.has(type)) throw new Error('type');
      const question = String(q.question || '').trim();
      if (question.length < 8) throw new Error('question');
      const key = question.toLowerCase().replace(/\W+/g, ' ').trim();
      if (seen.has(key)) throw new Error('duplicate');
      seen.add(key);

      const out = {
        id: q.id || `q_${valid.length + 1}_${Math.random().toString(36).slice(2, 7)}`,
        question,
        type,
        topic: String(q.topic || 'General').trim(),
        difficulty: VALID_DIFFICULTY.has(q.difficulty) ? q.difficulty : 'medium',
        explanation: String(q.explanation || '').trim(),
        cognitiveSkill: String(q.cognitiveSkill || 'understanding'),
        examRelevance: String(q.examRelevance || 'medium'),
        maxScore: Number(q.maxScore) || (OPEN_TYPES.has(type) ? 5 : 1),
      };
      if (out.explanation.length < 10) throw new Error('explanation');

      if (type === 'multiple_choice' || type === 'scenario') {
        const options = (q.options || []).map((o) => String(o).trim()).filter(Boolean);
        if (options.length < 3 || options.length > 6) throw new Error('options');
        let correct = Number.isInteger(q.correctAnswer) ? q.correctAnswer : q.correctAnswerIndex;
        if (typeof q.correctAnswer === 'string') {
          const idx = options.findIndex((o) => o.toLowerCase() === q.correctAnswer.toLowerCase().trim());
          if (idx >= 0) correct = idx;
        }
        if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) throw new Error('answer');
        out.options = options;
        out.correctAnswer = correct;
      } else if (type === 'true_false') {
        out.options = ['True', 'False'];
        const ca = String(q.correctAnswer ?? q.correctOption ?? 'True').toLowerCase();
        out.correctAnswer = ca === 'false' || ca === 'b' || ca === '1' ? 1 : 0;
      } else if (type === 'fill_blank' || type === 'calculation') {
        const answers = q.acceptedAnswers || q.accepted_answers || q.answer;
        out.acceptedAnswers = (Array.isArray(answers) ? answers : [answers])
          .map((a) => String(a).trim().toLowerCase())
          .filter(Boolean);
        if (!out.acceptedAnswers.length) throw new Error('answer');
        if (type === 'calculation') {
          const numeric = out.acceptedAnswers.map((a) => parseFloat(a.replace(/[^0-9.\-]/g, ''))).find((n) => !Number.isNaN(n));
          out.numericAnswer = Number.isNaN(numeric) ? null : numeric;
          out.tolerance = Number(q.tolerance) || Math.max(Math.abs(numeric || 1) * 0.02, 0.01);
        }
      } else if (type === 'matching') {
        const pairs = (q.pairs || []).filter((p) => p?.left && p?.right);
        if (pairs.length < 3) throw new Error('pairs');
        out.pairs = pairs.map((p) => ({ left: String(p.left).trim(), right: String(p.right).trim() }));
      } else {
        // short_answer / theory / essay — model answer required for grading
        const model = String(q.modelAnswer || q.answer || '').trim();
        if (model.length < 4) throw new Error('model');
        out.modelAnswer = model;
        out.rubric = String(q.rubric || '').trim();
      }

      valid.push(out);
      if (valid.length >= expectedCount) break;
    } catch {
      rejected++;
    }
  }
  return { questions: valid, rejected };
}

export const isOpenQuestion = (q) => OPEN_TYPES.has(q.type);

/** Grade an objective question against a response. */
export function gradeObjective(q, response) {
  if (response == null || response === '') return { correct: false, score: 0 };
  if (q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'scenario') {
    return { correct: Number(response) === q.correctAnswer, score: Number(response) === q.correctAnswer ? q.maxScore : 0 };
  }
  if (q.type === 'fill_blank') {
    const norm = String(response).trim().toLowerCase();
    return { correct: q.acceptedAnswers.some((a) => a === norm), score: q.acceptedAnswers.some((a) => a === norm) ? q.maxScore : 0 };
  }
  if (q.type === 'calculation') {
    const value = parseFloat(String(response).replace(/[^0-9.\-]/g, ''));
    if (Number.isNaN(value) || q.numericAnswer == null) return { correct: false, score: 0 };
    const ok = Math.abs(value - q.numericAnswer) <= (q.tolerance ?? 0.01);
    return { correct: ok, score: ok ? q.maxScore : 0 };
  }
  if (q.type === 'matching') {
    const resp = response || {};
    const correctPairs = q.pairs.filter((p) => resp[p.left] === p.right).length;
    const score = Math.round((correctPairs / q.pairs.length) * q.maxScore);
    return { correct: correctPairs === q.pairs.length, score, partial: true, correctPairs, totalPairs: q.pairs.length };
  }
  return null; // open-ended → backend grading
}
