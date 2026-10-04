/* ============================================================
   EXAMIVO — Question rendering & interaction
   Pure DOM. No frameworks. Every question type from the spec:
   MC, True/False, Fill-blank, Short answer, Theory, Essay,
   Calculation, Scenario, Matching.
   ============================================================ */

import { el, escapeHtml } from './utils.js';
import { QUESTION_TYPE_LABELS } from './constants.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function isAnswered(q, response) {
  if (response == null) return false;
  if (q.type === 'matching') return response && Object.keys(response).length > 0;
  if (typeof response === 'string') return response.trim().length > 0;
  return true;
}

export function responseValue(q, response) {
  return response ?? '';
}

/**
 * Render a question into a container.
 * opts:
 *   response      — current response for this question
 *   onResponse(v) — called when the student changes their answer
 *   practice      — practice mode (immediate feedback)
 *   revealed      — show correctness (practice mode after answering / review)
 *   review        — review mode (locked, show everything)
 */
export function renderQuestion(container, q, opts = {}) {
  const { response = null, onResponse = () => {}, practice = false, revealed = false, review = false } = opts;

  container.innerHTML = '';

  const typeBadge = el('span', { class: 'badge badge-neutral', text: QUESTION_TYPE_LABELS[q.type] || 'Question' });
  const diffBadge = el('span', {
    class: `badge ${q.difficulty === 'hard' || q.difficulty === 'exam_level' ? 'badge-red' : q.difficulty === 'easy' ? 'badge-green' : 'badge-amber'}`,
    text: String(q.difficulty || 'medium').replace('_', ' '),
  });

  const topLine = el(
    'div',
    { class: 'q-topline' },
    el('span', { class: 'q-count', text: q.displayIndex ? `Question ${q.displayIndex}` : 'Question' }),
    el('span', { class: 'q-tags' }, typeBadge, diffBadge)
  );

  const qText = el('h2', { class: 'q-text', text: q.question });
  const qBody = el('div', { class: 'q-body' });

  switch (q.type) {
    case 'multiple_choice':
    case 'true_false':
    case 'scenario':
      renderChoice(qBody, q, response, opts);
      break;
    case 'fill_blank':
      renderFill(qBody, q, response, opts);
      break;
    case 'calculation':
      renderCalc(qBody, q, response, opts);
      break;
    case 'short_answer':
    case 'theory':
    case 'essay':
      renderOpen(qBody, q, response, opts);
      break;
    case 'matching':
      renderMatching(qBody, q, response, opts);
      break;
    default:
      renderChoice(qBody, q, response, opts);
  }

  container.append(topLine, qText, qBody);
}

/* ---------- Option-based (MC / TF / Scenario) ---------- */

function renderChoice(host, q, response, { onResponse, practice, revealed, review }) {
  const list = el('div', { class: 'options', role: 'radiogroup', 'aria-label': 'Answer options' });

  q.options.forEach((opt, idx) => {
    const isSelected = response === idx;
    const isCorrect = revealed && idx === q.correctAnswer;
    const isWrongPick = revealed && isSelected && idx !== q.correctAnswer;

    const btn = el(
      'button',
      {
        class: `option${isSelected ? ' selected' : ''}${isCorrect ? ' correct' : ''}${isWrongPick ? ' wrong' : ''}`,
        role: 'radio',
        'aria-checked': String(isSelected),
        disabled: revealed || review,
        onclick: () => {
          if (revealed || review) return;
          list.querySelectorAll('.option').forEach((o) => o.classList.remove('selected'));
          btn.classList.add('selected', 'select-pop');
          btn.setAttribute('aria-checked', 'true');
          onResponse(idx);
        },
      },
      el('span', { class: 'o-marker', text: LETTERS[idx] || String(idx + 1), 'aria-hidden': 'true' }),
      el('span', { text: opt })
    );
    list.appendChild(btn);
  });

  host.appendChild(list);

  if (practice && response != null && !review) {
    const correct = response === q.correctAnswer;
    host.appendChild(practiceFeedback(correct, q, response));
  }
  if (revealed && !practice) {
    // review-mode annotations are rendered by results.js
  }
}

/* ---------- Fill in the blank ---------- */

function renderFill(host, q, response, { onResponse, practice, revealed, review }) {
  const input = el('input', {
    class: 'answer-input',
    type: 'text',
    value: responseValue(q, response),
    placeholder: 'Type your answer…',
    'aria-label': 'Your answer',
    disabled: revealed || review,
  });
  input.addEventListener('input', () => onResponse(input.value));
  host.append(input, el('p', { class: 'answer-hint', text: 'Spelling matters — type the term exactly.' }));

  if ((practice || revealed) && response) {
    const norm = String(response).trim().toLowerCase();
    const correct = q.acceptedAnswers?.some((a) => a === norm);
    if (practice && !review) host.appendChild(practiceFeedback(correct, q, response));
  }
}

/* ---------- Calculation ---------- */

function renderCalc(host, q, response, { onResponse, practice, revealed, review }) {
  // If the AI provided options, render as choice; otherwise numeric input.
  if (q.options?.length) return renderChoice(host, q, response, { onResponse, practice, revealed, review });

  const input = el('input', {
    class: 'answer-number tabular',
    type: 'text',
    inputmode: 'decimal',
    value: responseValue(q, response),
    placeholder: 'e.g. 42.5',
    'aria-label': 'Your calculated answer',
    disabled: revealed || review,
  });
  input.addEventListener('input', () => onResponse(input.value));
  host.append(
    input,
    el('p', { class: 'answer-hint', text: 'Give the final value. Small rounding differences are accepted.' })
  );

  if ((practice || revealed) && response) {
    const value = parseFloat(String(response).replace(/[^0-9.\-]/g, ''));
    const correct = !Number.isNaN(value) && q.numericAnswer != null && Math.abs(value - q.numericAnswer) <= (q.tolerance ?? 0.01);
    if (practice && !review) host.appendChild(practiceFeedback(correct, q, response));
  }
}

/* ---------- Open-ended (short / theory / essay) ---------- */

function renderOpen(host, q, response, { onResponse, practice, revealed, review, graded, showModel }) {
  const area = el('textarea', {
    class: 'answer-area',
    value: responseValue(q, response),
    placeholder:
      q.type === 'essay'
        ? 'Write your full answer. Structure it: points, explanation, examples.'
        : q.type === 'theory'
          ? 'Explain in clear points. Definitions and examples earn marks.'
          : 'Give a brief answer — one or two sentences.',
    'aria-label': 'Your written answer',
    disabled: revealed || review,
  });
  area.addEventListener('input', () => onResponse(area.value));
  host.append(area);

  if (showModel && !graded) {
    host.appendChild(
      el(
        'div',
        { class: 'practice-feedback' },
        el('div', { class: 'pf-head', style: 'color:var(--primary-strong)' }, el('span', { text: '◈ Model answer' })),
        el('div', { class: 'pf-body', text: q.modelAnswer || '' }),
        q.explanation ? el('div', { class: 'pf-answer', html: `<strong>Why:</strong> ${escapeHtml(q.explanation)}` }) : null,
        el('div', { class: 'pf-answer', style: 'color:var(--text-muted)', text: 'Compare it with what you wrote — this exact answer gets graded at submission.' })
      )
    );
  }

  if (graded) {
    host.appendChild(
      el(
        'div',
        { class: `practice-feedback ${graded.score >= graded.maxScore * 0.6 ? 'correct' : 'incorrect'}` },
        el(
          'div',
          { class: `pf-head ${graded.score >= graded.maxScore * 0.6 ? 'correct' : 'incorrect'}` },
          el('span', { text: graded.score >= graded.maxScore * 0.6 ? '✓' : '×' }),
          el('span', { text: `${graded.score} / ${graded.maxScore} marks` })
        ),
        graded.feedback ? el('div', { class: 'pf-body', text: graded.feedback }) : null,
        el('div', { class: 'pf-answer', html: `<strong>Model answer:</strong> ${escapeHtml(q.modelAnswer || '')}` })
      )
    );
  }
}

/* ---------- Matching ---------- */

function renderMatching(host, q, response, { onResponse, practice, revealed, review }) {
  const rights = shuffleStable(q.pairs.map((p) => p.right));
  const wrap = el('div', { class: 'matching' });
  const current = response || {};

  q.pairs.forEach((pair, i) => {
    const select = el(
      'select',
      { class: 'select', 'aria-label': `Match "${pair.left}"`, disabled: revealed || review },
      el('option', { value: '', text: 'Choose…' }),
      rights.map((r) => el('option', { value: r, text: r, selected: current[pair.left] === r ? true : null }))
    );
    select.addEventListener('change', () => {
      const next = { ...current };
      if (select.value) next[pair.left] = select.value;
      else delete next[pair.left];
      onResponse(next);
    });
    wrap.appendChild(
      el('div', { class: 'match-row' }, el('div', { class: 'm-left', text: `${i + 1}. ${pair.left}` }), select)
    );
  });

  host.append(wrap, el('p', { class: 'answer-hint', text: 'Match each item on the left with the right option.' }));

  if ((practice || revealed) && response && Object.keys(response).length) {
    const correctPairs = q.pairs.filter((p) => response[p.left] === p.right).length;
    if (practice && !review)
      host.appendChild(practiceFeedback(correctPairs === q.pairs.length, q, `${correctPairs} / ${q.pairs.length} matched`));
  }
}

function shuffleStable(arr) {
  return [...arr].sort((a, b) => (a < b ? -0.5 : a > b ? 0.5 : 0) + (Math.random() - 0.5) * 0.01).map((x) => x);
}

/* ---------- Practice feedback ---------- */

function practiceFeedback(correct, q, response) {
  const answerText =
    q.type === 'matching'
      ? q.pairs.map((p) => `${p.left} → ${p.right}`).join(' · ')
      : q.type === 'fill_blank'
        ? q.acceptedAnswers.join(' / ')
        : q.type === 'calculation' && q.numericAnswer != null
          ? String(q.numericAnswer)
          : typeof q.correctAnswer === 'number' && q.options
            ? `${LETTERS[q.correctAnswer]}. ${q.options[q.correctAnswer]}`
            : '';

  return el(
    'div',
    { class: `practice-feedback ${correct ? 'correct' : 'incorrect'}` },
    el(
      'div',
      { class: `pf-head ${correct ? 'correct' : 'incorrect'}` },
      el('span', { text: correct ? '✓ Correct' : '× Not quite' })
    ),
    el('div', { class: 'pf-body', text: q.explanation || '' }),
    answerText
      ? el('div', { class: 'pf-answer', html: `<strong>Answer:</strong> ${escapeHtml(answerText)}` })
      : null
  );
}
