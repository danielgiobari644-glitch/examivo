/* ============================================================
   EXAMIVO — History
   ============================================================ */

import { renderAppShell, scoreClass } from './app-shell.js';
import { $, el, formatDate } from './utils.js';
import { Store, isGuest } from './storage.js';
import { emptyState, confirmModal, toast } from './ui.js';
import { examTypeLabel } from './constants.js';
import { trackEvent } from './firebase.js';

renderAppShell({ active: 'history' });

let attempts = [];
let subjectFilter = '';

const listEl = $('[data-history-list]');

async function load() {
  listEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    listEl.appendChild(el('div', { class: 'skeleton', style: 'height:88px;border-radius:16px' }));
  }
  try {
    attempts = await Store.listAttempts();
  } catch (err) {
    listEl.innerHTML = '';
    listEl.appendChild(emptyState({ icon: '⚠', title: 'Couldn’t load history', message: err.message }));
    return;
  }
  buildFilter();
  paint();
}

function buildFilter() {
  const select = $('[data-filter-subject]');
  const subjects = [...new Set(attempts.map((a) => a.config?.subject).filter(Boolean))];
  select.innerHTML = '<option value="">All subjects</option>';
  for (const s of subjects) select.appendChild(el('option', { value: s, text: s }));
  select.addEventListener('change', () => {
    subjectFilter = select.value;
    paint();
  });
}

function paint() {
  listEl.innerHTML = '';
  const filtered = subjectFilter ? attempts.filter((a) => a.config?.subject === subjectFilter) : attempts;

  if (!filtered.length) {
    listEl.appendChild(
      emptyState({
        title: attempts.length ? 'Nothing for this subject yet.' : 'No exams yet.',
        message: attempts.length
          ? 'Try another subject filter, or start a new practice.'
          : 'Your completed practices will appear here with scores and review links.',
        actionLabel: attempts.length ? null : 'Start Preparing',
        onAction: () => (location.href = 'setup.html'),
      })
    );
    return;
  }

  for (const attempt of filtered) {
    const pct = attempt.percentage ?? 0;
    const row = el(
      'button',
      {
        class: 'card card-hover history-item',
        onclick: () => (location.href = `results.html?attempt=${encodeURIComponent(attempt.id)}`),
      },
      el('span', { class: `ri-score tabular ${scoreClass(pct)}`, text: `${Math.round(pct)}%` }),
      el(
        'span',
        { class: 'hi-main' },
        el('span', { class: 'hi-title', text: `${attempt.config?.subject || 'Practice'} · ${examTypeLabel(attempt.config?.examType)}` }),
        el(
          'span',
          { class: 'hi-meta' },
          el('span', { text: attempt.config?.classLevel || '' }),
          el('span', { text: `${attempt.score}/${attempt.maxScore} marks` }),
          el('span', { text: attempt.mode === 'practice' ? 'Practice Mode' : 'Exam Mode' }),
          el('span', { text: formatDate(attempt.completedAt) })
        )
      ),
      el(
        'span',
        { class: 'hi-right' },
        el('span', { class: 'badge badge-neutral', text: `${attempt.totalCount ?? attempt.questions?.length ?? '—'} Qs` })
      )
    );
    listEl.appendChild(row);
  }

  if (isGuest()) {
    listEl.appendChild(
      el(
        'div',
        { class: 'guest-note', style: 'margin-top:1.4rem' },
        el('span', { text: '✦' }),
        el('span', { text: 'This history lives in this browser only. Create an account to keep it forever, on every device.' })
      )
    );
  }
}

/* Long-press / right click delete? Keep it simple: a delete control per row is
   noise; instead offer "Clear guest data" for guests via the row's context. */
listEl.addEventListener('contextmenu', async (e) => {
  const row = e.target.closest('.history-item');
  if (!row || !isGuest()) return;
  e.preventDefault();
  const idx = [...listEl.querySelectorAll('.history-item')].indexOf(row);
  const attempt = (subjectFilter ? attempts.filter((a) => a.config?.subject === subjectFilter) : attempts)[idx];
  const ok = await confirmModal({
    title: 'Delete this attempt?',
    message: 'This removes the result from this device. It cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (ok) {
    await Store.deleteAttempt(attempt.id);
    toast('Attempt deleted.', 'success');
    load();
  }
});

trackEvent('app_opened', { page: 'history' });
load();
