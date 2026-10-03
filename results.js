/**
 * EXAMIVO — Results Reveal, Weak Area Engine & Question Review Controller (results.html)
 * Animates Score Reveal, Explains Weak Area Diagnostics, Renders Question Review,
 * and Powers "Practice My Weak Areas" ("BUILDING YOUR NEXT PRACTICE") & "Study My Mistakes"
 */

import {
  escapeHtml,
  formatDuration,
  generateId
} from "./utils.js";
import {
  initCommonUI,
  renderAIStatus,
  showToast,
  navigateTo
} from "./ui.js";
import {
  initAuth,
  getCurrentUser,
  promptAuthForFeature
} from "./auth.js";
import {
  getActiveResultSession,
  fetchAttemptById,
  setActiveExamSession,
  saveExamToFirestore,
  syncPendingGuestAttemptsToFirestore
} from "./storage.js";
import { runWeakAreaPracticePipeline } from "./ai.js";
import { trackEvent } from "./firebase.js";

const WEAK_PRACTICE_STAGES = [
  "Targeting weak concepts",
  "Adjusting difficulty",
  "Creating new questions",
  "Checking question quality"
];

let currentAttempt = null;
let currentReviewFilter = "all"; // 'all' | 'wrong' | 'correct' | 'flagged'

document.addEventListener("DOMContentLoaded", async () => {
  initCommonUI();
  initAuth(async (user) => {
    updateSaveBannerState(user);
    if (user) {
      const synced = await syncPendingGuestAttemptsToFirestore();
      if (synced > 0) {
        showToast("Exam saved.", "success");
      }
    }
  });

  const params = new URLSearchParams(window.location.search);
  const attemptIdParam = params.get("attemptId");

  currentAttempt = attemptIdParam
    ? await fetchAttemptById(attemptIdParam)
    : getActiveResultSession();

  if (!currentAttempt || !Array.isArray(currentAttempt.questionReviews)) {
    renderEmptyResultsState();
    return;
  }

  renderResultsDashboard(currentAttempt);
  bindResultsActions();
});

function renderEmptyResultsState() {
  const container = document.getElementById("results-content-root");
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state" style="margin-top:2rem;">
      ${renderAIStatus("idle", null, { size: "md", showLabel: false })}
      <h3>No examination result selected.</h3>
      <p>Complete a practice examination or select a past session from your dashboard to view performance diagnostics.</p>
      <a href="setup.html" class="btn btn-primary btn-lg" data-smooth-nav>Start Preparing</a>
    </div>
  `;
}

function renderResultsDashboard(attempt) {
  // 1. Meta & Score Reveal
  const metaStrip = document.getElementById("result-exam-meta");
  const headlineEl = document.getElementById("result-headline-text");
  const subcopyEl = document.getElementById("result-subcopy-text");
  const fractionEl = document.getElementById("score-fraction-label");
  const scoreEl = document.getElementById("score-animated-number");

  if (metaStrip) {
    metaStrip.innerHTML = `
      <span class="badge badge-primary">${escapeHtml(attempt.classLevel)}</span>
      <span class="badge badge-accent">${escapeHtml(attempt.subject)}</span>
      <span class="badge badge-neutral">${escapeHtml(attempt.examType)}</span>
      <span class="badge badge-neutral">${escapeHtml(attempt.difficulty || "Exam Level")}</span>
      <span class="badge badge-neutral">Time: ${escapeHtml(formatDuration(attempt.timeSpentSeconds || 0))}</span>
    `;
  }

  if (fractionEl) {
    fractionEl.textContent = `${attempt.correctCount} / ${attempt.totalQuestions} correct`;
  }

  // Smoothly animate score number from 0% -> target%
  animateScoreCounter(scoreEl, Number(attempt.scorePercent) || 0);

  const pct = Number(attempt.scorePercent) || 0;
  if (headlineEl) {
    if (pct >= 80) {
      headlineEl.textContent = "Strong examination command.";
    } else if (pct >= 60) {
      headlineEl.textContent = "Solid progress with clear areas to sharpen.";
    } else {
      headlineEl.textContent = "Foundational gaps identified — targeted practice ready.";
    }
  }

  if (subcopyEl) {
    const weakCount = (attempt.weakAreas || []).length + (attempt.practiceAreas || []).length;
    subcopyEl.textContent =
      weakCount > 0
        ? `EXAMIVO analyzed your ${attempt.totalQuestions} responses across ${attempt.subject} (${attempt.examType}) and isolated ${weakCount} concept area${weakCount > 1 ? "s" : ""} for targeted reinforcement.`
        : `You demonstrated high accuracy across all tested ${attempt.subject} concepts in this ${attempt.examType} session.`;
  }

  // 2. Three Performance Bands: Strong Areas | Areas to Practice | Weak Areas
  renderChipList("band-strong-chips", attempt.strongAreas, "badge-success", "No strong areas recorded yet");
  renderChipList("band-practice-chips", attempt.practiceAreas, "badge-warning", "No intermediate areas");
  renderChipList("band-weak-chips", attempt.weakAreas, "badge-danger", "No weak areas detected");

  // 3. Weak Area Engine Section
  renderWeakAreaEngine(attempt);

  // 4. Question Review Section
  renderQuestionReviewList(attempt, currentReviewFilter);
}

function animateScoreCounter(el, targetPercent) {
  if (!el) return;
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    el.textContent = `${targetPercent}%`;
    return;
  }

  const duration = 950;
  const startTime = performance.now();

  const tick = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.round(eased * targetPercent);
    el.textContent = `${currentVal}%`;
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = `${targetPercent}%`;
    }
  };

  requestAnimationFrame(tick);
}

function renderChipList(containerId, items, badgeClass, emptyText) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!Array.isArray(items) || items.length === 0) {
    el.innerHTML = `<span style="font-size:0.84rem; color:var(--text-muted);">${escapeHtml(emptyText)}</span>`;
    return;
  }
  el.innerHTML = items
    .map((topic) => `<span class="badge ${badgeClass}">${escapeHtml(topic)}</span>`)
    .join("");
}

function renderWeakAreaEngine(attempt) {
  const titleEl = document.getElementById("weak-engine-title");
  const gridEl = document.getElementById("weak-diagnostic-grid");
  const methodEl = document.getElementById("weak-methodology-text");

  const diagnostics = Array.isArray(attempt.topicDiagnostics) ? attempt.topicDiagnostics : [];
  const needsStrengthening = diagnostics.filter((d) => d.status !== "Strong");

  if (titleEl) {
    if (needsStrengthening.length > 0) {
      titleEl.textContent = `EXAMIVO found ${needsStrengthening.length} area${needsStrengthening.length > 1 ? "s" : ""} to strengthen.`;
    } else {
      titleEl.textContent = "All tested concepts are currently in your Strong band.";
    }
  }

  if (gridEl) {
    gridEl.innerHTML = diagnostics
      .map((diag) => {
        const badgeClass =
          diag.status === "Needs Practice"
            ? "badge-danger"
            : diag.status === "Areas to Practice"
            ? "badge-warning"
            : "badge-success";

        return `
          <div class="diagnostic-topic-row">
            <div class="diagnostic-topic-top">
              <span class="diagnostic-topic-name">${escapeHtml(diag.topic)}</span>
              <span class="badge ${badgeClass}">${escapeHtml(diag.status)}</span>
            </div>
            <div class="diagnostic-explanation">${escapeHtml(diag.reason)}</div>
          </div>
        `;
      })
      .join("");
  }

  if (methodEl) {
    methodEl.textContent =
      "How EXAMIVO determined your concept mastery: Each question in your examination is mapped to a specific topic and cognitive skill (recall, application, calculation, or analysis). Topics below 60% accuracy are classified as Needs Practice; topics between 60% and 84% are marked as Areas to Practice; topics at 85% and above are classified as Strong.";
  }
}

/* ==========================================================================
   QUESTION REVIEW SECTION
   ========================================================================== */

function renderQuestionReviewList(attempt, filter = "all") {
  const listEl = document.getElementById("question-review-list");
  if (!listEl) return;

  const allReviews = Array.isArray(attempt.questionReviews) ? attempt.questionReviews : [];
  const filtered = allReviews.filter((item) => {
    if (filter === "wrong") return !item.isCorrect;
    if (filter === "correct") return item.isCorrect;
    if (filter === "flagged") return Boolean(item.flagged);
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <h3>No questions match this filter.</h3>
        <p>Switch filter tabs above to inspect all questions from your examination.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered
    .map((rev) => {
      const statusBadge = rev.isCorrect
        ? `<span class="badge badge-success">✓ Correct</span>`
        : `<span class="badge badge-danger">✕ Incorrect</span>`;

      return `
        <article class="review-question-card ${rev.isCorrect ? "is-correct" : "is-wrong"}">
          <div class="review-q-header">
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span style="font-family:var(--font-mono); font-weight:700; font-size:0.88rem; color:var(--primary);">
                Question ${rev.index + 1}
              </span>
              ${statusBadge}
              ${rev.flagged ? `<span class="badge badge-warning">⚑ Flagged</span>` : ""}
            </div>
            <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
              <span class="badge badge-neutral">${escapeHtml(rev.topic)}</span>
              <span class="badge badge-neutral">${escapeHtml((rev.difficulty || "medium").toUpperCase())}</span>
            </div>
          </div>

          <div class="review-q-text">${escapeHtml(rev.question)}</div>

          <div class="review-answers-compare">
            <div class="review-ans-box ${rev.isCorrect ? "correct-std" : "user-wrong"}">
              <div class="review-ans-label">Your Answer</div>
              <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(rev.userAnswerFormatted)}</div>
            </div>
            <div class="review-ans-box correct-std">
              <div class="review-ans-label">Correct Answer</div>
              <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(rev.correctAnswerFormatted)}</div>
            </div>
          </div>

          <div class="review-explanation-box">
            <div style="font-size:0.76rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--primary); margin-bottom:0.3rem;">
              ${rev.isCorrect ? "Concept Explanation" : "Why This Matters & Step-by-Step Solution"}
            </div>
            <div>${escapeHtml(rev.explanation)}</div>
          </div>
        </article>
      `;
    })
    .join("");
}

/* ==========================================================================
   ACTIONS: PRACTICE MY WEAK AREAS & STUDY MY MISTAKES
   ========================================================================== */

function bindResultsActions() {
  // Filter tabs
  document.querySelectorAll("[data-review-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentReviewFilter = btn.getAttribute("data-review-filter");
      document.querySelectorAll("[data-review-filter]").forEach((b) => {
        b.classList.toggle("selected", b.getAttribute("data-review-filter") === currentReviewFilter);
      });
      renderQuestionReviewList(currentAttempt, currentReviewFilter);
    });
  });

  // Practice My Weak Areas Button
  const practiceWeakBtn = document.getElementById("practice-weak-areas-btn");
  if (practiceWeakBtn) {
    practiceWeakBtn.addEventListener("click", handlePracticeMyWeakAreas);
  }

  // Study My Mistakes Button
  const studyMistakesBtn = document.getElementById("study-mistakes-btn");
  if (studyMistakesBtn) {
    studyMistakesBtn.addEventListener("click", () => {
      navigateTo("study.html");
    });
  }

  // Save Progress Button for Guests
  const saveProgressBtn = document.getElementById("guest-save-progress-btn");
  if (saveProgressBtn) {
    saveProgressBtn.addEventListener("click", () => {
      promptAuthForFeature(
        "Create an account or sign in to permanently save this exam result and track your weak areas across devices.",
        async () => {
          await syncPendingGuestAttemptsToFirestore();
          showToast("Exam saved.", "success");
        }
      );
    });
  }

  updateSaveBannerState(getCurrentUser());
}

function updateSaveBannerState(user) {
  const guestBanner = document.getElementById("guest-save-banner");
  if (!guestBanner) return;
  guestBanner.style.display = user ? "none" : "flex";
}

async function handlePracticeMyWeakAreas() {
  if (!currentAttempt) return;

  const targetTopics = [
    ...(currentAttempt.weakAreas || []),
    ...(currentAttempt.practiceAreas || [])
  ];

  const missedQuestions = (currentAttempt.questionReviews || [])
    .filter((q) => !q.isCorrect)
    .map((q) => ({
      question: q.question,
      topic: q.topic,
      explanation: q.explanation
    }));

  const effectiveTopics =
    targetTopics.length > 0
      ? targetTopics
      : [...new Set((currentAttempt.questionReviews || []).map((q) => q.topic))];

  const overlay = document.getElementById("weak-practice-overlay");
  if (overlay) {
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
  }

  const updateStageUI = (activeIdx, aiState) => {
    renderAIStatus(aiState, "#weak-practice-core-slot", { size: "lg", showLabel: true });
    const listEl = document.getElementById("weak-practice-stages-list");
    if (!listEl) return;
    listEl.innerHTML = WEAK_PRACTICE_STAGES.map((label, idx) => {
      let statusClass = "";
      let icon = `<span class="stage-dot-future"></span>`;
      if (idx < activeIdx) {
        statusClass = "completed";
        icon = `<span class="stage-check-completed">✓</span>`;
      } else if (idx === activeIdx) {
        statusClass = "active";
        icon = `<span class="stage-dot-active"></span>`;
      }
      return `
        <div class="thinking-stage-item ${statusClass}">
          <span class="stage-icon-slot">${icon}</span>
          <span>${escapeHtml(label)}</span>
        </div>
      `;
    }).join("");
  };

  try {
    const blueprint = await runWeakAreaPracticePipeline(
      {
        classLevel: currentAttempt.classLevel,
        subject: currentAttempt.subject,
        examType: currentAttempt.examType,
        difficulty: currentAttempt.difficulty || "Medium",
        questionCount: Math.min(10, Math.max(5, effectiveTopics.length * 3)),
        weakTopics: effectiveTopics,
        missedQuestions,
        materialSummary: currentAttempt.materialSummary || ""
      },
      updateStageUI
    );

    trackEvent("practice_repeated", {
      subject: currentAttempt.subject,
      weakTopicsCount: effectiveTopics.length
    });

    const newExamBundle = {
      examId: generateId("exam"),
      title: `${currentAttempt.subject} — Weak Area Targeted Practice`,
      classLevel: currentAttempt.classLevel,
      subject: currentAttempt.subject,
      examType: currentAttempt.examType,
      difficulty: currentAttempt.difficulty || "Medium",
      examMode: "practice",
      timed: true,
      durationSeconds: blueprint.questions.length * 90,
      materialSummary: blueprint.materialSummary || currentAttempt.materialSummary || "",
      examFocus: blueprint.examFocus,
      questions: blueprint.questions,
      startedAtIso: new Date().toISOString()
    };

    setActiveExamSession(newExamBundle);
    saveExamToFirestore(newExamBundle).catch(() => {});

    if (overlay) overlay.classList.remove("active");
    showToast("Practice generated.", "success");
    navigateTo("exam.html");
  } catch (err) {
    if (overlay) overlay.classList.remove("active");
    showToast(err.message || "Something went wrong.", "danger");
  }
}
