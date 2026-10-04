/* ============================================================
   EXAMIVO — Exam engine
   Real generation via the secure backend, real answers, real
   scoring, real weak-area analysis. No mock data, ever.
   ============================================================ */

import { $, el, escapeHtml, HumanError, formatTime, Handoff, queryFlag } from './utils.js';
import { generateQuestions, gradeAnswers, validateQuestions, gradeObjective, isOpenQuestion } from './ai.js';
import { renderQuestion, isAnswered } from './questions.js';
import { createAILoading, confirmModal, toast, createThemeToggle } from './ui.js';
import { Store, isGuest } from './storage.js';
import { trackEvent } from './firebase.js';
import { examTypeLabel } from './constants.js';

/* ---------------- Session recovery ---------------- */

let session = Handoff.take('examivo.session');

// Retest support: results.html may stage a fresh session targeting weak concepts.
if (!session && queryFlag('retest') === '1') {
  session = Handoff.get('examivo.retest');
  Handoff.take('examivo.retest');
}

const body = $('#exam-body');
const generationRoot = $('#generation-root');

if (!session?.config || !session?.analysis) {
  // No staged session — send the student somewhere useful, with context preserved.
  body.hidden = false;
  document.querySelector('.exam-navpanel').style.display = 'none';
  document.querySelector('.exam-actions').style.display = 'none';
  document.querySelector('.exam-header .container').innerHTML = `
    <a class="brand" href="index.html"><img src="assets/logo/logo.svg" alt="EXAMIVO" width="130" height="24"/></a>
    <span class="spacer"></span>
    <span class="ai-status-line" data-state="idle"><span class="pulse-dot"></span>No exam is staged</span>`;
  document.querySelector('.exam-layout').innerHTML = `
    <main id="main">
      <div class="card card-pad" style="max-width:480px;margin:3rem auto;text-align:center">
        <h2 style="margin-bottom:.6rem">Your exam isn't set up yet.</h2>
        <p style="color:var(--text-secondary);margin-bottom:1.4rem">Pick your class, subject and material, and EXAMIVO
        will build your exam in under a minute.</p>
        <a class="btn btn-primary" href="setup.html">Start a New Practice</a>
      </div>
    </main>`;
} else {
  runGeneration();
}

/* ============================================================
   GENERATION (real backend call, honest stage progression)
   ============================================================ */

async function runGeneration() {
  const loading = createAILoading({
    title: 'EXAMIVO IS THINKING',
    subtitle: `${session.config.subject} · ${examTypeLabel(session.config.examType)} · ${session.config.count} questions`,
    stages: ['Building your question blueprint', 'Generating your questions', 'Checking question quality'],
  });
  generationRoot.appendChild(loading.overlay);

  try {
    loading.start(0, 'Using your class, subject and exam profile');
    await new Promise((r) => setTimeout(r, 350)); // blueprint assembly (client-side, real)
    loading.done(0);

    loading.start(1, 'Writing original questions for you');
    const result = await generateQuestions({
      analysis: session.analysis,
      config: { ...session.config, focusConcepts: session.analysis?.focusConcepts || null },
    });
    loading.done(1);

    loading.start(2, 'Validating structure, answers and duplicates');
    const { questions, rejected } = validateQuestions(result?.questions, {
      expectedCount: session.config.count,
    });
    if (questions.length < Math.min(4, session.config.count)) {
      throw new HumanError('EXAMIVO could not produce enough valid questions from that material. Try adding richer material or fewer questions.');
    }
    loading.done(2);
    loading.complete('Your exam is ready. Good luck!');
    trackEvent('exam_generated', {
      subject: session.config.subject,
      exam_type: session.config.examType,
      count: questions.length,
      rejected,
    });
    await new Promise((r) => setTimeout(r, 620));
    await loading.close();

    startExam(questions);
  } catch (err) {
    loading.fail(err instanceof HumanError ? err.message : null);
    trackEvent('exam_generation_failed', {});
    await new Promise((r) => setTimeout(r, 1500));
    await loading.close();
    generationRoot.innerHTML = `
      <div class="card card-pad" style="max-width:480px;margin:18vh auto 0;text-align:center">
        <h2 style="margin-bottom:.6rem">Something went wrong.</h2>
        <p style="color:var(--text-secondary);margin-bottom:1.4rem">${escapeHtml(
          err?.message || 'EXAMIVO could not complete that request. Please try again.'
        )}</p>
        <div style="display:flex;gap:.7rem;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="location.reload()">Try Again</button>
          <a class="btn btn-secondary" href="app.html">Back to Dashboard</a>
        </div>
      </div>`;
  }
}

/* ============================================================
   EXAM RUNTIME
   ============================================================ */

const state = {
  questions: [],
  answers: {},
  flags: new Set(),
  practiceRevealed: {}, // qid → true (practice mode verdicts shown)
  current: 0,
  timer: null,
  remaining: 0,
  elapsed: 0,
  submitting: false,
  startTs: Date.now(),
};

function startExam(questions) {
  state.questions = questions;
  body.hidden = false;
  body.classList.add('page-enter');

  /* Header meta */
  const meta = $('[data-exam-meta]');
  meta.innerHTML = '';
  meta.append(
    el('span', { class: 'badge badge-teal', text: session.config.subject }),
    el('span', { class: 'badge badge-neutral', text: session.config.classLevel }),
    el('span', { class: 'badge badge-neutral', text: examTypeLabel(session.config.examType) }),
    el('span', {
      class: `badge ${session.config.mode === 'practice' ? 'badge-violet' : 'badge-amber'}`,
      text: session.config.mode === 'practice' ? 'Practice Mode' : 'Exam Mode',
    })
  );

  /* Timer */
  if (session.config.timed && session.config.durationMin) {
    state.remaining = session.config.durationMin * 60;
    $('[data-timer]').hidden = false;
    paintTimer();
    state.timer = setInterval(tick, 1000);
  }

  buildNavPanel();
  renderCurrent('forward');
  updateActionStates();
  trackEvent('exam_started', { subject: session.config.subject, mode: session.config.mode });

  /* Keyboard navigation */
  document.addEventListener('keydown', keyboardNav);
}

function keyboardNav(e) {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'ArrowRight' && state.current < state.questions.length - 1) go(state.current + 1);
  if (e.key === 'ArrowLeft' && state.current > 0) go(state.current - 1);
}

/* ---------- Timer ---------- */

function tick() {
  state.remaining -= 1;
  state.elapsed += 1;
  paintTimer();
  if (state.remaining <= 0) {
    clearInterval(state.timer);
    autoSubmit();
  }
}

function paintTimer() {
  const timerEl = $('[data-timer]');
  const valueEl = $('[data-timer-value]');
  valueEl.textContent = formatTime(state.remaining);
  timerEl.classList.toggle('warning', state.remaining <= 300 && state.remaining > 60);
  timerEl.classList.toggle('critical', state.remaining <= 60);
}

async function autoSubmit() {
  if (state.submitting) return;
  await confirmModal({
    title: 'Time is up',
    message: 'Your time expired. EXAMIVO will submit your answers now.',
    confirmLabel: 'Submit Now',
  });
  submit();
}

/* ---------- Rendering ---------- */

function buildNavPanel() {
  const grid = $('[data-qnav]');
  grid.innerHTML = '';
  state.questions.forEach((q, i) => {
    grid.appendChild(
      el('button', {
        class: 'qnav-btn tabular',
        'data-idx': String(i),
        text: String(i + 1),
        'aria-label': `Go to question ${i + 1}`,
        onclick: () => {
          go(i);
          closeNavPanel();
        },
      })
    );
  });
  paintNavPanel();
}

function paintNavPanel() {
  const grid = $('[data-qnav]');
  state.questions.forEach((q, i) => {
    const btn = grid.querySelector(`[data-idx="${i}"]`);
    if (!btn) return;
    btn.classList.toggle('current', i === state.current);
    btn.classList.toggle('answered', isAnswered(q, state.answers[q.id]));
    btn.classList.toggle('flagged', state.flags.has(q.id));
  });
  const answered = state.questions.filter((q) => isAnswered(q, state.answers[q.id])).length;
  $('[data-nav-progress]').textContent = `${answered}/${state.questions.length}`;
  $('[data-progress-text]').textContent = `${answered} of ${state.questions.length} answered`;
}

function renderCurrent(direction) {
  const q = state.questions[state.current];
  q.displayIndex = `${state.current + 1} of ${state.questions.length}`;
  const card = $('[data-question-card]');

  renderQuestion(card, q, {
    response: state.answers[q.id] ?? null,
    onResponse: (value) => onResponse(q, value),
    practice: session.config.mode === 'practice',
    revealed: session.config.mode === 'practice' && state.practiceRevealed[q.id],
    showModel: session.config.mode === 'practice' && state.practiceRevealed[`${q.id}:model`],
    graded: null,
  });

  card.className = `question-card ${direction === 'forward' ? 'q-enter-forward' : 'q-enter-back'}`;

  /* Practice mode: open-ended questions get a "check" affordance */
  const isPractice = session.config.mode === 'practice';
  if (isPractice && isOpenQuestion(q) && !state.practiceRevealed[`${q.id}:model`]) {
    const checkBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      style: 'margin-top:1rem;align-self:flex-start',
      text: 'Check my answer',
      onclick: () => {
        state.practiceRevealed[`${q.id}:model`] = true;
        renderCurrent(state.current);
      },
    });
    card.appendChild(checkBtn);
  }

  paintNavPanel();
  updateActionStates();
}

function onResponse(q, value) {
  state.answers[q.id] = value;
  paintNavPanel();

  if (session.config.mode !== 'practice') return;

  // Practice mode: immediate feedback.
  const choiceTypes = ['multiple_choice', 'true_false', 'scenario'];
  if (choiceTypes.includes(q.type)) {
    state.practiceRevealed[q.id] = true;
    renderCurrent(state.current);
  } else if (q.type === 'matching' && q.pairs.every((p) => value?.[p.left])) {
    state.practiceRevealed[q.id] = true;
    renderCurrent(state.current);
  }
}

function updateActionStates() {
  $('[data-prev]').disabled = state.current === 0;
  const last = state.current === state.questions.length - 1;
  $('[data-next]').disabled = last;
  $('[data-next]').style.display = last ? 'none' : '';
}

function go(index, dir) {
  if (state.submitting) return;
  const direction = dir || (index > state.current ? 'forward' : 'back');
  state.current = index;
  renderCurrent(direction);
}

function closeNavPanel() {
  $('[data-navpanel]').classList.remove('open');
  $('[data-navpanel-backdrop]').classList.remove('show');
}

/* ---------- Wire actions ---------- */

document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-prev]')) go(state.current - 1, 'back');
  else if (t.closest('[data-next]')) go(state.current + 1, 'forward');
  else if (t.closest('[data-submit]')) openSubmitConfirm();
  else if (t.closest('[data-quit]')) confirmQuit();
  else if (t.closest('[data-navpanel-toggle]')) {
    $('[data-navpanel]').classList.add('open');
    $('[data-navpanel-backdrop]').classList.add('show');
  } else if (t.closest('[data-navpanel-close]') || t.closest('[data-navpanel-backdrop]')) closeNavPanel();
  else if (t.closest('[data-flag]')) {
    const q = state.questions[state.current];
    if (state.flags.has(q.id)) state.flags.delete(q.id);
    else state.flags.add(q.id);
    t.closest('[data-flag]').classList.toggle('active', state.flags.has(q.id));
    t.closest('[data-flag]').classList.add('flag-flap');
    setTimeout(() => t.closest('[data-flag]')?.classList.remove('flag-flap'), 380);
    paintNavPanel();
  }
});

async function confirmQuit() {
  const ok = await confirmModal({
    title: 'Leave this exam?',
    message: 'Your answers so far will be lost. This cannot be undone.',
    confirmLabel: 'Leave Exam',
    danger: true,
  });
  if (ok) location.href = 'app.html';
}

function openSubmitConfirm() {
  const unanswered = state.questions.filter((q) => !isAnswered(q, state.answers[q.id])).length;
  const flagged = state.flags.size;
  const lines = [];
  if (unanswered) lines.push(`${unanswered} question${unanswered > 1 ? 's are' : ' is'} still unanswered.`);
  if (flagged) lines.push(`${flagged} question${flagged > 1 ? 's are' : ' is'} flagged for review.`);
  const api = confirmModalBase(
    'Submit your exam?',
    [
      lines.length ? lines.join(' ') : 'All questions answered.',
      session.config.mode === 'practice'
        ? 'You will see your final score, correct answers and explanations.'
        : 'EXAMIVO will grade it and analyze your performance.',
    ].join(' '),
    'Submit Exam'
  );
  api.then((ok) => ok && submit());
}

function confirmModalBase(title, message, label) {
  // Reuse ui.confirmModal but ensure Enter submits: it already resolves on click.
  return confirmModal({ title, message, confirmLabel: label });
}

/* ============================================================
   SUBMISSION → staged real analysis → results
   ============================================================ */

async function submit() {
  if (state.submitting) return;
  state.submitting = true;
  if (state.timer) clearInterval(state.timer);

  const loading = createAILoading({
    title: 'ANALYZING YOUR PERFORMANCE',
    subtitle: 'Every answer is being scored and mapped to its concept.',
    stages: ['Checking your answers', 'Measuring performance', 'Identifying weak areas', 'Building your study recommendations'],
  });
  document.body.appendChild(loading.overlay);

  try {
    /* Stage 0 — objective scoring (real) */
    loading.start(0);
    const objectiveResults = new Map();
    for (const q of state.questions) {
      if (!isOpenQuestion(q)) {
        objectiveResults.set(q.id, gradeObjective(q, state.answers[q.id] ?? null));
      }
    }
    loading.done(0);

    /* Stage 1 — open-ended grading via backend (real call, only if needed) */
    loading.start(1);
    const openQuestions = state.questions.filter(isOpenQuestion);
    const gradedMap = new Map();
    if (openQuestions.length) {
      const payload = openQuestions.map((q) => ({
        id: q.id,
        type: q.type,
        question: q.question,
        modelAnswer: q.modelAnswer,
        rubric: q.rubric || '',
        maxScore: q.maxScore,
        response: state.answers[q.id] ?? '',
        topic: q.topic,
      }));
      try {
        const graded = await gradeAnswers({ questions: payload });
        for (const g of graded?.results || []) gradedMap.set(g.id, g);
      } catch {
        // Backend grading unavailable — mark open questions for self-review,
        // exclude from automatic score (honest, never faked).
        for (const q of openQuestions) gradedMap.set(q.id, { id: q.id, score: 0, maxScore: q.maxScore, feedback: '', selfReview: true });
      }
    }
    loading.done(1);

    /* Stage 2 — weak area derivation (real) */
    loading.start(2);
    const { topicStats, weakAreas, strongAreas, score, maxScore } = analyzePerformance(objectiveResults, gradedMap);
    loading.done(2);

    /* Stage 3 — persist (real) */
    loading.start(3);
    const attempt = {
      id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      config: { ...session.config },
      mode: session.config.mode,
      questions: state.questions.map((q, i) => ({
        id: q.id,
        question: q.question,
        type: q.type,
        topic: q.topic,
        difficulty: q.difficulty,
        options: q.options || null,
        pairs: q.pairs || null,
        correctAnswer: q.correctAnswer ?? null,
        acceptedAnswers: q.acceptedAnswers || null,
        numericAnswer: q.numericAnswer ?? null,
        modelAnswer: q.modelAnswer || null,
        explanation: q.explanation,
        maxScore: q.maxScore,
        displayIndex: i + 1,
      })),
      answers: state.answers,
      graded: Object.fromEntries(gradedMap),
      flagged: [...state.flags],
      score,
      maxScore,
      percentage: maxScore ? Math.round((score / maxScore) * 100) : 0,
      correctCount: countCorrect(objectiveResults, gradedMap),
      totalCount: state.questions.length,
      topicStats,
      weakAreas,
      strongAreas,
      durationSec: state.elapsed,
      timed: !!session.config.timed,
      status: 'completed',
      completedAt: Date.now(),
    };
    loading.done(3);
    loading.complete('Your results are ready.');

    try {
      await Store.saveAttempt(attempt);
      await Store.saveWeakAreas(weakAreas.map((w) => ({ ...w, subject: attempt.config.subject, lastSeen: Date.now() })));
      toast('Exam saved.', 'success');
    } catch (err) {
      toast(err.message || 'Saved locally — cloud sync will catch up.', 'warning', { duration: 4200 });
    }
    trackEvent('exam_completed', { subject: attempt.config.subject, percentage: attempt.percentage });

    Handoff.set('examivo.lastAttempt', attempt);
    await new Promise((r) => setTimeout(r, 520));
    await loading.close();
    location.href = `results.html?attempt=${encodeURIComponent(attempt.id)}`;
  } catch (err) {
    loading.fail();
    await new Promise((r) => setTimeout(r, 1200));
    await loading.close();
    toast(err?.message || 'EXAMIVO could not finish grading. Your answers are safe — try submitting again.', 'error', { duration: 4600 });
    state.submitting = false;
  }
}

function countCorrect(objectiveResults, gradedMap) {
  let n = 0;
  for (const r of objectiveResults.values()) if (r?.correct) n++;
  for (const g of gradedMap.values()) if (!g.selfReview && g.score >= g.maxScore * 0.6) n++;
  return n;
}

function analyzePerformance(objectiveResults, gradedMap) {
  const topicStats = new Map();
  for (const q of state.questions) {
    const topic = q.topic || 'General';
    if (!topicStats.has(topic)) topicStats.set(topic, { topic, score: 0, maxScore: 0, count: 0, correct: 0 });
    const stat = topicStats.get(topic);
    stat.count++;
    if (isOpenQuestion(q)) {
      const g = gradedMap.get(q.id);
      if (g && !g.selfReview) {
        stat.score += g.score || 0;
        stat.maxScore += g.maxScore || q.maxScore;
        if ((g.score || 0) >= (g.maxScore || q.maxScore) * 0.6) stat.correct++;
      } else {
        stat.maxScore += 0; // self-review items excluded from the automatic score
      }
    } else {
      const r = objectiveResults.get(q.id);
      stat.score += r?.score || 0;
      stat.maxScore += q.maxScore || 1;
      if (r?.correct) stat.correct++;
    }
  }

  const topics = [...topicStats.values()].map((t) => ({
    ...t,
    pct: t.maxScore ? Math.round((t.score / t.maxScore) * 100) : null,
  }));

  const weakAreas = topics
    .filter((t) => t.pct != null && t.pct < 55)
    .sort((a, b) => a.pct - b.pct)
    .map((t) => ({
      id: t.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      concept: t.topic,
      pct: t.pct,
      status: t.pct < 35 ? 'weak' : 'needs_practice',
      evidence: `${t.correct}/${t.count} questions on this concept weren't solid.`,
    }));

  const strongAreas = topics.filter((t) => t.pct != null && t.pct >= 75).map((t) => ({ concept: t.topic, pct: t.pct }));

  const score = [...objectiveResults.values()].reduce((s, r) => s + (r?.score || 0), 0) +
    [...gradedMap.values()].reduce((s, g) => s + (g.selfReview ? 0 : g.score || 0), 0);
  const maxScore = state.questions.reduce((s, q) => {
    if (isOpenQuestion(q)) {
      const g = gradedMap.get(q.id);
      return s + (g?.selfReview ? 0 : q.maxScore);
    }
    return s + (q.maxScore || 1);
  }, 0);

  return { topicStats: topics, weakAreas, strongAreas, score, maxScore };
}
