/* ============================================================
   EXAMIVO — Storage facade
   Signed-in users: Cloud Firestore (users/{uid}/…)
   Guests:          localStorage mirror (try-before-account)
   Signing in migrates guest history into Firestore.
   ============================================================ */

import { auth, db, sdk } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { HumanError, uid as makeId } from './utils.js';
import { STORAGE_KEYS } from './constants.js';

/* ---------------- Guest (localStorage) ---------------- */

const Guest = {
  read(key, fallback = []) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full — attempt slim write */
    }
  },
  attempts() {
    return Guest.read(STORAGE_KEYS.guestAttempts).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  },
  saveAttempt(attempt) {
    const list = Guest.read(STORAGE_KEYS.guestAttempts);
    list.unshift({ ...attempt, id: attempt.id || makeId('att') });
    Guest.write(STORAGE_KEYS.guestAttempts, list.slice(0, 60));
    return attempt;
  },
  getAttempt(id) {
    return Guest.read(STORAGE_KEYS.guestAttempts).find((a) => a.id === id) || null;
  },
  deleteAttempt(id) {
    Guest.write(STORAGE_KEYS.guestAttempts, Guest.read(STORAGE_KEYS.guestAttempts).filter((a) => a.id !== id));
  },
  weakAreas() {
    return Guest.read(STORAGE_KEYS.guestWeakAreas);
  },
  saveWeakAreas(areas) {
    const map = new Map(Guest.read(STORAGE_KEYS.guestWeakAreas).map((w) => [w.id, w]));
    for (const area of areas) {
      const existing = map.get(area.id);
      map.set(area.id, existing ? { ...existing, ...area, timesSeen: (existing.timesSeen || 0) + 1 } : area);
    }
    Guest.write(
      STORAGE_KEYS.guestWeakAreas,
      [...map.values()].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 80)
    );
  },
  studySessions() {
    return Guest.read(STORAGE_KEYS.guestStudySessions).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
  saveStudySession(session) {
    const list = Guest.read(STORAGE_KEYS.guestStudySessions);
    list.unshift({ ...session, id: session.id || makeId('study') });
    Guest.write(STORAGE_KEYS.guestStudySessions, list.slice(0, 40));
  },
  clear() {
    [STORAGE_KEYS.guestAttempts, STORAGE_KEYS.guestWeakAreas, STORAGE_KEYS.guestStudySessions].forEach((k) =>
      localStorage.removeItem(k)
    );
  },
  hasData() {
    return Guest.read(STORAGE_KEYS.guestAttempts).length > 0;
  },
};

/* ---------------- Current actor ---------------- */

let currentUser = null; // firebase user or null

export function setCurrentUser(user) {
  currentUser = user;
}
export function getCurrentUser() {
  return currentUser;
}
export function isGuest() {
  return !currentUser;
}

/* ---------------- Firestore helpers ---------------- */

function userRef() {
  if (!currentUser) throw new HumanError('You need an account for that. Creating one takes seconds.');
  return { col: (name) => collection(db, 'users', currentUser.uid, name), doc: (name, id) => doc(db, 'users', currentUser.uid, name, id) };
}

function stripFirestoreTypes(obj) {
  // Attempts are stored denormalized + plain JSON to mirror the guest shape.
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

async function fsList(name, orderField = 'completedAt', max = 60) {
  const { col } = userRef();
  const snap = await getDocs(query(col(name), orderBy(orderField, 'desc'), fsLimit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------- Public Store API ---------------- */

export const Store = {
  /* ---- attempts ---- */
  async listAttempts() {
    if (isGuest()) return Guest.attempts();
    try {
      return await fsList('attempts', 'completedAt', 60);
    } catch (err) {
      console.warn('[EXAMIVO] listAttempts:', err);
      throw new HumanError('EXAMIVO couldn’t reach your saved history. Check your connection and try again.');
    }
  },

  async saveAttempt(attempt) {
    const clean = stripFirestoreTypes(attempt);
    if (isGuest()) return Guest.saveAttempt(clean);
    try {
      const { col, doc: mkDoc } = userRef();
      const id = attempt.id || makeId('att');
      const ref = mkDoc('attempts', id);
      await setDoc(ref, { ...clean, id, ownerUid: currentUser.uid, syncedAt: serverTimestamp() });
      return { ...clean, id };
    } catch (err) {
      console.warn('[EXAMIVO] saveAttempt:', err);
      // Never lose a completed exam: fall back to the local mirror.
      Guest.saveAttempt(clean);
      throw new HumanError('Your result is saved on this device, but cloud sync failed. It will stay local.', { retryable: false });
    }
  },

  async getAttempt(id) {
    if (isGuest()) return Guest.getAttempt(id);
    try {
      const { doc: mkDoc } = userRef();
      const snap = await getDoc(mkDoc('attempts', id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : Guest.getAttempt(id);
    } catch {
      return Guest.getAttempt(id);
    }
  },

  async deleteAttempt(id) {
    if (isGuest()) return Guest.deleteAttempt(id);
    try {
      const { doc: mkDoc } = userRef();
      await deleteDoc(mkDoc('attempts', id));
    } catch (err) {
      throw new HumanError('That attempt could not be deleted. Try again.');
    }
  },

  /* ---- weak areas ---- */
  async listWeakAreas() {
    if (isGuest()) return Guest.weakAreas();
    try {
      return await fsList('weakAreas', 'lastSeen', 80);
    } catch {
      return Guest.weakAreas();
    }
  },

  async saveWeakAreas(areas) {
    if (!areas?.length) return;
    if (isGuest()) return Guest.saveWeakAreas(areas);
    try {
      const { col } = userRef();
      const batch = writeBatch(db);
      for (const area of areas) {
        const id = (area.id || `${area.concept}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
        const ref = doc(db, 'users', currentUser.uid, 'weakAreas', id);
        batch.set(ref, stripFirestoreTypes({ ...area, id, ownerUid: currentUser.uid, updatedAt: serverTimestamp() }), { merge: true });
      }
      await batch.commit();
    } catch {
      Guest.saveWeakAreas(areas);
    }
  },

  /* ---- study sessions ---- */
  async listStudySessions() {
    if (isGuest()) return Guest.studySessions();
    try {
      return await fsList('studySessions', 'createdAt', 40);
    } catch {
      return Guest.studySessions();
    }
  },

  async saveStudySession(session) {
    const clean = stripFirestoreTypes(session);
    if (isGuest()) return Guest.saveStudySession(clean);
    try {
      const { col, doc: mkDoc } = userRef();
      const id = session.id || makeId('study');
      await setDoc(mkDoc('studySessions', id), { ...clean, id, ownerUid: currentUser.uid, syncedAt: serverTimestamp() });
      return { ...clean, id };
    } catch {
      Guest.saveStudySession(clean);
      throw new HumanError('Your study session is saved on this device only (cloud sync failed).', { retryable: false });
    }
  },

  /* ---- exam definitions (optional persistence of generated exams) ---- */
  async saveExamRecord(examMeta) {
    if (isGuest()) return;
    try {
      const { col } = userRef();
      await addDoc(col('exams'), stripFirestoreTypes({ ...examMeta, ownerUid: currentUser.uid, createdAt: serverTimestamp() }));
    } catch {
      /* exam records are supplementary — never block the flow */
    }
  },

  /* ---- profile ---- */
  async ensureProfile(user, extra = {}) {
    try {
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: user.uid,
          displayName: user.displayName || extra.displayName || 'Student',
          email: user.email || '',
          photoURL: user.photoURL || '',
          createdAt: serverTimestamp(),
          ...extra,
        });
      } else if (extra.displayName && !snap.data().displayName) {
        await setDoc(ref, { displayName: extra.displayName }, { merge: true });
      }
    } catch {
      /* profile write failures never block the app */
    }
  },

  /* ---- guest migration on sign-in ---- */
  async migrateGuestData() {
    if (isGuest() || !Guest.hasData()) return { migrated: 0 };
    let migrated = 0;
    try {
      const { col } = userRef();
      const batch = writeBatch(db);
      for (const attempt of Guest.attempts()) {
        const ref = doc(db, 'users', currentUser.uid, 'attempts', attempt.id);
        batch.set(ref, stripFirestoreTypes({ ...attempt, migratedFromGuest: true, syncedAt: serverTimestamp() }));
        migrated++;
      }
      for (const area of Guest.weakAreas()) {
        const id = (area.id || `${area.concept}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
        batch.set(doc(db, 'users', currentUser.uid, 'weakAreas', id), stripFirestoreTypes({ ...area, id }), { merge: true });
      }
      for (const session of Guest.studySessions()) {
        batch.set(doc(db, 'users', currentUser.uid, 'studySessions', session.id), stripFirestoreTypes(session));
        migrated++;
      }
      await batch.commit();
      Guest.clear();
      return { migrated };
    } catch {
      return { migrated: 0, failed: true };
    }
  },

  /* ---- guest passthrough helpers ---- */
  guest: Guest,
};
