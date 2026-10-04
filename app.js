/* ============================================================
   EXAMIVO — Dashboard
   Every number here is computed from real attempts — never fake.
   ============================================================ */

import { renderAppShell, scoreClass } from './app-shell.js';
import { $, el, formatDate } from './utils.js';
import { Store, isGuest } from './storage.js';
import { openAuthModal, displayName } from './auth.js';
import { emptyState, toast, ICONS } from './ui.js';
import { trackEvent } from './firebase.js';
import { examTypeLabel } from './constants.js';

renderAppShell({ active: 'dashboard' });

const state = { attempts: [], weakAreas: [] };

/* ---------- Guest note ---------- */
const guestNote = $('[data-guest-note]');
if (isGuest()) {
  guestNote.hidden = false;
  $('[data-guest-signin]').addEventListener('click', () => openAuthModal());
  document.addEventListener('examivo:user', () => {
    guestNote.hidden = true;
    location.reload();
  });
}

/* ---------- Greeting ---------- */
function paintGreeting() {
  $('[data-greet-sub]').textContent = isGuest()
    ? 'You\u2019re preparing as a guest — your progress is on this device.'
    : `Welcome back, ${displayName().split(' ')[0]}. Let's sharpen your exam readiness.`;
}
paintGreeting();
document.addEventListener('examivo:user', paintGreeting);

/* ---------- Data ---------- */
async function load() {
  const recentList = $('[data-recent-list]');
  recentList.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    recentList.appendChild(el('div', { class: 'skeleton', style: `height:64px;border-radius:12px;margin-bottom:.5rem;opacity:${1 - i * 0.25}` }));
  }
  try {
    [state.attempts, state.weakAreas] = await Promise.all([Store.listAttempts(), Store.listWeakAreas()]);
  } catch (err) {
    recentList.innerHTML = '';
    recentList.appendChild(
      emptyState({
        icon: '⚠',
        title: 'Couldn’t load your practice',
        message: err.message || 'Something went wrong while reaching your saved history.',
      })
    );
    return;
  }
  paintRecent();
  paintStats();
  paintWeakAreas();
}

function paintRecent() {
  const list = $('[data-recent-list]');
  list.innerHTML = '';
  if (!state.attempts.length) {
    list.appendChild(
      emptyState({
        title: 'Your first practice starts here.',
        message: 'Upload your material and let EXAMIVO build your first practice exam.',
        actionLabel: 'Start Preparing',
        onAction: () => (location.href = 'setup.html'),
      })
    );
    return;
  }
  const frag = document.createDocumentFragment();
  for (const attempt of state.attempts.slice(0, 4)) {
    const pct = attempt.percentage ?? 0;
    frag.appendChild(
      el(
        'button',
        {
          class: 'recent-item',
          onclick: () => (location.href = `results.html?attempt=${encodeURIComponent(attempt.id)}`),
        },
        el('span', { class: `ri-score tabular ${scoreClass(pct)}`, text: `${Math.round(pct)}%` }),
        el(
          'span',
          { class: 'ri-main' },
          el('span', { class: 'ri-title', text: `${attempt.config?.subject || 'Practice'} · ${examTypeLabel(attempt.config?.examType)}` }),
          el(
            'span',
            { class: 'ri-meta' },
            el('span', { text: `${attempt.score}/${attempt.maxScore ?? attempt.totalCount ?? '—'} marks` }),
            el('span', { text: attempt.config?.classLevel || '' }),
            el('span', { text: formatDate(attempt.completedAt) })
          )
        ),
        el('span', { class: 'ri-arrow', html: ICONS.arrowRight, 'aria-hidden': 'true' })
      )
    );
  }
  list.appendChild(frag);
}

function paintStats() {
  const attempts = state.attempts;
  const set = (name, value) => {
    const node = document.querySelector(`[data-stat="${name}"]`);
    if (node) node.textContent = value;
  };
  if (!attempts.length) {
    set('avg', '–');
    set('completed', '0');
    set('strongest', '–');
    set('improve', String(state.weakAreas.filter((w) => w.status === 'needs_practice').length || 0));
    return;
  }
  const avg = attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / attempts.length;
  set('avg', `${Math.round(avg)}%`);
  set('completed', String(attempts.length));

  // Strongest subject = highest average among subjects with 1+ attempts
  const bySubject = new Map();
  for (const a of attempts) {
    const key = a.config?.subject || 'General';
    bySubject.set(key, [...(bySubject.get(key) || []), a.percentage || 0]);
  }
  let strongest = '–';
  let bestAvg = -1;
  for (const [subject, scores] of bySubject) {
    const avgS = scores.reduce((x, y) => x + y, 0) / scores.length;
    if (avgS > bestAvg) {
      bestAvg = avgS;
      strongest = subject;
    }
  }
  set('strongest', strongest);
  set('improve', String(state.weakAreas.filter((w) => w.status === 'needs_practice').length || countWeakFromAttempts()));
}

function countWeakFromAttempts() {
  const latest = state.attempts[0];
  return latest?.weakAreas?.length || 0;
}

function paintWeakAreas() {
  const list = $('[data-weak-list]');
  list.innerHTML = '';
  let areas = state.weakAreas.filter((w) => w.status === 'needs_practice');

  // Fall back to weak areas derived from the most recent attempt
  if (!areas.length && state.attempts[0]?.weakAreas?.length) {
    areas = state.attempts[0].weakAreas.map((w) => ({
      concept: w.concept || w.topic,
      subject: state.attempts[0].config?.subject,
      status: 'needs_practice',
    }));
  }

  if (!areas.length) {
    list.appendChild(
      emptyState({
        icon: '◎',
        title: state.attempts.length ? 'No weak areas right now.' : 'Weak areas appear after your first exam.',
        message: state.attempts.length
          ? 'Keep the streak going — start another practice to stay sharp.'
          : 'EXAMIVO studies every answer you give and maps the concepts that need work.',
        actionLabel: state.attempts.length ? 'Start New Practice' : null,
        onAction: () => (location.href = 'setup.html'),
      })
    );
    return;
  }

  const frag = document.createDocumentFragment();
  for (const area of areas.slice(0, 5)) {
    frag.appendChild(
      el(
        'div',
        { class: 'weak-item' },
        el(
          'div',
          {},
          el('div', { class: 'wi-name', text: area.concept }),
          el('div', { class: 'wi-meta', text: area.subject ? `${area.subject}` : 'Concept needs practice' })
        ),
        el('span', { class: 'badge badge-amber', text: 'Needs Practice' })
      )
    );
  }
  list.appendChild(frag);
}

/* ---------- Actions ---------- */
$('[data-start-practice]').addEventListener('click', () => {
  trackEvent('practice_started', { source: 'dashboard' });
  location.href = 'setup.html';
});
$('[data-practice-weak]').addEventListener('click', () => {
  trackEvent('practice_repeated', { source: 'weak_areas' });
  location.href = 'setup.html?focus=weakareas';
});

trackEvent('app_opened', { page: 'dashboard' });
load();
