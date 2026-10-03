/**
 * EXAMIVO — Firebase Configuration & Modular SDK Initialization
 * Uses the exact project configuration specified for examivo.
 * Never uses Firebase Storage; uses Firebase Auth, Cloud Firestore, Functions, and Analytics.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
  logEvent
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAgbjUW2xF324nxJqcMoO3Yajq1HmRS088",
  authDomain: "examivo.firebaseapp.com",
  projectId: "examivo",
  storageBucket: "examivo.firebasestorage.app",
  messagingSenderId: "789497850627",
  appId: "1:789497850627:web:ea968e6b87f22b5e39d736",
  measurementId: "G-0MMN146SF8"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

let analyticsInstance = null;
if (typeof window !== "undefined") {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analyticsInstance = getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics blocked by browser privacy settings; fail silently
    });
}

/**
 * Safely log product analytics events without collecting unnecessary PII
 * Supported events: app_opened, practice_started, material_uploaded,
 * exam_generated, exam_completed, practice_repeated, auth_completed
 */
export function trackEvent(eventName, eventParams = {}) {
  try {
    if (analyticsInstance) {
      logEvent(analyticsInstance, eventName, eventParams);
    }
  } catch (_) {
    // Non-blocking analytics
  }
}

export {
  app,
  auth,
  db,
  functions,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  httpsCallable
};
