/* ============================================================
   EXAMIVO — Shared app shell (header, nav, auth widget)
   Used by app.html, history.html, study.html.
   ============================================================ */

import { createThemeToggle, initNetworkAwareness, toast, ICONS } from './ui.js';
import { watchAuth, openAuthModal, signOutUser, displayName } from './auth.js';
import { isGuest, getCurrentUser } from './storage.js';
import { $, el, escapeHtml } from './utils.js';

export function initials(name) {
  const parts = String(name || 'S').trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function renderAppShell({ active = 'dashboard' } = {}) {
  initNetworkAwareness();

  const header = $('#app-header');
  if (!header) return;
  header.innerHTML = '';
  const container = el('div', { class: 'container' });

  container.appendChild(
    el(
      'a',
      { class: 'brand', href: 'app.html', 'aria-label': 'EXAMIVO dashboard' },
      el('img', { src: 'assets/logo/logo.svg', alt: 'EXAMIVO', width: '150', height: '28' })
    )
  );

  const NAV = [
    { id: 'dashboard', href: 'app.html', label: 'Dashboard', icon: ICONS.chart },
    { id: 'practice', href: 'setup.html', label: 'New Practice', icon: ICONS.plus },
    { id: 'history', href: 'history.html', label: 'History', icon: ICONS.history },
    { id: 'study', href: 'study.html', label: 'Study', icon: ICONS.book },
  ];
  const nav = el('nav', { class: 'app-nav', 'aria-label': 'Primary' });
  for (const item of NAV) {
    const link = el(
      'a',
      { href: item.href, 'aria-current': active === item.id ? 'page' : null },
      el('span', { html: item.icon, 'aria-hidden': 'true' }),
      el('span', { class: 'nav-label', text: item.label })
    );
    nav.appendChild(link);
  }
  container.appendChild(nav);
  container.appendChild(el('span', { class: 'spacer' }));

  const themeBtn = el('button', { class: 'theme-btn', 'aria-label': 'Change theme' });
  container.appendChild(themeBtn);
  createThemeToggle(themeBtn);

  const widget = el('div', { class: 'auth-widget' });
  container.appendChild(widget);

  header.appendChild(container);

  function paintWidget() {
    widget.innerHTML = '';
    const user = getCurrentUser();
    if (user) {
      const name = user.displayName || displayName();
      const trigger = el(
        'button',
        { class: 'aw-trigger', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
        el(
          'span',
          { class: 'aw-avatar' },
          user.photoURL
            ? el('img', { src: user.photoURL, alt: '' })
            : document.createTextNode(initials(name))
        ),
        el('span', { class: 'aw-name', text: name.split(' ')[0] })
      );
      const menu = el(
        'div',
        { class: 'aw-menu', role: 'menu', hidden: true },
        el(
          'div',
          { class: 'aw-id' },
          el('strong', { text: name }),
          el('span', { text: user.email || '' })
        ),
        el(
          'a',
          { href: 'history.html', role: 'menuitem' },
          el('span', { html: ICONS.history, 'aria-hidden': 'true' }),
          'Exam history'
        ),
        el(
          'a',
          { href: 'study.html', role: 'menuitem' },
          el('span', { html: ICONS.book, 'aria-hidden': 'true' }),
          'Study sessions'
        ),
        el(
          'button',
          {
            role: 'menuitem',
            html: `${ICONS.logout}<span>Sign out</span>`,
            onclick: async () => {
              menu.hidden = true;
              await signOutUser();
              location.href = 'index.html';
            },
          }
        )
      );
      trigger.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        trigger.setAttribute('aria-expanded', String(!menu.hidden));
      });
      document.addEventListener('click', (e) => {
        if (!widget.contains(e.target)) {
          menu.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
      widget.append(trigger, menu);
    } else {
      const signIn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Sign In' });
      signIn.addEventListener('click', () => openAuthModal());
      widget.appendChild(signIn);
    }
  }
  paintWidget();
  watchAuth(() => paintWidget());
  document.addEventListener('examivo:user', paintWidget);
}

/* Shared score chip class helper */
export function scoreClass(pct) {
  if (pct >= 70) return 'score-hi';
  if (pct >= 50) return 'score-mid';
  return 'score-low';
}

export { toast, $, el, escapeHtml, isGuest };
