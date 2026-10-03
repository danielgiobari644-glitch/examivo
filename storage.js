/**
 * EXAMIVO — Cloud Firestore Data Layer & Active Session Persistence
 * Collections: users, profiles, exams, questions, attempts, studySessions,
 *              weakAreas, examProfiles, subjects, classProfiles
 */

import {
  db,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from "./firebase.js";
import { getCurrentUser } from "./auth.js";
import { generateId } from "./utils.js";

const ACTIVE_EXAM_KEY = "examivo_active_exam";
const ACTIVE_RESULT_KEY = "examivo_active_result";
const ACTIVE_STUDY_KEY = "examivo_active_study";
const PENDING_GUEST_ATTEMPTS_KEY = "examivo_guest_attempts";

/* ==========================================================================
   ACTIVE SESSION STATE (For Current Exam / Result / Study Transition)
   ========================================================================== */

export function setActiveExamSession(examBundle) {
  try {
    sessionStorage.setItem(ACTIVE_EXAM_KEY, JSON.stringify(examBundle));
    localStorage.setItem(ACTIVE_EXAM_KEY, JSON.stringify(examBundle));
  } catch (_) {}
}

export function getActiveExamSession() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_EXAM_KEY) || localStorage.getItem(ACTIVE_EXAM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function clearActiveExamSession() {
  try {
    sessionStorage.removeItem(ACTIVE_EXAM_KEY);
    localStorage.removeItem(ACTIVE_EXAM_KEY);
  } catch (_) {}
}

export function setActiveResultSession(resultBundle) {
  try {
    sessionStorage.setItem(ACTIVE_RESULT_KEY, JSON.stringify(resultBundle));
    localStorage.setItem(ACTIVE_RESULT_KEY, JSON.stringify(resultBundle));
  } catch (_) {}
}

export function getActiveResultSession() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_RESULT_KEY) || localStorage.getItem(ACTIVE_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function setActiveStudySession(studyBundle) {
  try {
    sessionStorage.setItem(ACTIVE_STUDY_KEY, JSON.stringify(studyBundle));
    localStorage.setItem(ACTIVE_STUDY_KEY, JSON.stringify(studyBundle));
  } catch (_) {}
}

export function getActiveStudySession() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_STUDY_KEY) || localStorage.getItem(ACTIVE_STUDY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/* ==========================================================================
   FIRESTORE PERSISTENCE: EXAMS, QUESTIONS, ATTEMPTS, WEAK AREAS, STUDY SESSIONS
   ========================================================================== */

/**
 * Save a newly generated Exam Blueprint and its validated Questions to Firestore
 * if the user is authenticated.
 */
export async function saveExamToFirestore(examBundle) {
  const user = getCurrentUser();
  if (!user || !user.uid || !examBundle) return { saved: false, reason: "unauthenticated" };

  const examId = examBundle.examId || generateId("exam");
  const examRef = doc(db, "exams", examId);

  const examDoc = {
    examId,
    userId: user.uid,
    title: examBundle.title || `${examBundle.subject} — ${examBundle.examType}`,
    classLevel: examBundle.classLevel,
    subject: examBundle.subject,
    examType: examBundle.examType,
    difficulty: examBundle.difficulty,
    examMode: examBundle.examMode,
    questionCount: Array.isArray(examBundle.questions) ? examBundle.questions.length : 0,
    durationSeconds: examBundle.durationSeconds || 0,
    materialSummary: examBundle.materialSummary || "",
    examFocus: examBundle.examFocus || null,
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString()
  };

  await setDoc(examRef, examDoc, { merge: true });

  // Store individual validated questions in questions/ collection
  if (Array.isArray(examBundle.questions)) {
    const writes = examBundle.questions.map((q, idx) => {
      const qId = q.id || `${examId}_q${idx + 1}`;
      const qRef = doc(db, "questions", qId);
      return setDoc(
        qRef,
        {
          questionId: qId,
          examId,
          userId: user.uid,
          index: idx,
          question: q.question,
          type: q.type,
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || "",
          topic: q.topic || examBundle.subject,
          difficulty: q.difficulty || examBundle.difficulty,
          cognitiveSkill: q.cognitiveSkill || "application",
          sourceConcept: q.sourceConcept || q.topic || "",
          examRelevance: q.examRelevance || "high",
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
    });
    await Promise.allSettled(writes);
  }

  return { saved: true, examId };
}

/**
 * Save a completed Examination Attempt & Weak Areas analysis to Firestore.
 * If the user is not yet signed in, queues it temporarily so signing in immediately syncs it to Firestore.
 */
export async function saveAttemptAndWeakAreas(attemptBundle) {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    queueGuestAttempt(attemptBundle);
    return { saved: false, reason: "guest_queued" };
  }

  const attemptId = attemptBundle.attemptId || generateId("att");
  const attemptRef = doc(db, "attempts", attemptId);

  const attemptDoc = {
    attemptId,
    examId: attemptBundle.examId || generateId("exam"),
    userId: user.uid,
    title: attemptBundle.title || `${attemptBundle.subject} (${attemptBundle.examType})`,
    classLevel: attemptBundle.classLevel,
    subject: attemptBundle.subject,
    examType: attemptBundle.examType,
    difficulty: attemptBundle.difficulty,
    examMode: attemptBundle.examMode,
    scorePercent: attemptBundle.scorePercent,
    correctCount: attemptBundle.correctCount,
    totalQuestions: attemptBundle.totalQuestions,
    timeSpentSeconds: attemptBundle.timeSpentSeconds || 0,
    strongAreas: attemptBundle.strongAreas || [],
    practiceAreas: attemptBundle.practiceAreas || [],
    weakAreas: attemptBundle.weakAreas || [],
    topicDiagnostics: attemptBundle.topicDiagnostics || [],
    questionReviews: attemptBundle.questionReviews || [],
    createdAt: serverTimestamp(),
    createdAtIso: attemptBundle.createdAtIso || new Date().toISOString()
  };

  await setDoc(attemptRef, attemptDoc, { merge: true });

  // Update Weak Areas collection for concept-level mastery tracking
  if (Array.isArray(attemptBundle.topicDiagnostics)) {
    const weakWrites = attemptBundle.topicDiagnostics.map((diag) => {
      const slug = `${user.uid}_${attemptBundle.subject}_${diag.topic}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");
      const weakRef = doc(db, "weakAreas", slug);
      const priorityScore = Math.max(0, 100 - Number(diag.accuracyPercent || 0));

      return setDoc(
        weakRef,
        {
          weakAreaId: slug,
          userId: user.uid,
          subject: attemptBundle.subject,
          classLevel: attemptBundle.classLevel,
          examType: attemptBundle.examType,
          topic: diag.topic,
          sourceConcept: diag.sourceConcept || diag.topic,
          accuracyPercent: diag.accuracyPercent,
          correctCount: diag.correct,
          totalAsked: diag.total,
          status: diag.status, // "Needs Practice" | "Areas to Practice" | "Strong"
          reason: diag.reason || "",
          priorityScore,
          updatedAt: serverTimestamp(),
          updatedAtIso: new Date().toISOString()
        },
        { merge: true }
      );
    });
    await Promise.allSettled(weakWrites);
  }

  return { saved: true, attemptId };
}

/**
 * Save a Study My Mistakes revision session to Firestore
 */
export async function saveStudySessionToFirestore(studyData) {
  const user = getCurrentUser();
  if (!user || !user.uid || !studyData) return { saved: false };

  const sessionId = studyData.sessionId || generateId("study");
  const sessionRef = doc(db, "studySessions", sessionId);

  await setDoc(
    sessionRef,
    {
      sessionId,
      userId: user.uid,
      attemptId: studyData.attemptId || "",
      subject: studyData.subject || "",
      classLevel: studyData.classLevel || "",
      examType: studyData.examType || "",
      topicsCovered: studyData.topicsCovered || [],
      modules: studyData.modules || [],
      createdAt: serverTimestamp(),
      createdAtIso: new Date().toISOString()
    },
    { merge: true }
  );

  return { saved: true, sessionId };
}

function queueGuestAttempt(attemptBundle) {
  try {
    const existingRaw = localStorage.getItem(PENDING_GUEST_ATTEMPTS_KEY);
    const list = existingRaw ? JSON.parse(existingRaw) : [];
    const filtered = list.filter((a) => a.attemptId !== attemptBundle.attemptId);
    filtered.unshift(attemptBundle);
    localStorage.setItem(PENDING_GUEST_ATTEMPTS_KEY, JSON.stringify(filtered.slice(0, 10)));
  } catch (_) {}
}

/**
 * Sync any guest attempts made prior to creating an account into Firestore
 */
export async function syncPendingGuestAttemptsToFirestore() {
  const user = getCurrentUser();
  if (!user || !user.uid) return 0;

  try {
    const raw = localStorage.getItem(PENDING_GUEST_ATTEMPTS_KEY);
    if (!raw) return 0;
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    for (const item of list) {
      await saveAttemptAndWeakAreas(item);
    }
    localStorage.removeItem(PENDING_GUEST_ATTEMPTS_KEY);
    return list.length;
  } catch (_) {
    return 0;
  }
}

/**
 * Fetch user's Examination Attempts from Firestore
 */
export async function fetchUserAttemptsFromFirestore(maxCount = 50) {
  const user = getCurrentUser();
  if (!user || !user.uid) return [];

  try {
    const q = query(
      collection(db, "attempts"),
      where("userId", "==", user.uid),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    const items = [];
    snap.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sort newest first in memory (handles missing composite index gracefully)
    items.sort((a, b) => {
      const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : Date.parse(a.createdAtIso || 0);
      const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : Date.parse(b.createdAtIso || 0);
      return (tB || 0) - (tA || 0);
    });

    return items;
  } catch (err) {
    console.warn("Firestore attempts query error:", err.message);
    return [];
  }
}

/**
 * Fetch user's Weak Areas from Firestore
 */
export async function fetchUserWeakAreasFromFirestore() {
  const user = getCurrentUser();
  if (!user || !user.uid) return [];

  try {
    const q = query(
      collection(db, "weakAreas"),
      where("userId", "==", user.uid),
      limit(40)
    );
    const snap = await getDocs(q);
    const items = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status === "Needs Practice" || data.status === "Areas to Practice") {
        items.push({ id: docSnap.id, ...data });
      }
    });

    items.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    return items;
  } catch (err) {
    console.warn("Firestore weakAreas query error:", err.message);
    return [];
  }
}

/**
 * Fetch a specific attempt by ID from Firestore (or active session)
 */
export async function fetchAttemptById(attemptId) {
  const active = getActiveResultSession();
  if (active && active.attemptId === attemptId) {
    return active;
  }
  const user = getCurrentUser();
  if (!user || !user.uid || !attemptId) return active || null;

  try {
    const ref = doc(db, "attempts", attemptId);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().userId === user.uid) {
      return snap.data();
    }
  } catch (_) {}
  return active || null;
}

/**
 * Calculate Dashboard Progress Metrics purely from actual attempts
 */
export function computeProgressMetrics(attempts = [], weakAreas = []) {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return {
      averageScore: null,
      examsCompleted: 0,
      strongestSubject: "—",
      areasToImproveCount: weakAreas.length || 0,
      areasToImproveLabel: weakAreas.length > 0 ? weakAreas[0].topic : "—"
    };
  }

  const totalExams = attempts.length;
  const sumScores = attempts.reduce((acc, a) => acc + (Number(a.scorePercent) || 0), 0);
  const averageScore = Math.round(sumScores / totalExams);

  // Group scores by subject to determine strongest subject
  const subjectStats = {};
  attempts.forEach((a) => {
    const subj = a.subject || "General";
    if (!subjectStats[subj]) {
      subjectStats[subj] = { sum: 0, count: 0 };
    }
    subjectStats[subj].sum += Number(a.scorePercent) || 0;
    subjectStats[subj].count += 1;
  });

  let strongestSubject = "—";
  let highestAvg = -1;
  Object.entries(subjectStats).forEach(([subj, st]) => {
    const avg = st.sum / st.count;
    if (avg > highestAvg) {
      highestAvg = avg;
      strongestSubject = `${subj} (${Math.round(avg)}%)`;
    }
  });

  const weakTopics = weakAreas.length > 0
    ? weakAreas.map((w) => w.topic)
    : attempts.flatMap((a) => a.weakAreas || []);
  const uniqueWeak = [...new Set(weakTopics)];

  return {
    averageScore,
    examsCompleted: totalExams,
    strongestSubject,
    areasToImproveCount: uniqueWeak.length,
    areasToImproveLabel: uniqueWeak.length > 0 ? uniqueWeak.slice(0, 2).join(", ") : "All clear"
  };
}
