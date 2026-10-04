/* ============================================================
   EXAMIVO — Results: reveal, review, weak-area engine, next steps
   ============================================================ */

import { $, el, escapeHtml, formatDate, formatTime, queryFlag } from './utils.js';
import { createThemeToggle, toast, emptyState } from './ui.js';
import { Store, isGuest } from './storage.js';
import { promptForAccount } from './auth.js';
import { Handoff } from './utils.js';
import { trackEvent } from './firebase.js';
import { examTypeLabel, QUESTION_TYPE_LABELS } from './constants.js';

createThemeToggle(document.querySelector('[data-theme-toggle]'));

const root = $('[data-results-root]');
let attempt = null;
let reviewFilter = 'all';

/* ---------------- Load ---------------- */

async function load() {
  const id = queryFlag('attempt');
  try {
    attempt = (id && (await Store.getAttempt(id))) || Handoff.take('examivo.lastAttempt');
  } catch {
    attempt = Handoff.take('examivo.lastAttempt');
  }

  if (!attempt?.questions?.length) {
    root.innerHTML = '';
    root.appendChild(
      emptyState({
        title: 'That result is not available.',
        message: 'It may have been completed on another device, or saved before you signed in. Start a fresh practice instead.',
        actionLabel: 'Start New Practice',
        onAction: () => (location.href = 'setup.html'),
      })
    );
    return;
  }
  render();
}

/* ---------------- Render ---------------- */

function render() {
  root.innerHTML = '';
  const cfg = attempt.config || {};

  /* Guest save banner */
  if (isGuest()) {
    const banner = el(
      'div',
      { class: 'save-banner fade-up' },
      el('p', { html: `<strong>Keep this result forever.</strong> Create a free account and your scores, weak areas and study sessions sync to your profile.` }),
      el('button', {
        class: 'btn btn-primary btn-sm',
        text: 'Save my progress',
        onclick: () => promptForAccount(null, () => location.reload()),
      })
    );
    root.appendChild(banner);
  }

  /* ---- Score hero ---- */
  const pct = attempt.percentage ?? 0;
  const band = pct >= 70 ? 'hi' : pct >= 50 ? 'mid' : 'low';
  const verdict =
    pct >= 85
      ? 'Outstanding — exam ready.'
      : pct >= 70
        ? 'Strong performance. Polish the weak spots below.'
        : pct >= 50
          ? 'Solid foundation. The gaps below are your fastest wins.'
          : 'This is exactly where improvement starts. Focus on your weak areas.';

  const R = 80;
  const CIRC = 2 * Math.PI * R;
  const ring = el(
    'div',
    { class: 'score-ring-wrap' },
    el(
      'svg',
      { width: '190', height: '190', viewBox: '0 0 190 190', 'aria-hidden': 'true' },
      el('circle', { class: 'score-ring-bg', cx: '95', cy: '95', r: String(R), fill: 'none', 'stroke-width': '11' }),
      el('circle', {
        class: `score-ring-fg band-${band}`,
        cx: '95',
        cy: '95',
        r: String(R),
        fill: 'none',
        'stroke-width': '11',
        'stroke-dasharray': String(CIRC),
        'stroke-dashoffset': String(CIRC),
        'data-ring': '',
      })
    ),
    el(
      'div',
      { class: 'score-center' },
      el('div', { class: 'score-value tabular' }, el('span', { 'data-count': '', text: '0' }), el('small', { text: '%' })),
      el('div', { class: 'score-caption', html: `<strong>${attempt.score}</strong> / ${attempt.maxScore} marks` })
    )
  );

  const correctLine =
    attempt.totalCount != null
      ? `${attempt.correctCount ?? '?'}/${attempt.totalCount} questions correct`
      : '';

  root.appendChild(
    el(
      'section',
      { class: 'score-hero' },
      ring,
      el('h1', { class: 'sr-only', text: 'Your results' }),
      el('p', { class: 'score-caption', text: correctLine }),
      el('p', { class: 'score-caption', style: 'color:var(--text-muted);font-size:.88rem', text: `${cfg.subject || 'Practice'} · ${examTypeLabel(cfg.examType)} · ${cfg.classLevel || ''} · ${formatDate(attempt.completedAt)}${attempt.durationSec ? ` · ${formatTime(attempt.durationSec)}` : ''}` }),
      el('div', { class: 'score-verdict' }, el('span', { class: `badge ${band === 'hi' ? 'badge-green' : band === 'mid' ? 'badge-amber' : 'badge-red'}`, text: verdict }))
    )
  );

  /* Animate the number + ring after paint */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const ringEl = root.querySelector('[data-ring]');
      const offset = CIRC * (1 - Math.min(pct, 100) / 100);
      if (ringEl) ringEl.style.strokeDashoffset = String(offset);
      animateCount(root.querySelector('[data-count]'), pct, 1500);
    });
  });

  /* ---- Performance bands ---- */
  const topics = attempt.topicStats || [];
  const strong = topics.filter((t) => t.pct != null && t.pct >= 75);
  const practice = topics.filter((t) => t.pct != null && t.pct >= 50 && t.pct < 75);
  const weak = topics.filter((t) => t.pct != null && t.pct < 50);

  const bandList = (items, emptyText) =>
    items.length
      ? el(
          'ul',
          {},
          items.map((t) =>
            el('li', {}, el('span', { text: t.topic }), el('span', { class: 'pct tabular', text: `${t.pct}%` }))
          )
        )
      : el('span', { class: 'none', text: emptyText });

  root.appendChild(
    el(
      'section',
      { class: 'bands' },
      el(
        'div',
        { class: 'card band strong fade-up' },
        el('div', { class: 'band-head' }, el('span', { class: 'dot' }), el('h3', { text: 'Strong Areas' })),
        bandList(strong, 'Nothing above 75% yet — that changes today.')
      ),
      el(
        'div',
        { class: 'card band practice fade-up' },
        el('div', { class: 'band-head' }, el('span', { class: 'dot' }), el('h3', { text: 'Areas to Practice' })),
        bandList(practice, 'No middle-ground topics in this exam.')
      ),
      el(
        'div',
        { class: 'card band weak fade-up' },
        el('div', { class: 'band-head' }, el('span', { class: 'dot' }), el('h3', { text: 'Weak Areas' })),
        bandList(weak, 'Nothing below 50% — excellent consistency.')
      )
    )
  );

  /* ---- Weak area engine ---- */
  if (attempt.weakAreas?.length) {
    root.appendChild(
      el(
        'section',
        { class: 'weak-engine' },
        el(
          'div',
          { class: 'we-head' },
          el('h2', {}, `EXAMIVO found ${attempt.weakAreas.length} area${attempt.weakAreas.length > 1 ? 's' : ''} to strengthen.`),
          el('span', { text: 'Derived from your actual answers in this exam.' })
        ),
        el(
          'div',
          { class: 'weak-cards' },
          attempt.weakAreas.map((w) =>
            el(
              'div',
              { class: `card weak-card status-${w.status || 'weak'} fade-up` },
              el(
                'div',
                { class: 'wc-top' },
                el('span', { class: 'wc-name', text: w.concept }),
                el('span', { class: `badge ${w.status === 'weak' ? 'badge-red' : 'badge-amber'}`, text: w.status === 'weak' ? 'Weak' : 'Needs Practice' })
              ),
              el('div', { class: 'wc-evidence', text: w.evidence || 'Missed questions mapped to this concept.' }),
              el('div', { class: 'wc-bar' }, el('i', { style: `width:${Math.max(w.pct ?? 0, 4)}%` }))
            )
          )
        )
      )
    );
  }

  /* ---- Question review ---- */
  const review = buildReview();
  root.appendChild(review);

  /* ---- Actions ---- */
  const hasWeak = (attempt.weakAreas?.length || 0) > 0;
  const actions = el(
    'div',
    { class: 'results-actions' },
    actionCard({
      cls: 'primary',
      icon: '◎',
      title: 'Practice My Weak Areas',
      desc: hasWeak
        ? `A fresh exam targeting: ${attempt.weakAreas.slice(0, 3).map((w) => w.concept).join(', ')}`
        : 'A fresh exam targeting your shakiest concepts.',
      onclick: () => {
        trackEvent('practice_repeated', { source: 'results', target: 'weak_areas' });
        location.href = 'setup.html?focus=weakareas';
      },
    }),
    actionCard({
      icon: '✎',
      title: 'Study My Mistakes',
      desc: 'Revision notes, key concepts and examples built from what you got wrong.',
      onclick: () => {
        trackEvent('study_started', { attempt: attempt.id });
        location.href = `study.html?attempt=${encodeURIComponent(attempt.id)}`;
      },
    }),
    actionCard({
      icon: '↻',
      title: 'Retest Me',
      desc: 'A new attempt at the same format — different questions, same standards.',
      onclick: () => {
        stageRetest();
      },
    })
  );
  root.appendChild(actions);

  root.appendChild(
    el(
      'div',
      { class: 'results-secondary' },
      el('button', { class: 'btn btn-ghost', text: 'Back to Dashboard', onclick: () => (location.href = 'app.html') }),
      el('button', {
        class: 'btn btn-ghost',
        text: 'Review full history',
        onclick: () => (location.href = 'history.html'),
      })
    )
  );
}

function actionCard({ cls = '', icon, title, desc, onclick }) {
  return el(
    'button',
    { class: `action-card ${cls}`, onclick },
    el('span', { class: 'ac-icon', text: icon, 'aria-hidden': 'true' }),
    el('h3', { text: title }),
    el('p', { text: desc })
  );
}

/* ---------------- Count-up ---------------- */

function animateCount(node, target, duration) {
  if (!node) return;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = String(Math.round(eased * target));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------------- Review ---------------- */

function buildReview() {
  const section = el('section', { class: 'review-section' });
  const listHolder = el('div', {});
  const wrongCount = attempt.questions.filter((q, i) => verdictFor(i) === 'wrong').length;

  const filters = el(
    'div',
    { class: 'review-filter' },
    ['all', 'wrong', 'flagged'].map((f) =>
      el('button', {
        class: `chip${reviewFilter === f ? ' selected' : ''}`,
        text: f === 'all' ? `All (${attempt.questions.length})` : f === 'wrong' ? `Wrong (${wrongCount})` : `Flagged (${attempt.flagged?.length || 0})`,
        'aria-pressed': String(reviewFilter === f),
        onclick: (e) => {
          reviewFilter = f;
          filters.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
          e.currentTarget.classList.add('selected');
          paintList();
        },
      })
    )
  );

  section.appendChild(
    el(
      'div',
      { class: 'review-head' },
      el('h2', { text: 'Question Review' }),
      filters
    )
  );
  section.appendChild(listHolder);

  function verdictFor(i) {
    const q = attempt.questions[i];
    const response = attempt.answers?.[q.id];
    if (response == null || response === '') return 'skipped';
    if (q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'scenario') {
      return Number(response) === q.correctAnswer ? 'right' : 'wrong';
    }
    if (q.type === 'fill_blank') {
      return (q.acceptedAnswers || []).includes(String(response).trim().toLowerCase()) ? 'right' : 'wrong';
    }
    if (q.type === 'calculation' && q.numericAnswer != null) {
      const v = parseFloat(String(response).replace(/[^0-9.\-]/g, ''));
      return !Number.isNaN(v) && Math.abs(v - q.numericAnswer) <= (q.tolerance ?? 0.01) ? 'right' : 'wrong';
    }
    if (q.type === 'matching') {
      const correct = (q.pairs || []).filter((p) => response[p.left] === p.right).length;
      return correct === q.pairs.length ? 'right' : correct > 0 ? 'partial' : 'wrong';
    }
    const g = attempt.graded?.[q.id];
    if (g?.selfReview) return 'partial';
    return g && g.score >= g.maxScore * 0.6 ? 'right' : 'wrong';
  }

  function responseText(q, response) {
    if (response == null || response === '') return '— (no answer)';
    if (typeof response === 'number' && q.options) {
      const letter = ['A', 'B', 'C', 'D', 'E', 'F'][response] || response + 1;
      return `${letter}. ${q.options[response]}`;
    }
    if (q.type === 'matching') {
      return Object.entries(response)
        .map(([l, r]) => `${l} → ${r}`)
        .join(' · ');
    }
    return String(response);
  }

  function correctText(q) {
    if (q.options && (q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'scenario')) {
      const letter = ['A', 'B', 'C', 'D', 'E', 'F'][q.correctAnswer] || '';
      return `${letter}. ${q.options[q.correctAnswer]}`;
    }
    if (q.type === 'fill_blank') return (q.acceptedAnswers || []).join(' / ');
    if (q.type === 'calculation') return q.numericAnswer != null ? String(q.numericAnswer) : 'See explanation';
    if (q.type === 'matching') return (q.pairs || []).map((p) => `${p.left} → ${p.right}`).join(' · ');
    return q.modelAnswer || '';
  }

  function paintList() {
    listHolder.innerHTML = '';
    const items = attempt.questions
      .map((q, i) => ({ q, i, verdict: verdictFor(i) }))
      .filter(({ q, verdict }) => {
        if (reviewFilter === 'wrong') return verdict === 'wrong' || verdict === 'skipped';
        if (reviewFilter === 'flagged') return attempt.flagged?.includes(q.id);
        return true;
      });

    if (!items.length) {
      listHolder.appendChild(
        emptyState({
          title: reviewFilter === 'wrong' ? 'Nothing wrong here.' : 'Nothing flagged.',
          message: reviewFilter === 'wrong' ? 'Every answered question was correct. Sit another one to stay sharp.' : 'Flag questions during an exam to find them here.',
        })
      );
      return;
    }

    for (const { q, i, verdict } of items) {
      const graded = attempt.graded?.[q.id];
      const item = el(
        'article',
        { class: `card review-item ${verdict === 'right' ? 'right' : verdict === 'wrong' || verdict === 'skipped' ? 'wrong' : ''} fade-up` },
        el(
          'div',
          { class: 'rv-top' },
          el('span', { class: 'q-count', text: `Q${i + 1}` }),
          el(
            'span',
            {
              class: `rv-verdict ${verdict === 'right' ? 'v-right' : verdict === 'wrong' || verdict === 'skipped' ? 'v-wrong' : 'v-partial'}`,
              text: verdict === 'right' ? '✓ Correct' : verdict === 'skipped' ? '× Not answered' : verdict === 'partial' ? '◐ Partial' : '× Wrong',
            }
          ),
          el('span', { class: 'badge badge-neutral', text: q.topic || 'General' }),
          el('span', { class: 'badge badge-neutral', text: QUESTION_TYPE_LABELS[q.type] || q.type }),
          (attempt.flagged || []).includes(q.id) ? el('span', { class: 'badge badge-amber', text: '⚑ Was flagged' }) : null
        ),
        el('p', { class: 'rv-q', text: q.question }),
        el(
          'div',
          { class: 'rv-rows' },
          el(
            'div',
            { class: 'rv-row' },
            el('span', { class: 'label', text: 'Your answer' }),
            el('span', { class: `you ${verdict === 'right' ? 'right-text' : verdict === 'wrong' || verdict === 'skipped' ? 'wrong-text' : ''}`, text: responseText(q, attempt.answers?.[q.id]) })
          ),
          verdict !== 'right'
            ? el(
                'div',
                { class: 'rv-row' },
                el('span', { class: 'label', text: 'Correct answer' }),
                el('span', { class: 'right-text', style: 'color:var(--success)', text: correctText(q) })
              )
            : null,
          graded && !graded.selfReview && graded.feedback
            ? el(
                'div',
                { class: 'rv-row' },
                el('span', { class: 'label', text: `EXAMIVO grading — ${graded.score}/${graded.maxScore} marks` }),
                el('span', { text: graded.feedback })
              )
            : null,
          graded?.selfReview
            ? el('div', { class: 'rv-row' }, el('span', { class: 'label', text: 'Open question' }), el('span', { text: 'Compare your answer with the model answer below — judge it honestly.' }))
            : null
        ),
        el('div', { class: 'rv-explanation', html: `<strong>Why:</strong> ${escapeHtml(q.explanation || '')}` }),
        q.modelAnswer && q.type !== 'multiple_choice' && q.type !== 'true_false'
          ? el('div', { class: 'rv-model', html: `<strong>Model answer:</strong> ${escapeHtml(q.modelAnswer)}` })
          : null
      );
      listHolder.appendChild(item);
    }
  }

  paintList();
  return section;
}

/* ---------------- Retest ---------------- */

function stageRetest() {
  const weakConcepts = (attempt.weakAreas || []).map((w) => w.concept);
  const config = {
    ...attempt.config,
    count: Math.min(attempt.config.count || 10, 10),
    focusConcepts: weakConcepts.length ? weakConcepts : null,
  };
  const analysis = {
    keyConcepts: attempt.strongAreas?.map((s) => s.concept) || [],
    focus: { highPriority: weakConcepts, alsoRevise: [] },
    blueprint: attempt.blueprint || null,
  };
  Handoff.set('examivo.retest', { config, analysis, retestOf: attempt.id });
  trackEvent('practice_repeated', { source: 'results', target: 'retest' });
  location.href = 'exam.html?retest=1';
}

/* ---------------- Boot ---------------- */

load();
