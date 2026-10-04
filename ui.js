/* ============================================================
   EXAMIVO — UI kit: theme, toasts, modals, AI states, transitions
   ============================================================ */

import { $, el } from './utils.js';
import { STORAGE_KEYS } from './constants.js';

/* ============================================================
   THEME — dark (default) / light / system, remembered locally
   ============================================================ */

const themeMeta = document.createElement('meta');
themeMeta.name = 'theme-color';
document.head.appendChild(themeMeta);

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(mode) {
  return mode === 'system' ? systemTheme() : mode;
}

export function getTheme() {
  return localStorage.getItem(STORAGE_KEYS.theme) || 'dark';
}

/* Apply the remembered theme as early as this module loads. */
applyTheme();

export function applyTheme() {
  const mode = getTheme();
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  themeMeta.content = resolved === 'light' ? '#f5f6f9' : '#0a0b10';
  return resolved;
}

export function setTheme(mode) {
  localStorage.setItem(STORAGE_KEYS.theme, mode);
  applyTheme();
  document.dispatchEvent(new CustomEvent('examivo:theme', { detail: { mode, resolved: resolveTheme(mode) } }));
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (getTheme() === 'system') applyTheme();
});

/** Theme cycle control (dark → light → system). Returns current mode. */
export function createThemeToggle(button) {
  const ICONS = {
    dark:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
    light:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    system:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>',
  };
  const LABEL = { dark: 'Dark', light: 'Light', system: 'System' };
  const render = () => {
    const mode = getTheme();
    button.innerHTML = ICONS[mode] + `<span class="theme-label">${LABEL[mode]}</span>`;
    button.setAttribute('aria-label', `Theme: ${LABEL[mode]}. Click to change.`);
    button.dataset.mode = mode;
  };
  render();
  button.addEventListener('click', () => {
    const order = ['dark', 'light', 'system'];
    const next = order[(order.indexOf(getTheme()) + 1) % order.length];
    setTheme(next);
    render();
  });
  document.addEventListener('examivo:theme', render);
}

/* ============================================================
   AI INTELLIGENCE CORE — the reusable EXAMIVO AI visual
   States: idle | reading | thinking | analyzing | generating |
           checking | complete | error
   ============================================================ */

const CORE_SVG = `
<svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
  <g class="ring ring-1">
    <circle cx="50" cy="50" r="44" stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="2.5 7" stroke-linecap="round"/>
    <circle cx="50" cy="6" r="2.4" fill="var(--primary-strong)"/>
  </g>
  <g class="ring ring-2">
    <circle cx="50" cy="50" r="32" stroke="var(--primary)" stroke-opacity="0.4" stroke-width="1.1" stroke-dasharray="14 8" stroke-linecap="round"/>
    <circle cx="82" cy="50" r="2" fill="var(--primary-strong)" fill-opacity="0.9"/>
  </g>
  <g class="ring ring-3">
    <circle cx="50" cy="50" r="20.5" stroke="var(--primary)" stroke-opacity="0.85" stroke-width="1.4"/>
    <circle cx="36.5" cy="62.5" r="1.6" fill="var(--primary-strong)" fill-opacity="0.75"/>
  </g>
  <g class="core-dot">
    <circle cx="50" cy="50" r="9" fill="var(--background)"/>
    <circle cx="50" cy="50" r="6.6" fill="var(--primary)"/>
    <circle cx="47.9" cy="47.9" r="1.9" fill="#f0fdfa"/>
  </g>
</svg>`;

export function createAICore({ size = 96, state = 'idle', label = '' } = {}) {
  const core = el('div', {
    class: 'ai-core',
    dataset: { state },
    role: 'img',
    'aria-label': label || `EXAMIVO intelligence core, ${state}`,
  });
  core.style.setProperty('--core-size', typeof size === 'number' ? `${size}px` : size);
  core.innerHTML = `<div class="halo"></div><div class="core-orbits">${CORE_SVG}</div>`;
  return core;
}

/** Update an existing .ai-core element's state. */
export function setAIState(coreEl, state) {
  if (!coreEl) return;
  coreEl.dataset.state = state;
  coreEl.setAttribute('aria-label', `EXAMIVO intelligence core, ${state}`);
}

/** renderAIStatus — the shared status line used across the app. */
export function renderAIStatus(container, state, text) {
  if (!container) return;
  container.dataset.state = state;
  container.innerHTML = '';
  const line = el(
    'span',
    { class: 'ai-status-line', dataset: { state } },
    el('span', { class: 'pulse-dot', 'aria-hidden': 'true' }),
    el('span', { text: text || state })
  );
  container.appendChild(line);
}

/* ============================================================
   AI LOADING OVERLAY — full-screen staged experience
   Driven by REAL pipeline progress: a stage only completes when
   the corresponding work actually completes.
   ============================================================ */

export function createAILoading({ title = 'EXAMIVO IS THINKING', subtitle = '', stages = [] } = {}) {
  const overlay = el('div', { class: 'ai-overlay', role: 'status', 'aria-live': 'polite' });
  const core = createAICore({ size: 120, state: 'idle' });
  const stageEls = stages.map((label) =>
    el('div', { class: 'ai-stage' }, el('span', { class: 's-icon', 'aria-hidden': 'true' }), el('span', { text: label }))
  );
  const subEl = el('p', { class: 'ai-overlay-sub', text: subtitle });
  const stagesEl = el('div', { class: 'ai-stages' }, stageEls);
  const statusLine = el('div', { class: 'ai-status-holder' });
  const inner = el(
    'div',
    { class: 'ai-overlay-inner' },
    core,
    el('h2', { class: 'ai-overlay-title', text: title }),
    subEl,
    stagesEl,
    statusLine
  );
  overlay.appendChild(inner);

  let current = -1;
  let closed = false;

  const api = {
    overlay,
    core,
    /** Activate stage i (0-based). */
    start(i, note) {
      current = i;
      setAIState(core, ['reading', 'analyzing', 'generating', 'checking'][i] || 'thinking');
      stageEls.forEach((s, idx) => s.classList.toggle('active', idx === i));
      if (note) subEl.textContent = note;
    },
    /** Mark stage i complete. */
    done(i) {
      stageEls[i]?.classList.remove('active');
      stageEls[i]?.classList.add('done');
    },
    fail(message) {
      stageEls[current]?.classList.remove('active');
      stageEls[current]?.classList.add('failed');
      setAIState(core, 'error');
      subEl.textContent = message || 'Something went wrong.';
      renderAIStatus(statusLine, 'error', 'EXAMIVO stopped — you can try again.');
    },
    complete(note) {
      stageEls.forEach((s) => {
        s.classList.remove('active');
        s.classList.add('done');
      });
      setAIState(core, 'complete');
      subEl.textContent = note || 'Ready.';
    },
    note(text) {
      subEl.textContent = text;
    },
    async close({ delay = 260 } = {}) {
      if (closed) return;
      closed = true;
      overlay.classList.add('closing');
      await new Promise((r) => setTimeout(r, delay));
      overlay.remove();
    },
  };

  return api;
}

/* ============================================================
   TOASTS
   ============================================================ */

let toastRegion = null;
const TOAST_ICONS = { success: '✓', error: '!', info: 'i', warning: '!' };

export function toast(message, type = 'info', { duration = 3400 } = {}) {
  if (!toastRegion) {
    toastRegion = el('div', { class: 'toast-region', 'aria-live': 'polite', role: 'status' });
    document.body.appendChild(toastRegion);
  }
  const item = el(
    'div',
    { class: `toast ${type}` },
    el('span', { class: 't-icon', text: TOAST_ICONS[type] || 'i', 'aria-hidden': 'true' }),
    el('span', { text: message })
  );
  toastRegion.appendChild(item);
  const leave = () => {
    item.classList.add('leaving');
    setTimeout(() => item.remove(), 240);
  };
  const timer = setTimeout(leave, duration);
  item.addEventListener('click', () => {
    clearTimeout(timer);
    leave();
  });
  return item;
}

/* ============================================================
   MODALS
   ============================================================ */

let openModals = [];

export function openModal({ title = '', body = '', footer = [], wide = false, onClose = null } = {}) {
  const overlay = el('div', { class: 'modal-overlay', role: 'dialog', 'aria-modal': 'true' });
  const modal = el(
    'div',
    { class: 'modal', style: wide ? 'width:min(680px,100%)' : '' },
    el(
      'div',
      { class: 'modal-head' },
      el('h3', { text: title }),
      el(
        'button',
        {
          class: 'modal-close',
          'aria-label': 'Close dialog',
          html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        },
      )
    ),
    el('div', { class: 'modal-body' }),
    footer.length ? el('div', { class: 'modal-foot' }, footer) : null
  );
  const bodyEl = modal.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  overlay.appendChild(modal);

  function close() {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 160);
    openModals = openModals.filter((m) => m !== api);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector('.modal-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  const api = { overlay, modal, close, bodyEl };
  openModals.push(api);
  const firstFocusable = modal.querySelector('input, textarea, button.btn, .modal-close');
  setTimeout(() => firstFocusable?.focus(), 60);
  return api;
}

export function confirmModal({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const cancelBtn = el('button', { class: 'btn btn-ghost', text: 'Cancel', onclick: () => { done(false); api.close(); } });
    const okBtn = el(
      'button',
      {
        class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
        text: confirmLabel,
        onclick: () => { done(true); api.close(); },
      }
    );
    const api = openModal({
      title,
      body: el('p', { style: 'margin:0', text: message }),
      footer: [cancelBtn, okBtn],
      onClose: () => done(false),
    });
  });
}

/* ============================================================
   MISC UI HELPERS
   ============================================================ */

export function emptyState({ icon = '✦', title, message, actionLabel, onAction } = {}) {
  return el(
    'div',
    { class: 'empty-state' },
    el('div', { class: 'es-visual', text: icon, 'aria-hidden': 'true' }),
    el('h3', { text: title }),
    el('p', { text: message }),
    actionLabel ? el('button', { class: 'btn btn-primary', text: actionLabel, onclick: onAction }) : null
  );
}

export function revealPage() {
  document.documentElement.classList.add('booted');
  const main = document.querySelector('main') || document.body;
  main.classList.add('page-enter');
}

/* ---------- Connection awareness ---------- */
export function initNetworkAwareness() {
  const banner = el('div', { class: 'offline-banner', text: 'You are offline. Saved content is available — generating and syncing need a connection.', 'aria-live': 'polite' });
  document.body.appendChild(banner);
  const sync = () => banner.classList.toggle('show', !navigator.onLine);
  window.addEventListener('online', () => {
    sync();
    toast('Connection restored.', 'success');
  });
  window.addEventListener('offline', sync);
  sync();
}

/** Small inline SVG icon set (line style, 1.7 stroke). */
export const ICONS = {
  arrowRight:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  arrowLeft:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6 6-6-6 6-6"/></svg>',
  flag:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>',
  check:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  plus:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  upload:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>',
  doc:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/></svg>',
  image:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4-4-8 9"/></svg>',
  text:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
  topic:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-3 2 2-6 3-2z"/></svg>',
  clock:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  target:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>',
  book:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  chart:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="m7 13 4-4 4 3 5-6"/></svg>',
  history:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  spark:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  logout:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
  trash:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};
