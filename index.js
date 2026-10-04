/* ============================================================
   EXAMIVO — Cloud Functions (secure AI backend)
   Browser → Cloud Function → AI provider → validated JSON → Browser

   Pipeline (spec §25):
   MATERIAL → CONTENT ANALYSIS → CLASS ANALYSIS → EXAM PROFILE →
   QUESTION PATTERN ANALYSIS → CONCEPT PRIORITIZATION →
   QUESTION BLUEPRINT → QUESTION GENERATION → VALIDATION → FINAL EXAM

   Secrets (never in the frontend):
     firebase functions:secrets:set AI_API_KEY
     export AI_BASE_URL / AI_MODEL / AI_VISION_MODEL as needed
   ============================================================ */

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const { callAI, AIConfigError } = require('./ai');
const { classProfile, examProfile, planTypeMix } = require('./profiles');

// cors: true — every function answers CORS preflights with Access-Control-Allow-Origin.
// Healthy v2 callables do this by default too, but being explicit guarantees the browser
// never sees a "blocked by CORS policy" error caused by a missing option (README §9).
setGlobalOptions({
  region: 'us-central1',
  memory: '512MiB',
  timeoutSeconds: 240,
  maxInstances: 20,
  cors: true,
});

const AI_API_KEY = defineSecret('AI_API_KEY');

/* ============================================================
   0) health — one-click deployment / reachability check
   Open https://us-central1-<project-id>.cloudfunctions.net/health
   in a browser or curl it. JSON here = functions are deployed,
   reachable and CORS-enabled. The frontend uses this endpoint to
   diagnose "functions/internal" failures (see js/ai.js, README §9).
   ============================================================ */

exports.health = onRequest({ cors: true }, (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'EXAMIVO functions',
    endpoints: ['analyzeMaterial', 'generateQuestions', 'gradeAnswers', 'studyMistakes'],
    time: new Date().toISOString(),
  });
});

/* ============================================================
   Shared prompt context
   ============================================================ */

function contextBlock(config) {
  const cp = classProfile(config.classLevel);
  const ep = examProfile(config.examType);
  const cognitive = typeof cp.cognitive === 'function' ? cp.cognitive(config.classLevel) : cp.cognitive;
  return [
    `CLASS: ${config.classLevel} (${cp.label})`,
    `CLASS LANGUAGE RULES: ${cp.language}`,
    `CLASS COGNITIVE EXPECTATIONS: ${cognitive}`,
    `CLASS EXPLANATION STYLE: ${cp.explanationStyle}`,
    `SUBJECT: ${config.subject}`,
    `EXAMINATION: ${ep.label}`,
    `EXAM FORMAT RULES: ${ep.style}`,
    config.difficulty ? `DIFFICULTY TARGET: ${config.difficulty} (affects reasoning depth and processing steps, not just wording)` : '',
    config.focusConcepts?.length ? `PRIORITY CONCEPTS (must dominate the questions): ${config.focusConcepts.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const JSON_GUARD =
  'Return ONLY valid JSON. No markdown fences, no commentary, no trailing commas. ' +
  'Every string must be complete — never truncate. Escape all quotes inside strings properly.';

/* ============================================================
   Question schema validation (server-side, spec §44)
   ============================================================ */

const VALID_TYPES = new Set([
  'multiple_choice', 'true_false', 'fill_blank', 'short_answer',
  'theory', 'essay', 'calculation', 'scenario', 'matching',
]);

function validateQuestion(q, index) {
  if (!q || typeof q !== 'object') return null;
  const type = String(q.type || 'multiple_choice');
  if (!VALID_TYPES.has(type)) return null;
  const question = String(q.question || '').trim();
  if (question.length < 8) return null;
  const explanation = String(q.explanation || '').trim();
  if (explanation.length < 10) return null;

  const out = {
    id: q.id || `q_${index + 1}_${Math.random().toString(36).slice(2, 7)}`,
    question,
    type,
    topic: String(q.topic || 'General').trim().slice(0, 80),
    difficulty: ['easy', 'medium', 'hard', 'exam_level', 'mixed'].includes(q.difficulty) ? q.difficulty : 'medium',
    explanation: explanation.slice(0, 1200),
    cognitiveSkill: String(q.cognitiveSkill || 'understanding').slice(0, 40),
    sourceConcept: String(q.sourceConcept || q.topic || '').slice(0, 120),
    examRelevance: ['high', 'medium', 'low'].includes(q.examRelevance) ? q.examRelevance : 'medium',
    maxScore: Number(q.maxScore) > 0 ? Math.round(Number(q.maxScore)) : type === 'multiple_choice' || type === 'true_false' ? 1 : 5,
  };

  if (type === 'multiple_choice' || type === 'scenario') {
    const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o).trim()).filter(Boolean);
    if (options.length < 3 || options.length > 6) return null;
    let correct = Number.isInteger(q.correctAnswer) ? q.correctAnswer : -1;
    if (typeof q.correctAnswer === 'string') {
      const byText = options.findIndex((o) => o.toLowerCase() === q.correctAnswer.trim().toLowerCase());
      if (byText >= 0) correct = byText;
    }
    if (correct < 0 || correct >= options.length) return null;
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
    out.options = options;
    out.correctAnswer = correct;
  } else if (type === 'true_false') {
    out.options = ['True', 'False'];
    const ca = String(q.correctAnswer ?? 'True').toLowerCase();
    out.correctAnswer = ca === 'false' || ca === 'b' || ca === '1' ? 1 : 0;
  } else if (type === 'fill_blank') {
    const answers = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [q.acceptedAnswers ?? q.answer];
    const clean = answers.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
    if (!clean.length) return null;
    out.acceptedAnswers = clean.slice(0, 6);
  } else if (type === 'calculation') {
    if (Array.isArray(q.options) && q.options.length >= 3) {
      const options = q.options.map((o) => String(o).trim()).filter(Boolean);
      let correct = Number.isInteger(q.correctAnswer) ? q.correctAnswer : -1;
      if (correct < 0 || correct >= options.length) return null;
      out.options = options;
      out.correctAnswer = correct;
    } else {
      const answers = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [q.acceptedAnswers ?? q.answer];
      const clean = answers.map((a) => String(a).trim()).filter(Boolean);
      if (!clean.length) return null;
      out.acceptedAnswers = clean.slice(0, 6);
      const numeric = clean.map((a) => parseFloat(a.replace(/[^0-9.\-]/g, ''))).find((n) => !Number.isNaN(n));
      out.numericAnswer = numeric == null || Number.isNaN(numeric) ? null : numeric;
      if (out.numericAnswer == null) return null;
      out.tolerance = Number(q.tolerance) > 0 ? Number(q.tolerance) : Math.max(Math.abs(out.numericAnswer) * 0.02, 0.01);
    }
  } else if (type === 'matching') {
    const pairs = (Array.isArray(q.pairs) ? q.pairs : [])
      .map((p) => ({ left: String(p?.left || '').trim(), right: String(p?.right || '').trim() }))
      .filter((p) => p.left && p.right);
    if (pairs.length < 3 || pairs.length > 6) return null;
    out.pairs = pairs;
  } else {
    // short_answer / theory / essay
    const model = String(q.modelAnswer || q.answer || '').trim();
    if (model.length < 4) return null;
    out.modelAnswer = model.slice(0, 2500);
    out.rubric = String(q.rubric || '').slice(0, 800);
    out.maxScore = out.maxScore || (type === 'essay' ? 15 : type === 'theory' ? 10 : 5);
  }

  return out;
}

function validateBatch(raw, count) {
  const list = Array.isArray(raw) ? raw : raw?.questions || raw?.items || [];
  const valid = [];
  const seen = new Set();
  for (const q of list) {
    const v = validateQuestion(q, valid.length);
    if (!v) continue;
    const key = v.question.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(v);
    if (valid.length >= count) break;
  }
  return valid;
}

/* ============================================================
   1) analyzeMaterial — content analysis → exam focus
   ============================================================ */

exports.analyzeMaterial = onCall({ secrets: [AI_API_KEY] }, async (request) => {
  const { config, material } = request.data || {};
  assertConfig(config);

  const cp = classProfile(config.classLevel);
  const ep = examProfile(config.examType);
  const cognitive = typeof cp.cognitive === 'function' ? cp.cognitive(config.classLevel) : cp.cognitive;

  let materialBlock;
  const images = [];
  if (!material || material.type === 'weakareas') {
    materialBlock =
      `MATERIAL: The student is targeting their weak concepts, identified from a previous exam: ` +
      `${(material?.concepts || []).join('; ') || 'previously missed concepts'}. Build the analysis around these concepts ` +
      `plus their natural extensions in the ${config.subject} syllabus at this level.`;
  } else if (material.type === 'image') {
    if (!material.base64) {
      throw new HttpsError('invalid-argument', 'The image data did not arrive. Try uploading it again.');
    }
    images.push({ base64: material.base64, mime: material.mime || 'image/jpeg' });
    materialBlock =
      'MATERIAL: An image (photo/scan/screenshot) of the student\u2019s study material is attached. ' +
      'Read it carefully — it may be printed, handwritten, a textbook page, a screenshot or a worksheet. ' +
      'If parts are unreadable, work with what IS readable and do not invent content that is not there.';
  } else if (material.type === 'topic') {
    materialBlock =
      `MATERIAL: The student provided only a topic: "${material.topic}". Use your knowledge of the ${config.subject} ` +
      `syllabus at this level for this examination to map the topic into its teachable sub-concepts.`;
  } else {
    materialBlock =
      `MATERIAL (extracted text from the student's document "${material.fileName || 'upload'}"):\n` +
      `${String(material.text || '').slice(0, 45000)}`;
  }

  const system = `You are EXAMIVO's exam analysis engine — a specialist in examination preparation for West African curricula.
You study material the way a veteran examiner would: identify what is testable, prioritize it against the exam format, and map it to the student's level.
${JSON_GUARD}`;

  const user = `${contextBlock(config)}

${materialBlock}

Run this analysis internally:
1. CONTENT ANALYSIS — headings, topics, subtopics, definitions, formulas, examples, processes, important terms, learning objectives.
2. CLASS ANALYSIS — apply the class language and cognitive rules above.
3. EXAM PROFILE ANALYSIS — how ${ep.label} typically tests this subject.
4. QUESTION PATTERN ANALYSIS — the question styles this exam uses for these concepts.
5. CONCEPT PRIORITIZATION — which concepts deserve the most questions and why.
6. BLUEPRINT — plan the question types, difficulty spread and mark totals for ${config.count} questions.

Return JSON exactly in this shape:
{
  "summary": "2-3 sentence summary of what the student is preparing and the material quality",
  "keyConcepts": ["6-10 key concepts found"],
  "focus": {
    "highPriority": ["3-5 concepts that must dominate the exam"],
    "alsoRevise": ["2-4 supporting concepts worth revising"],
    "rationale": "1-2 sentences explaining the prioritization in second person ('you'), honest and specific"
  },
  "blueprint": {
    "questionTypes": ["types planned with rough counts, e.g. 'multiple_choice x8'"],
    "difficultySpread": "e.g. 30% easy, 50% medium, 20% hard",
    "notes": "1-2 sentences on structure and timing"
  },
  "unreadable": "only if the material was an image with unreadable parts: describe what could not be read, else empty string"
}`;

  try {
    const data = await callAI({ system, user, images, json: true, temperature: 0.4, maxTokens: 2400 });

    return {
      summary: String(data.summary || '').slice(0, 800),
      keyConcepts: (Array.isArray(data.keyConcepts) ? data.keyConcepts : []).map((c) => String(c).slice(0, 90)).slice(0, 10),
      focus: {
        highPriority: (Array.isArray(data.focus?.highPriority) ? data.focus.highPriority : []).map((c) => String(c).slice(0, 90)).slice(0, 6),
        alsoRevise: (Array.isArray(data.focus?.alsoRevise) ? data.focus.alsoRevise : []).map((c) => String(c).slice(0, 90)).slice(0, 5),
        rationale: String(data.focus?.rationale || '').slice(0, 700),
      },
      blueprint: {
        questionTypes: (Array.isArray(data.blueprint?.questionTypes) ? data.blueprint.questionTypes : []).map((t) => String(t).slice(0, 60)).slice(0, 10),
        difficultySpread: String(data.blueprint?.difficultySpread || '').slice(0, 160),
        notes: String(data.blueprint?.notes || '').slice(0, 400),
      },
      unreadable: String(data.unreadable || ''),
      profiles: { classLabel: cp.label, examLabel: ep.label },
    };
  } catch (err) {
    throw wrapAIError(err);
  }
});

/* ============================================================
   2) generateQuestions — blueprint → generation → validation
   ============================================================ */

exports.generateQuestions = onCall({ secrets: [AI_API_KEY] }, async (request) => {
  const { analysis, config } = request.data || {};
  assertConfig(config);
  const count = Math.max(1, Math.min(30, Number(config.count) || 10));

  const ep = examProfile(config.examType);
  const typePlan = planTypeMix(config.examType, count, config.focusConcepts);
  const typeCounts = typePlan.reduce((acc, t) => {
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const focus = analysis?.focus?.highPriority?.length
    ? analysis.focus.highPriority
    : analysis?.keyConcepts?.length
      ? analysis.keyConcepts
      : config.focusConcepts || [];

  const system = `You are EXAMIVO's question generation engine — an expert examiner who writes original, accurate, syllabus-true examination questions.
Rules you never break:
- Questions must be ORIGINAL (never copy textbook or past-paper phrasing verbatim).
- Each question must be answerable from the material/analysis provided and the student's level.
- Distractors must be plausible and based on real misconceptions, never absurd.
- Language MUST follow the class profile precisely.
- One question must never reveal the answer to another.
- ${JSON_GUARD}`;

  const user = `${contextBlock(config)}

ANALYSIS SUMMARY: ${analysis?.summary || ''}
KEY CONCEPTS: ${(analysis?.keyConcepts || []).join('; ')}
FOCUS (prioritize these): ${focus.join('; ') || 'as planned'}
BLUEPRINT NOTES: ${analysis?.blueprint?.notes || ''}

QUESTION TYPE PLAN for exactly ${count} questions: ${JSON.stringify(typeCounts)}

Generate exactly ${count} questions following the type plan. For each question return:
{
  "question": "stem text (use \n for line breaks when needed)",
  "type": "multiple_choice|true_false|fill_blank|short_answer|theory|essay|calculation|scenario|matching",
  "options": ["only for multiple_choice, scenario, calculation-as-MCQ — 4 options"],
  "correctAnswer": <zero-based index for option types | "True"/"False" | accepted answer string>,
  "acceptedAnswers": ["for fill_blank/calculation numeric — accepted variants"],
  "modelAnswer": "for short_answer/theory/essay — a model answer worth full marks",
  "rubric": "for theory/essay — how marks are earned",
  "pairs": [{"left":"...","right":"..."}] for matching,
  "explanation": "why the answer is correct + the classic mistake to avoid (follow class explanation style)",
  "topic": "the specific concept tested",
  "difficulty": "easy|medium|hard|exam_level",
  "cognitiveSkill": "recall|understanding|application|analysis|evaluation",
  "sourceConcept": "the concept from the material this tests",
  "examRelevance": "high|medium|low",
  "maxScore": <marks this question carries>
}

Return JSON: { "questions": [ ...${count} items... ] }`;

  try {
    let questions = [];
    let attempts = 0;
    const minValid = Math.max(3, Math.floor(count * 0.8));

    while (questions.length < minValid && attempts < 3) {
      attempts++;
      const data = await callAI({
        system,
        user: attempts === 1 ? user : `${user}\n\nNOTE: your previous response had invalid or duplicate questions. Write fresh, strictly valid questions. Remaining needed: ${count - questions.length}.`,
        json: true,
        temperature: attempts === 1 ? 0.7 : 0.85,
        maxTokens: 12000,
      });
      const batch = validateBatch(data, count - questions.length);
      questions = questions.concat(batch);
    }

    if (!questions.length) {
      throw new HttpsError('internal', 'EXAMIVO could not produce valid questions from that material. Try richer material or a different topic.');
    }

    return {
      questions,
      rejected: count - questions.length > 0 ? count - questions.length : 0,
      typePlan: typeCounts,
    };
  } catch (err) {
    throw wrapAIError(err);
  }
});

/* ============================================================
   3) gradeAnswers — open-ended grading after submission
   ============================================================ */

exports.gradeAnswers = onCall({ secrets: [AI_API_KEY] }, async (request) => {
  const questions = (request.data?.questions || []).slice(0, 20);
  if (!questions.length) return { results: [] };

  const config = request.data?.config || {};
  const cp = classProfile(config.classLevel);

  const system = `You are EXAMIVO's marking engine — a fair, experienced examiner marking ${config.examType || 'school'} scripts for a ${config.classLevel || 'secondary'} student.
Mark like the real examination: award marks for correct points even if wording differs; apply the rubric; be strict about facts, fair about expression.
For each question return score (number), maxScore (number) and feedback (1-3 sentences: what earned marks, what was missing, in the class explanation style).
${JSON_GUARD}`;

  const user = `Grade each answer. Score 0 when the answer is blank or entirely off-topic.

QUESTIONS:
${questions
  .map(
    (q, i) => `--- Q${i + 1} [${q.type}] (${q.maxScore} marks) topic: ${q.topic}
Question: ${q.question}
Model answer: ${q.modelAnswer}
${q.rubric ? `Rubric: ${q.rubric}` : ''}
Student response: ${String(q.response || '').slice(0, 3000) || '(blank)'}`
  )
  .join('\n\n')}

Return JSON: { "results": [ { "id": "<the question id>", "score": <number>, "maxScore": <number>, "feedback": "<marker feedback>" } ] }`;

  try {
    const data = await callAI({ system, user, json: true, temperature: 0.2, maxTokens: 4000 });
    const valid = (data?.results || [])
      .filter((r) => r && r.id && Number.isFinite(Number(r.score)))
      .map((r) => ({
        id: String(r.id),
        score: Math.max(0, Math.min(Number(r.score), Number(r.maxScore) || 5)),
        maxScore: Number(r.maxScore) || 5,
        feedback: String(r.feedback || '').slice(0, 900),
      }));
    return { results: valid };
  } catch (err) {
    throw wrapAIError(err);
  }
});

/* ============================================================
   4) studyMistakes — revision notes from wrong answers
   ============================================================ */

exports.studyMistakes = onCall({ secrets: [AI_API_KEY] }, async (request) => {
  const { config, wrongQuestions, weakTopics } = request.data || {};
  assertConfig(config || {});
  const cp = classProfile(config.classLevel);

  const system = `You are EXAMIVO's study coach. You turn a student's actual mistakes into tight, effective revision notes.
You never lecture — you teach exactly what was missed, at the student's class level, using the class language rules.
${JSON_GUARD}`;

  const user = `${contextBlock(config)}

THE STUDENT GOT THESE WRONG (their answer vs the correct answer):
${(wrongQuestions || [])
  .map(
    (w, i) => `--- Mistake ${i + 1} [topic: ${w.topic}]
Question: ${w.question}
Their answer: ${String(w.yourAnswer).slice(0, 300)}
Correct answer: ${String(w.correctAnswer).slice(0, 300)}
${w.explanation ? `Context: ${String(w.explanation).slice(0, 300)}` : ''}`
  )
  .join('\n\n') || '(none — focus on the weak topics)'}

WEAK TOPICS: ${(weakTopics || []).join('; ')}

Build a study pack that fixes THESE mistakes. Group related mistakes into concepts. Do not pad.

Return JSON exactly:
{
  "title": "short study pack title (e.g. 'Quadratics: Factoring & Formula')",
  "concepts": ["3-6 concepts to master"],
  "revisionNotes": [ { "title": "concept", "body": "2-4 sentence explanation written for this student's class level, directly addressing the mistakes" } ],
  "examples": [ { "prompt": "a fresh worked-example question", "solution": "clear step-by-step solution" } ],
  "practiceQuestions": [ { "question": "a NEW question drilling the same concept", "answer": "the answer", "explanation": "1-2 sentences why" } ]
}

Limits: revisionNotes 3-6 items, examples 2-3, practiceQuestions 3-5.`;

  try {
    const data = await callAI({ system, user, json: true, temperature: 0.5, maxTokens: 5000 });
    return {
      title: String(data.title || 'Your Study Pack').slice(0, 120),
      concepts: (Array.isArray(data.concepts) ? data.concepts : []).map((c) => String(c).slice(0, 90)).slice(0, 8),
      revisionNotes: (Array.isArray(data.revisionNotes) ? data.revisionNotes : []).slice(0, 8).map((n) => ({
        title: String(n?.title || 'Note').slice(0, 120),
        body: String(n?.body || '').slice(0, 1500),
      })),
      examples: (Array.isArray(data.examples) ? data.examples : []).slice(0, 5).map((n) => ({
        prompt: String(n?.prompt || '').slice(0, 800),
        solution: String(n?.solution || '').slice(0, 2000),
      })),
      practiceQuestions: (Array.isArray(data.practiceQuestions) ? data.practiceQuestions : []).slice(0, 6).map((n) => ({
        question: String(n?.question || '').slice(0, 800),
        answer: String(n?.answer || '').slice(0, 600),
        explanation: String(n?.explanation || '').slice(0, 600),
      })),
    };
  } catch (err) {
    throw wrapAIError(err);
  }
});

/* ============================================================
   Helpers
   ============================================================ */

function assertConfig(config) {
  if (!config || !config.classLevel || !config.subject) {
    throw new HttpsError('invalid-argument', 'EXAMIVO needs your class and subject to build this.');
  }
}

function wrapAIError(err) {
  if (err instanceof HttpsError) throw err;
  if (err instanceof AIConfigError) {
    // Human-readable, surfaced verbatim by the frontend.
    throw new HttpsError(err.code || 'failed-precondition', err.message);
  }
  console.error('[EXAMIVO] unexpected error:', err);
  throw new HttpsError('internal', 'EXAMIVO could not complete that request. Please try again.');
}
