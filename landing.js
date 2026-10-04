/* ============================================================
   EXAMIVO — Landing behavior
   ============================================================ */

import { createAICore, createThemeToggle, revealPage, initNetworkAwareness, setAIState } from './ui.js';
import { watchAuth, openAuthModal } from './auth.js';
import { trackEvent } from './firebase.js';

initNetworkAwareness();

/* Theme */
createThemeToggle(document.querySelector('[data-theme-toggle]'));

/* Hero AI core (idle, alive) */
const heroCoreHolder = document.querySelector('[data-hero-core]');
if (heroCoreHolder && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const core = createAICore({ size: 190, state: 'idle' });
  heroCoreHolder.appendChild(core);
  // Gently cycle through states so the core feels "intelligent, not decorative"
  const cycle = ['reading', 'thinking', 'analyzing', 'idle', 'generating', 'idle'];
  let i = 0;
  setInterval(() => {
    i = (i + 1) % cycle.length;
    setAIState(core, cycle[i]);
  }, 4200);
} else if (heroCoreHolder) {
  heroCoreHolder.appendChild(createAICore({ size: 190, state: 'idle' }));
}

/* Auth state in header */
const signInBtn = document.querySelector('[data-signin]');
const openAppLink = document.querySelector('[data-auth-link]');
watchAuth((user) => {
  if (user) {
    signInBtn.hidden = true;
    openAppLink.hidden = false;
  } else {
    signInBtn.hidden = false;
    openAppLink.hidden = true;
  }
});
signInBtn.addEventListener('click', () => openAuthModal());

/* "Start Preparing" — smooth, connected transition into the app */
const overlay = document.querySelector('[data-transition]');
const overlayCoreHolder = document.querySelector('[data-transition-core]');

async function startPreparing() {
  trackEvent('start_preparing_clicked', { source: 'landing' });
  if (!overlayCoreHolder.childElementCount) {
    overlayCoreHolder.appendChild(createAICore({ size: 110, state: 'reading' }));
  }
  setAIState(overlayCoreHolder.firstChild, 'reading');
  overlay.classList.add('show');
  await new Promise((r) => setTimeout(r, 620));
  location.href = 'setup.html';
}

document.querySelectorAll('[data-start]').forEach((btn) => btn.addEventListener('click', startPreparing));

/* Smooth anchor scrolling */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* Reveal + PWA */
revealPage();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}
trackEvent('landing_viewed');
