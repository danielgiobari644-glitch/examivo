/* ============================================================
   EXAMIVO — Study My Mistakes
   Turns a completed exam's wrong answers into revision notes,
   examples and practice questions via the AI backend.
   ============================================================ */

import { $, el, escapeHtml, formatDate, formatTime, queryFlag, Handoff } from './utils.js';
import { renderAppShell } from './app-shell.js';
import { createAILoading, createThemeToggle, emptyState, toast } from './ui.js';
import { studyMistakes } from './ai.js';
import { Store, isGuest } from './storage.js';
import { promptForAccount } from './auth.js';
import { trackEvent } from './firebase.js';
import { examTypeLabel } from './constants.js';

renderAppShell({ active: 'study' });

const root = $('[data-study-root]');
const listHolder = $('[data-sessions-list]');

const attemptId = queryFlag('attempt');
if (attemptId) {
  runStudySession(attemptId);
} else {
  renderStudyHome();
}

/* ---------------- Home: pick what to study ---------------- */

async function renderStudyHome() {
  root.querySelector('.history-head p').textContent =
    'Pick a completed exam — EXAMIVO builds revision notes from what you got wrong.';

  let attempts = [];
  let sessions = [];
  try {
    [attempts, sessions] = await Promise.all([Store.listAttempts(), Store.listStudySessions()]);
  } catch (err) {
    listHolder.innerHTML = '';
    listHolder.appendChild(emptyState({ icon: '⚠', title: 'Couldn’t load your study list', message: err.message }));
    return;
  }

  const withMistakes = attempts.filter((a) => {
    const wrong = (a.weakAreas?.length || 0) > 0 || countWrongQuick(a) > 0;
    return wrong;
  });

  listHolder.innerHTML = '';

  if (sessions.length) {
    listHolder.appendChild(el('h2', { class: 'section-label', text: 'Your study sessions' }));
    for (const s of sessions.slice(0, 6)) {
      listHolder.appendChild(
        el(
          'button',
          { class: 'card card-hover history-item', onclick: () => renderNotesView(s.notes, s.attemptId, s.config) },
          el('span', { class: 'ri-score', style: 'background:var(--accent-soft);color:var(--accent)', text: '✎' }),
          el(
            'span',
            { class: 'hi-main' },
            el('span', { class: 'hi-title', text: s.notes?.title || 'Study session' }),
            el('span', { class: 'hi-meta' }, el('span', { text: `${s.config?.subject || ''} · ${formatDate(s.createdAt)}` }))
          ),
          el('span', { class: 'badge badge-violet', text: 'Notes ready' })
        )
      );
    }
  }

  listHolder.appendChild(el('h2', { class: 'section-label', style: 'margin-top:1.8rem', text: 'Build a session from an exam' }));

  if (!withMistakes.length) {
    listHolder.appendChild(
      emptyState({
        title: attempts.length ? 'No mistakes to study — impressive.' : 'Complete an exam first.',
        message: attempts.length
          ? 'Take another practice and EXAMIVO will find new material to study.'
          : 'Once you complete a practice, its wrong answers become revision notes here.',
        actionLabel: attempts.length ? 'Start New Practice' : 'Start Preparing',
        onAction: () => (location.href = 'setup.html'),
      })
    );
    return;
  }

  for (const a of withMistakes.slice(0, 8)) {
    listHolder.appendChild(
      el(
        'button',
        {
          class: 'card card-hover history-item',
          onclick: () => (location.href = `study.html?attempt=${encodeURIComponent(a.id)}`),
        },
        el('span', { class: 'ri-score tabular score-mid', text: `${Math.round(a.percentage ?? 0)}%` }),
        el(
          'span',
          { class: 'hi-main' },
          el('span', { class: 'hi-title', text: `${a.config?.subject || 'Practice'} · ${examTypeLabel(a.config?.examType)}` }),
          el(
            'span',
            { class: 'hi-meta' },
            el('span', { text: a.config?.classLevel || '' }),
            el('span', { text: formatDate(a.completedAt) })
          )
        ),
        el('span', { class: 'badge badge-amber', text: `${countWrongQuick(a)} to review` })
      )
    );
  }
}

function countWrongQuick(attempt) {
  if (!attempt.questions) return 0;
  let wrong = 0;
  attempt.questions.forEach((q) => {
    const r = attempt.answers?.[q.id];
    if (r == null || r === '') { wrong++; return; }
    if ((q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'scenario') && Number(r) !== q.correctAnswer) wrong++;
    else if (q.type === 'fill_blank' && !(q.acceptedAnswers || []).includes(String(r).trim().toLowerCase())) wrong++;
    else if (q.type === 'calculation' && q.numericAnswer != null) {
      const v = parseFloat(String(r).replace(/[^0-9.\-]/g, ''));
      if (Number.isNaN(v) || Math.abs(v - q.numericAnswer) > (q.tolerance ?? 0.01)) wrong++;
    } else if (q.type === 'matching') {
      if ((q.pairs || []).some((p) => r[p.left] !== p.right)) wrong++;
    } else if (q.modelAnswer) {
      const g = attempt.graded?.[q.id];
      if (g && !g.selfReview && g.score < g.maxScore * 0.6) wrong++;
    }
  });
  return wrong;
}

/* ---------------- Session: generate + render notes ---------------- */

async function runStudySession(id) {
  let attempt = null;
  try {
    attempt = await Store.getAttempt(id);
  } catch {
    attempt = null;
  }
  if (!attempt) {
    root.querySelector('.history-head p').textContent = '';
    listHolder.innerHTML = '';
    listHolder.appendChild(
      emptyState({
        title: 'That exam could not be found.',
        message: 'It may live on another device. Open an exam from this device history instead.',
        actionLabel: 'Go to Study',
        onAction: () => (location.href = 'study.html'),
      })
    );
    return;
  }

  const wrongQuestions = collectWrong(attempt);
  const weakTopics = (attempt.weakAreas || []).map((w) => w.concept);

  if (!wrongQuestions.length && !weakTopics.length) {
    listHolder.innerHTML = '';
    listHolder.appendChild(
      emptyState({
        title: 'Nothing to fix in that exam.',
        message: 'You answered everything correctly. Run a harder practice and come back.',
        actionLabel: 'New Practice',
        onAction: () => (location.href = 'setup.html'),
      })
    );
    return;
  }

  const loading = createAILoading({
    title: 'BUILDING YOUR NEXT PRACTICE',
    subtitle: `${attempt.config?.subject || 'Study'} · revision from your mistakes`,
    stages: ['Collecting your mistakes', 'Targeting weak concepts', 'Building notes, examples & practice'],
  });
  document.body.appendChild(loading.overlay);

  try {
    loading.start(0);
    loading.done(0);
    loading.start(1, `Focusing on ${weakTopics.length || wrongQuestions.length} concept${(weakTopics.length || wrongQuestions.length) > 1 ? 's' : ''}`);
    const notes = await studyMistakes({
      config: attempt.config,
      wrongQuestions: wrongQuestions.slice(0, 12),
      weakTopics,
    });
    loading.done(1);
    loading.start(2);
    loading.done(2);
    loading.complete('Your revision notes are ready.');
    trackEvent('study_generated', { subject: attempt.config?.subject });

    const session = {
      id: `study_${Date.now().toString(36)}`,
      attemptId: attempt.id,
      config: attempt.config,
      notes,
      createdAt: Date.now(),
    };
    try {
      await Store.saveStudySession(session);
    } catch (err) {
      toast(err.message || 'Study session kept on this device.', 'warning');
    }

    await new Promise((r) => setTimeout(r, 480));
    await loading.close();
    renderNotesView(notes, attempt.id, attempt.config);
  } catch (err) {
    loading.fail(err instanceof Error && err.message.length < 200 ? err.message : null);
    await new Promise((r) => setTimeout(r, 1400));
    await loading.close();
    toast(err.message || 'EXAMIVO could not build your study session. Try again.', 'error', { duration: 4600 });
    setTimeout(() => (location.href = 'study.html'), 900);
  }
}

function collectWrong(attempt) {
  const wrong = [];
  for (const q of attempt.questions || []) {
    const r = attempt.answers?.[q.id];
    let isWrong = false;
    if (r == null || r === '') {
      isWrong = true; // unanswered counts as something to study
    } else if (q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'scenario') {
      isWrong = Number(r) !== q.correctAnswer;
    } else if (q.type === 'fill_blank') {
      isWrong = !(q.acceptedAnswers || []).includes(String(r).trim().toLowerCase());
    } else if (q.type === 'calculation' && q.numericAnswer != null) {
      const v = parseFloat(String(r).replace(/[^0-9.\-]/g, ''));
      isWrong = Number.isNaN(v) || Math.abs(v - q.numericAnswer) > (q.tolerance ?? 0.01);
    } else if (q.type === 'matching') {
      isWrong = (q.pairs || []).some((p) => r[p.left] !== p.right);
    } else {
      const g = attempt.graded?.[q.id];
      isWrong = g ? g.score < g.maxScore * 0.6 : false;
    }
    if (isWrong) {
      wrong.push({
        question: q.question,
        type: q.type,
        topic: q.topic,
        yourAnswer: typeof r === 'number' && q.options ? q.options[r] : r || '(no answer)',
        correctAnswer:
          q.options && typeof q.correctAnswer === 'number'
            ? q.options[q.correctAnswer]
            : (q.acceptedAnswers || []).join(' / ') || q.modelAnswer || q.numericAnswer ||
              (q.pairs || []).map((p) => `${p.left} → ${p.right}`).join('; '),
        explanation: q.explanation,
      });
    }
  }
  return wrong;
}

/* ---------------- Notes view ---------------- */

function renderNotesView(notes, attemptId, config) {
  document.querySelector('.history-head').innerHTML = `
    <div>
      <h1>${escapeHtml(notes?.title || 'Study Session')}</h1>
      <p>${escapeHtml(config?.subject || '')} · revision notes, examples and practice built from your mistakes.</p>
    </div>`;

  listHolder.innerHTML = '';
  const wrap = el('div', { class: 'study-notes fade-up' });

  /* Concepts */
  if (notes?.concepts?.length) {
    wrap.appendChild(el('div', { class: 'focus-tags', style: 'margin:0 0 1.6rem' }, notes.concepts.map((c) => el('span', { class: 'focus-tag priority', text: c }))));
  }

  /* Revision notes */
  for (const note of notes?.revisionNotes || []) {
    wrap.appendChild(
      el(
        'div',
        { class: 'card review-item' },
        el('h3', { style: 'font-size:1.05rem;margin-bottom:.5rem', text: note.title }),
        el('div', { class: 'rv-explanation', style: 'margin:0', text: note.body })
      )
    );
  }

  /* Examples */
  if (notes?.examples?.length) {
    wrap.appendChild(el('h2', { class: 'section-label', style: 'margin-top:1.8rem', text: 'Worked Examples' }));
    for (const ex of notes.examples) {
      const solution = el('div', { class: 'rv-explanation', style: 'display:none;margin-top:.7rem', html: `<strong>Solution:</strong> ${escapeHtml(ex.solution)}` });
      wrap.appendChild(
        el(
          'div',
          { class: 'card review-item' },
          el('p', { style: 'font-weight:500', text: ex.prompt }),
          el('button', { class: 'btn btn-secondary btn-sm', style: 'margin-top:.8rem', text: 'Show solution', onclick: (e) => { solution.style.display = 'block'; e.currentTarget.remove(); } }),
          solution
        )
      );
    }
  }

  /* Practice questions */
  if (notes?.practiceQuestions?.length) {
    wrap.appendChild(el('h2', { class: 'section-label', style: 'margin-top:1.8rem', text: 'Quick Practice' }));
    for (const pq of notes.practiceQuestions) {
      const answer = el('div', { class: 'rv-explanation', style: 'display:none;margin-top:.7rem', html: `<strong>Answer:</strong> ${escapeHtml(pq.answer)}${pq.explanation ? ` — ${escapeHtml(pq.explanation)}` : ''}` });
      wrap.appendChild(
        el(
          'div',
          { class: 'card review-item' },
          el('p', { style: 'font-weight:500', text: pq.question }),
          el('button', { class: 'btn btn-secondary btn-sm', style: 'margin-top:.8rem', text: 'Reveal answer', onclick: (e) => { answer.style.display = 'block'; e.currentTarget.remove(); } }),
          answer
        )
      );
    }
  }

  /* Actions */
  wrap.appendChild(
    el(
      'div',
      { class: 'results-actions' },
      el(
        'button',
        {
          class: 'action-card primary',
          onclick: () => {
            const weakConcepts = notes?.concepts || [];
            const configNew = {
              ...(config || {}),
              count: 10,
              focusConcepts: weakConcepts.length ? weakConcepts : null,
            };
            const analysis = {
              keyConcepts: weakConcepts,
              focus: { highPriority: weakConcepts, alsoRevise: [] },
            };
            Handoff.set('examivo.retest', { config: configNew, analysis, retestOf: attemptId });
            trackEvent('practice_repeated', { source: 'study', target: 'retest' });
            location.href = 'exam.html?retest=1';
          },
        },
        el('span', { class: 'ac-icon', text: '↻', 'aria-hidden': 'true' }),
        el('h3', { text: 'Retest Me' }),
        el('p', { text: 'A fresh exam on these exact concepts — prove it stuck.' })
      ),
      el(
        'button',
        { class: 'action-card', onclick: () => (location.href = 'study.html') },
        el('span', { class: 'ac-icon', text: '✎', 'aria-hidden': 'true' }),
        el('h3', { text: 'Study something else' }),
        el('p', { text: 'Build revision from another exam.' })
      ),
      el(
        'button',
        { class: 'action-card', onclick: () => (location.href = 'app.html') },
        el('span', { class: 'ac-icon', text: '◎', 'aria-hidden': 'true' }),
        el('h3', { text: 'Back to Dashboard' }),
        el('p', { text: 'See your overall progress.' })
      )
    )
  );

  listHolder.appendChild(wrap);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
