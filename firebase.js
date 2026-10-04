/* ============================================================
   EXAMIVO — Firebase initialization (modular SDK, CDN)
   The web config below is public by design. No secrets live here:
   all AI traffic goes through Cloud Functions (see /functions).
   ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyAgbjUW2xF324nxJqcMoO3Yajq1HmRS088',
  authDomain: 'examivo.firebaseapp.com',
  projectId: 'examivo',
  storageBucket: 'examivo.firebasestorage.app',
  messagingSenderId: '789497850627',
  appId: '1:789497850627:web:ea968e6b87f22b5e39d736',
  measurementId: 'G-0MMN146SF8',
};

let app = null;
let auth = null;
let db = null;
let initError = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
} catch (err) {
  console.error('[EXAMIVO] Firebase failed to initialize:', err);
  initError = err;
}

export { app, auth, db, initError };

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const popupResolver = browserPopupRedirectResolver;

/* ---------- Analytics (optional, fails silently) ---------- */
let analytics = null;
export async function trackEvent(name, params = {}) {
  try {
    if (!analytics) {
      const supported = await import(
        'https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js'
      ).then((m) => m.isSupported());
      if (!supported) return;
      analytics = (await import(
        'https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js'
      )).getAnalytics(app);
    }
    const { logEvent } = await import(
      'https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js'
    );
    logEvent(analytics, name, params);
  } catch {
    /* analytics is never critical */
  }
}

export const SDK = {
  auth: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js',
  firestore: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js',
  functions: 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js',
};

/** Lazily import a Firebase SDK module (keeps first paint fast). */
export async function sdk(module) {
  return import(SDK[module] || module);
}
