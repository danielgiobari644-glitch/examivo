/* ============================================================
   EXAMIVO — Authentication
   Google + Email/Password. Accounts are required only when the
   user wants saved history, progress and cross-device sync —
   the product is fully try-able as a guest.
   ============================================================ */

import { auth, googleProvider, popupResolver, trackEvent } from './firebase.js';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { HumanError } from './utils.js';
import { Store, setCurrentUser, isGuest } from './storage.js';
import { openModal, toast } from './ui.js';

const FRIENDLY_AUTH_ERRORS = {
  'auth/invalid-credential': 'That email or password isn’t right. Try again or reset your password.',
  'auth/wrong-password': 'That password isn’t right. Try again or reset your password.',
  'auth/user-not-found': 'No EXAMIVO account exists with that email yet. Create one below.',
  'auth/email-already-in-use': 'An account already exists with that email. Sign in instead.',
  'auth/weak-password': 'Passwords need at least 6 characters.',
  'auth/invalid-email': 'That email address doesn’t look valid.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/popup-closed-by-user': 'The Google window closed before finishing. Try again.',
  'auth/cancelled-popup-request': 'Another sign-in window is already open.',
  'auth/operation-not-allowed':
    'Sign-in methods aren’t enabled on the Firebase project yet. Enable Google + Email/Password in the Firebase console → Authentication.',
  'auth/configuration-not-found':
    'Authentication isn’t set up on the Firebase project yet. Open Firebase console → Authentication → Sign-in method and enable Google and Email/Password.',
  'auth/admin-restricted-operation':
    'Authentication isn’t enabled on the Firebase project yet. Enable it in Firebase console → Authentication.',
  'auth/network-request-failed': 'Network problem while signing in. Check your connection.',
  'auth/unauthorized-domain':
    'This preview domain isn’t authorized in Firebase. Add it under Firebase console → Authentication → Settings → Authorized domains.',
};

function authError(err) {
  const friendly = FRIENDLY_AUTH_ERRORS[err?.code];
  if (friendly) return new HumanError(friendly, { retryable: !['auth/operation-not-allowed', 'auth/configuration-not-found', 'auth/unauthorized-domain'].includes(err?.code) });
  console.warn('[EXAMIVO] auth error:', err?.code, err?.message);
  return new HumanError('Sign-in didn’t complete. Please try again.');
}

/* ---------------- Core actions ---------------- */

export async function signInGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider, popupResolver);
    await afterSignIn(cred.user);
    return cred.user;
  } catch (err) {
    if (err?.code === 'auth/popup-blocked') {
      throw new HumanError('Your browser blocked the Google window. Allow popups for this site and try again.');
    }
    throw authError(err);
  }
}

export async function signInEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await afterSignIn(cred.user);
    return cred.user;
  } catch (err) {
    throw authError(err);
  }
}

export async function signUpEmail(name, email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name) await updateProfile(cred.user, { displayName: name.trim() });
    await Store.ensureProfile(cred.user, { displayName: name?.trim() });
    await afterSignIn(cred.user, { isNew: true });
    trackEvent('authentication_completed', { method: 'email' });
    return cred.user;
  } catch (err) {
    throw authError(err);
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw authError(err);
  }
}

export async function signOutUser() {
  try {
    await fbSignOut(auth);
    toast('Signed out.', 'info');
  } catch {
    throw new HumanError('Signing out failed. Try again.');
  }
}

async function afterSignIn(user, { isNew = false } = {}) {
  setCurrentUser(user);
  await Store.ensureProfile(user);
  trackEvent('authentication_completed', { method: isNew ? 'google_new' : 'google' });
  if (Store.guest.hasData()) {
    const { migrated } = await Store.migrateGuestData();
    if (migrated > 0) toast(`Welcome, ${user.displayName?.split(' ')[0] || 'Student'} — ${migrated} saved item${migrated > 1 ? 's' : ''} moved into your account.`, 'success', { duration: 4600 });
  } else {
    toast(`Welcome${isNew ? '' : ' back'}, ${user.displayName?.split(' ')[0] || 'Student'}.`, 'success');
  }
  document.dispatchEvent(new CustomEvent('examivo:user', { detail: { user } }));
}

/* ---------------- Session watcher ---------------- */

export function watchAuth(callback) {
  return onAuthStateChanged(auth, (user) => {
    setCurrentUser(user);
    callback(user);
  });
}

export function displayName() {
  const user = auth.currentUser;
  if (user) return user.displayName || (user.email ? user.email.split('@')[0] : 'Student');
  return 'Guest student';
}

/* ---------------- Auth modal (Google + email in one place) ---------------- */

let mode = 'signin';

export function openAuthModal({ reason = '', onDone = null } = {}) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    ${reason ? `<div class="auth-reason">${reason}</div>` : ''}
    <button class="btn btn-secondary btn-block google-btn" data-google>
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.2h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.1-6.9-5.1H1.3v3C3.3 21.3 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.1 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3v-3H1.3C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.3l3.8-3z"/><path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.7l3.8 3C6 6.8 8.8 4.7 12 4.7z"/></svg>
      Continue with Google
    </button>
    <div class="auth-divider"><span>or with email</span></div>
    <form class="auth-form" novalidate>
      <div class="field" data-name-field style="display:none">
        <label for="auth-name">Your name</label>
        <input class="input" id="auth-name" type="text" autocomplete="name" placeholder="Chidi Okafor">
      </div>
      <div class="field">
        <label for="auth-email">Email</label>
        <input class="input" id="auth-email" type="email" autocomplete="email" placeholder="you@school.com" required>
      </div>
      <div class="field">
        <label for="auth-pass">Password</label>
        <input class="input" id="auth-pass" type="password" autocomplete="current-password" placeholder="••••••••" minlength="6" required>
      </div>
      <p class="form-error" data-error role="alert" style="display:none"></p>
      <button class="btn btn-primary btn-block" type="submit" data-submit>Sign In</button>
    </form>
    <div class="auth-switch">
      <span data-switch-text>New to EXAMIVO?</span>
      <button class="linklike" data-switch>Create an account</button>
      <button class="linklike subtle" data-reset hidden>Reset password</button>
    </div>`;

  const form = wrap.querySelector('.auth-form');
  const nameField = wrap.querySelector('[data-name-field]');
  const nameInput = wrap.querySelector('#auth-name');
  const emailInput = wrap.querySelector('#auth-email');
  const passInput = wrap.querySelector('#auth-pass');
  const submitBtn = wrap.querySelector('[data-submit]');
  const errorEl = wrap.querySelector('[data-error]');
  const switchBtn = wrap.querySelector('[data-switch]');
  const switchText = wrap.querySelector('[data-switch-text]');
  const resetBtn = wrap.querySelector('[data-reset]');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
  function setMode(m) {
    mode = m;
    const signup = m === 'signup';
    nameField.style.display = signup ? 'flex' : 'none';
    submitBtn.textContent = signup ? 'Create Account' : 'Sign In';
    switchText.textContent = signup ? 'Already have an account?' : 'New to EXAMIVO?';
    switchBtn.textContent = signup ? 'Sign in instead' : 'Create an account';
    resetBtn.hidden = signup;
    errorEl.style.display = 'none';
  }
  switchBtn.addEventListener('click', () => setMode(mode === 'signup' ? 'signin' : 'signup'));
  resetBtn.addEventListener('click', async () => {
    if (!emailInput.value.trim()) return showError('Enter your email first, then reset your password.');
    try {
      await resetPassword(emailInput.value);
      toast('Password reset email sent.', 'success');
    } catch (err) {
      showError(err.message);
    }
  });

  wrap.querySelector('[data-google]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.dataset.original = btn.innerHTML;
    btn.textContent = 'Opening Google…';
    try {
      await signInGoogle();
      api.close();
      onDone?.();
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.original;
      showError(err.message);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    if (!emailInput.value.trim() || !passInput.value) return showError('Enter your email and password.');
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
    try {
      if (mode === 'signup') await signUpEmail(nameInput.value, emailInput.value, passInput.value);
      else await signInEmail(emailInput.value, passInput.value);
      api.close();
      onDone?.();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
      showError(err.message);
    }
  });

  const api = openModal({
    title: mode === 'signup' ? 'Create your account' : 'Welcome back',
    body: wrap,
    onClose: () => {},
  });
  return api;
}

/** Prompt shown when a guest wants something that needs an account. */
export function promptForAccount(reason, onDone) {
  const note = reason
    ? `<div class="auth-reason">${reason}</div>`
    : '';
  const body = document.createElement('div');
  body.innerHTML = `${note}<p class="auth-upgrade-copy">Create a free account to keep your history, progress and weak areas across every device.</p>`;
  const signInBtn = document.createElement('button');
  signInBtn.className = 'btn btn-primary btn-block';
  signInBtn.style.marginTop = '0.9rem';
  signInBtn.textContent = 'Continue';
  body.appendChild(signInBtn);
  signInBtn.addEventListener('click', () => {
    api.close();
    openAuthModal({ onDone });
  });
  const api = openModal({ title: 'Save your progress', body });
}

/* Shared styles for the auth modal (injected once) */
if (!document.getElementById('examivo-auth-styles')) {
  const style = document.createElement('style');
  style.id = 'examivo-auth-styles';
  style.textContent = `
    .auth-reason{background:var(--primary-soft);border:1px solid var(--primary-border);color:var(--primary-strong);
      padding:.7rem .95rem;border-radius:12px;font-size:.88rem;font-weight:500;margin-bottom:1rem}
    .auth-upgrade-copy{color:var(--text-secondary);font-size:.93rem;margin:0}
    .google-btn{margin-bottom:1.1rem;font-weight:600}
    .auth-divider{display:flex;align-items:center;gap:.8rem;color:var(--text-muted);font-size:.8rem;margin:0 0 1rem}
    .auth-divider::before,.auth-divider::after{content:"";height:1px;flex:1;background:var(--border)}
    .auth-form{display:flex;flex-direction:column;gap:.85rem}
    .form-error{color:var(--danger);font-size:.86rem;margin:0}
    .auth-switch{display:flex;align-items:center;justify-content:center;gap:.45rem;margin-top:1.15rem;font-size:.88rem;color:var(--text-muted);flex-wrap:wrap}
    .linklike{color:var(--primary-strong);font-weight:600;font-size:.88rem}
    .linklike:hover{text-decoration:underline}
    .linklike.subtle{color:var(--text-muted);font-weight:500}
  `;
  document.head.appendChild(style);
}
