/**
 * EXAMIVO — Active Examination Controller (exam.html)
 * Handles Question Transitions, Timer, Navigation Panel (Unanswered / Answered / Flagged / Current),
 * Practice Mode Immediate Feedback, and the "ANALYZING YOUR PERFORMANCE" Submission Pipeline.
 */

import {
  escapeHtml,
  formatDuration,
  generateId,
  QUESTION_TYPE_LABELS
} from "./utils.js";
import {
  initCommonUI,
  renderAIStatus,
  showToast,
  openModal,
  closeModal,
  navigateTo
} from "./ui.js";
import { initAuth } from "./auth.js";
import {
  getActiveExamSession,
  setActiveResultSession,
  saveAttemptAndWeakAreas
} from "./storage.js";
import {
  renderQuestionInteractiveArea,
  hasUserAnswered,
  evaluateSingleQuestion,
  isOptionBasedQuestion
} from "./questions.js";
import { evaluateOpenResponsesViaAI } from "./ai.js";
import { trackEvent } from "./firebase.js";

const SUBMISSION_STAGES = [
  "Checking answers",
  "Measuring performance",
  "Identifying weak areas",
  "Building your study recommendations"
];

const examRuntime = {
  examBundle: null,
  questions: [],
  currentIndex: 0,
  userAnswers: {}, // { [questionIdx]: value }
  flaggedSet: new Set(),
  practiceRevealedSet: new Set(),
  remainingSeconds: 0,
  elapsedSeconds: 0,
  timerInterval: null,
  lowTimeWarned: false,
  isSubmitting: false
};

document.addEventListener("DOMContentLoaded", () => {
  initCommonUI();
  initAuth();

  const bundle = getActiveExamSession();
  if (!bundle || !Array.isArray(bundle.questions) || bundle.questions.length === 0) {
    renderNoActiveExamState();
    return;
  }

  examRuntime.examBundle = bundle;
  examRuntime.questions = bundle.questions;
  examRuntime.remainingSeconds = Number(bundle.durationSeconds) || 0;

  hydrateExamHeader(bundle);
  renderNavigationPanel();
  renderCurrentQuestion(false);
  bindExamActionButtons();
  startExamTimer();
});

function renderNoActiveExamState() {
  const workspace = document.getElementById("exam-workspace-container");
  if (!workspace) return;
  workspace.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1; margin-top:2rem;">
      ${renderAIStatus("idle", null, { size: "md", showLabel: false })}
      <h3>No active examination in progress.</h3>
      <p>Set up your study material, class, and examination format to begin a tailored practice session.</p>
      <a href="setup.html" class="btn btn-primary btn-lg" data-smooth-nav>Start Preparing</a>
    </div>
  `;
}

function hydrateExamHeader(bundle) {
  const subjEl = document.getElementById("exam-header-subject");
  const classEl = document.getElementById("exam-header-class");
  const typeEl = document.getElementById("exam-header-type");
  const modeEl = document.getElementById("exam-header-mode");

  if (subjEl) subjEl.textContent = bundle.subject || "Subject";
  if (classEl) classEl.textContent = bundle.classLevel || "";
  if (typeEl) typeEl.textContent = bundle.examType || "";
  if (modeEl) {
    modeEl.textContent = bundle.examMode === "practice" ? "PRACTICE MODE" : "EXAM MODE";
    modeEl.className = `badge ${bundle.examMode === "practice" ? "badge-accent" : "badge-primary"}`;
  }
}

/* ==========================================================================
   TIMER ENGINE (Timed & Untimed Examinations + Subtle Visual Warning)
   ========================================================================== */

function startExamTimer() {
  const timerBox = document.getElementById("exam-timer-box");
  const timerValueEl = document.getElementById("exam-timer-value");
  const timerLabelEl = document.getElementById("exam-timer-label");

  const isTimed = Boolean(examRuntime.examBundle.timed && examRuntime.remainingSeconds > 0);

  if (!isTimed) {
    if (timerLabelEl) timerLabelEl.textContent = "UNTIMED";
    if (timerValueEl) timerValueEl.textContent = "00:00";
  } else {
    if (timerLabelEl) timerLabelEl.textContent = "TIME REMAINING";
    if (timerValueEl) timerValueEl.textContent = formatDuration(examRuntime.remainingSeconds);
  }

  examRuntime.timerInterval = setInterval(() => {
    examRuntime.elapsedSeconds += 1;

    if (!isTimed) {
      if (timerValueEl) timerValueEl.textContent = formatDuration(examRuntime.elapsedSeconds);
      return;
    }

    examRuntime.remainingSeconds = Math.max(0, examRuntime.remainingSeconds - 1);
    if (timerValueEl) {
      timerValueEl.textContent = formatDuration(examRuntime.remainingSeconds);
    }

    // Subtle visual warning when time is low (<= 20% or <= 120s)
    if (timerBox) {
      if (examRuntime.remainingSeconds <= 60) {
        timerBox.classList.remove("warning");
        timerBox.classList.add("critical");
      } else if (examRuntime.remainingSeconds <= 180) {
        timerBox.classList.add("warning");
        if (!examRuntime.lowTimeWarned) {
          examRuntime.lowTimeWarned = true;
          showToast("Less than 3 minutes remaining.", "warning");
        }
      }
    }

    if (examRuntime.remainingSeconds === 0 && !examRuntime.isSubmitting) {
      clearInterval(examRuntime.timerInterval);
      showToast("Time is up. Submitting your examination for analysis.", "warning");
      executeExamSubmission();
    }
  }, 1000);
}

/* ==========================================================================
   QUESTION RENDERING & SMOOTH TRANSITIONS
   ========================================================================== */

function goToQuestion(targetIdx) {
  if (targetIdx < 0 || targetIdx >= examRuntime.questions.length) return;
  if (targetIdx === examRuntime.currentIndex) return;

  const cardBody = document.getElementById("question-transition-body");
  if (cardBody) {
    cardBody.classList.remove("question-enter");
    cardBody.classList.add("question-exit");
    setTimeout(() => {
      examRuntime.currentIndex = targetIdx;
      renderCurrentQuestion(true);
      renderNavigationPanel();
    }, 140);
  } else {
    examRuntime.currentIndex = targetIdx;
    renderCurrentQuestion(false);
    renderNavigationPanel();
  }
}

function renderCurrentQuestion(animateIn = true) {
  const idx = examRuntime.currentIndex;
  const total = examRuntime.questions.length;
  const question = examRuntime.questions[idx];
  if (!question) return;

  const counterEl = document.getElementById("question-counter-label");
  const topicBadgeEl = document.getElementById("question-topic-badge");
  const diffBadgeEl = document.getElementById("question-difficulty-badge");
  const typeBadgeEl = document.getElementById("question-type-badge");
  const promptEl = document.getElementById("question-prompt-text");
  const interactiveArea = document.getElementById("question-interactive-area");
  const feedbackDrawer = document.getElementById("practice-feedback-drawer");
  const cardBody = document.getElementById("question-transition-body");

  if (counterEl) counterEl.textContent = `Question ${idx + 1} of ${total}`;
  if (topicBadgeEl) topicBadgeEl.textContent = question.topic || examRuntime.examBundle.subject;
  if (diffBadgeEl) diffBadgeEl.textContent = (question.difficulty || "medium").toUpperCase();
  if (typeBadgeEl) typeBadgeEl.textContent = QUESTION_TYPE_LABELS[question.type] || "Question";
  if (promptEl) promptEl.textContent = question.question;

  const isPracticeMode = examRuntime.examBundle.examMode === "practice";
  const isPracticeRevealed = isPracticeMode && examRuntime.practiceRevealedSet.has(idx);
  const currentAnswer = examRuntime.userAnswers[idx];

  renderQuestionInteractiveArea(question, currentAnswer, interactiveArea, {
    revealFeedback: isPracticeRevealed,
    onAnswerChange: (newVal) => {
      examRuntime.userAnswers[idx] = newVal;
      renderNavigationPanel();

      // In Practice Mode, if option-based, reveal immediate feedback automatically on selection
      if (isPracticeMode && isOptionBasedQuestion(question)) {
        examRuntime.practiceRevealedSet.add(idx);
        renderCurrentQuestion(false);
      }
    }
  });

  // Render Practice Mode Instant Feedback if revealed
  if (feedbackDrawer) {
    if (isPracticeRevealed) {
      const evalRes = evaluateSingleQuestion(question, currentAnswer);
      feedbackDrawer.style.display = "block";
      feedbackDrawer.className = `practice-feedback-drawer ${evalRes.isCorrect ? "correct" : "incorrect"}`;
      feedbackDrawer.innerHTML = `
        <div class="practice-feedback-header" style="color:${evalRes.isCorrect ? "var(--success)" : "var(--danger)"};">
          <span>${evalRes.isCorrect ? "✓ Correct Answer" : "✕ Needs Revision"}</span>
        </div>
        <div style="font-size:0.88rem; color:var(--text-primary); margin-bottom:0.35rem;">
          <strong>Correct Answer:</strong> ${escapeHtml(evalRes.correctAnswerFormatted)}
        </div>
        <div style="font-size:0.86rem; color:var(--text-secondary);">
          ${escapeHtml(question.explanation)}
        </div>
      `;
    } else if (isPracticeMode && !isOptionBasedQuestion(question) && hasUserAnswered(question, currentAnswer)) {
      feedbackDrawer.style.display = "block";
      feedbackDrawer.className = "practice-feedback-drawer";
      feedbackDrawer.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" id="check-practice-open-btn">
          Check Answer & Show Explanation
        </button>
      `;
      const checkBtn = document.getElementById("check-practice-open-btn");
      if (checkBtn) {
        checkBtn.addEventListener("click", () => {
          examRuntime.practiceRevealedSet.add(idx);
          renderCurrentQuestion(false);
        });
      }
    } else {
      feedbackDrawer.style.display = "none";
      feedbackDrawer.innerHTML = "";
    }
  }

  // Update Flag, Previous, Next button states
  const prevBtn = document.getElementById("exam-prev-btn");
  const nextBtn = document.getElementById("exam-next-btn");
  const flagBtn = document.getElementById("exam-flag-btn");

  if (prevBtn) prevBtn.disabled = idx === 0;
  if (nextBtn) {
    nextBtn.textContent = idx === total - 1 ? "Review & Submit" : "Next →";
  }
  if (flagBtn) {
    const isFlagged = examRuntime.flaggedSet.has(idx);
    flagBtn.classList.toggle("flagged", isFlagged);
    flagBtn.innerHTML = isFlagged ? "⚑ Flagged" : "⚐ Flag";
  }

  if (cardBody && animateIn) {
    cardBody.classList.remove("question-exit");
    cardBody.classList.add("question-enter");
  }
}

/* ==========================================================================
   QUESTION NAVIGATION PANEL (Unanswered | Answered | Flagged | Current)
   ========================================================================== */

function renderNavigationPanel() {
  const gridEl = document.getElementById("question-num-grid");
  const progressCountEl = document.getElementById("nav-answered-summary");
  if (!gridEl) return;

  let answeredCount = 0;

  gridEl.innerHTML = examRuntime.questions
    .map((q, idx) => {
      const answered = hasUserAnswered(q, examRuntime.userAnswers[idx]);
      if (answered) answeredCount += 1;
      const flagged = examRuntime.flaggedSet.has(idx);
      const isCurrent = idx === examRuntime.currentIndex;

      const classes = ["q-nav-btn"];
      if (answered) classes.push("answered");
      if (flagged) classes.push("flagged");
      if (isCurrent) classes.push("current");

      const stateLabel = isCurrent
        ? "Current"
        : flagged
        ? "Flagged"
        : answered
        ? "Answered"
        : "Unanswered";

      return `
        <button
          type="button"
          class="${classes.join(" ")}"
          data-jump-idx="${idx}"
          aria-label="Question ${idx + 1} (${stateLabel})"
          title="Question ${idx + 1}: ${stateLabel}"
        >
          ${idx + 1}
        </button>
      `;
    })
    .join("");

  if (progressCountEl) {
    progressCountEl.textContent = `${answeredCount} / ${examRuntime.questions.length} answered`;
  }

  gridEl.querySelectorAll("[data-jump-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = Number(btn.getAttribute("data-jump-idx"));
      goToQuestion(target);
    });
  });
}

function bindExamActionButtons() {
  const prevBtn = document.getElementById("exam-prev-btn");
  const nextBtn = document.getElementById("exam-next-btn");
  const flagBtn = document.getElementById("exam-flag-btn");
  const submitBtn = document.getElementById("exam-submit-btn");
  const panelSubmitBtn = document.getElementById("panel-submit-btn");
  const confirmSubmitBtn = document.getElementById("confirm-submit-exam-btn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (examRuntime.currentIndex > 0) {
        goToQuestion(examRuntime.currentIndex - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (examRuntime.currentIndex < examRuntime.questions.length - 1) {
        goToQuestion(examRuntime.currentIndex + 1);
      } else {
        promptSubmitConfirmation();
      }
    });
  }

  if (flagBtn) {
    flagBtn.addEventListener("click", () => {
      const idx = examRuntime.currentIndex;
      if (examRuntime.flaggedSet.has(idx)) {
        examRuntime.flaggedSet.delete(idx);
      } else {
        examRuntime.flaggedSet.add(idx);
      }
      renderCurrentQuestion(false);
      renderNavigationPanel();
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", promptSubmitConfirmation);
  }
  if (panelSubmitBtn) {
    panelSubmitBtn.addEventListener("click", promptSubmitConfirmation);
  }
  if (confirmSubmitBtn) {
    confirmSubmitBtn.addEventListener("click", () => {
      closeModal("submit-confirm-modal");
      executeExamSubmission();
    });
  }

  // Keyboard shortcuts (Left/Right arrow when not typing in an input)
  document.addEventListener("keydown", (e) => {
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "ArrowRight" && examRuntime.currentIndex < examRuntime.questions.length - 1) {
      goToQuestion(examRuntime.currentIndex + 1);
    } else if (e.key === "ArrowLeft" && examRuntime.currentIndex > 0) {
      goToQuestion(examRuntime.currentIndex - 1);
    }
  });
}

function promptSubmitConfirmation() {
  const total = examRuntime.questions.length;
  let answered = 0;
  examRuntime.questions.forEach((q, idx) => {
    if (hasUserAnswered(q, examRuntime.userAnswers[idx])) answered += 1;
  });
  const unanswered = total - answered;
  const flagged = examRuntime.flaggedSet.size;

  const summaryEl = document.getElementById("submit-modal-summary");
  if (summaryEl) {
    if (unanswered === 0 && flagged === 0) {
      summaryEl.textContent = `You have answered all ${total} questions. Ready for EXAMIVO to grade your examination and analyze your performance?`;
    } else {
      summaryEl.textContent = `You have answered ${answered} of ${total} questions (${unanswered} unanswered${flagged > 0 ? `, ${flagged} flagged` : ""}). Would you like to submit now?`;
    }
  }
  openModal("submit-confirm-modal");
}

/* ==========================================================================
   SUBMISSION EXPERIENCE: "ANALYZING YOUR PERFORMANCE" & WEAK AREA ENGINE
   ========================================================================== */

async function executeExamSubmission() {
  if (examRuntime.isSubmitting) return;
  examRuntime.isSubmitting = true;
  if (examRuntime.timerInterval) clearInterval(examRuntime.timerInterval);

  const overlay = document.getElementById("submission-analysis-overlay");
  if (overlay) {
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
  }

  const updateStage = (activeIdx, aiState) => {
    renderAIStatus(aiState, "#submission-core-slot", { size: "lg", showLabel: true });
    const listEl = document.getElementById("submission-stages-list");
    if (!listEl) return;
    listEl.innerHTML = SUBMISSION_STAGES.map((label, idx) => {
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

  // Stage 0: Checking answers
  updateStage(0, "checking");
  await new Promise((r) => setTimeout(r, 420));

  // Check if any open-ended questions need backend AI evaluation
  const openItemsToGrade = [];
  examRuntime.questions.forEach((q, idx) => {
    const ans = examRuntime.userAnswers[idx];
    if (!isOptionBasedQuestion(q) && q.type !== "matching" && hasUserAnswered(q, ans)) {
      openItemsToGrade.push({
        index: idx,
        question: q.question,
        type: q.type,
        expectedAnswer: q.correctAnswer,
        userAnswer: String(ans)
      });
    }
  });

  let aiEvaluationsByIndex = {};
  if (openItemsToGrade.length > 0) {
    const aiEvalRes = await evaluateOpenResponsesViaAI({
      classLevel: examRuntime.examBundle.classLevel,
      subject: examRuntime.examBundle.subject,
      examType: examRuntime.examBundle.examType,
      items: openItemsToGrade
    });
    if (aiEvalRes && Array.isArray(aiEvalRes.evaluations)) {
      aiEvalRes.evaluations.forEach((ev) => {
        aiEvaluationsByIndex[ev.index] = ev;
      });
    }
  }

  // Stage 1: Measuring performance
  updateStage(1, "analyzing");
  await new Promise((r) => setTimeout(r, 450));

  let correctCount = 0;
  const questionReviews = examRuntime.questions.map((q, idx) => {
    const rawAns = examRuntime.userAnswers[idx];
    const evalResult = evaluateSingleQuestion(q, rawAns, aiEvaluationsByIndex[idx]);
    if (evalResult.isCorrect) {
      correctCount += 1;
    }

    return {
      index: idx,
      questionId: q.id,
      question: q.question,
      type: q.type,
      options: q.options || [],
      userAnswerRaw: rawAns !== undefined ? rawAns : null,
      userAnswerFormatted: evalResult.userAnswerFormatted,
      correctAnswerFormatted: evalResult.correctAnswerFormatted,
      isCorrect: evalResult.isCorrect,
      scoreRatio: evalResult.scoreRatio,
      explanation: evalResult.aiFeedback
        ? `${evalResult.aiFeedback}\n\n${q.explanation}`
        : q.explanation,
      topic: q.topic || examRuntime.examBundle.subject,
      sourceConcept: q.sourceConcept || q.topic || examRuntime.examBundle.subject,
      difficulty: q.difficulty || "medium",
      cognitiveSkill: q.cognitiveSkill || "application",
      flagged: examRuntime.flaggedSet.has(idx)
    };
  });

  // Stage 2: Identifying weak areas (Weak Area Engine)
  updateStage(2, "thinking");
  await new Promise((r) => setTimeout(r, 480));

  const totalQuestions = examRuntime.questions.length;
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Group performance by topic
  const topicMap = {};
  questionReviews.forEach((rev) => {
    const tName = rev.topic || "Core Concepts";
    if (!topicMap[tName]) {
      topicMap[tName] = {
        topic: tName,
        sourceConcept: rev.sourceConcept || tName,
        total: 0,
        correct: 0,
        missedQuestions: [],
        skillsTested: new Set()
      };
    }
    topicMap[tName].total += 1;
    if (rev.isCorrect) {
      topicMap[tName].correct += 1;
    } else {
      topicMap[tName].missedQuestions.push(rev.index + 1);
    }
    if (rev.cognitiveSkill) {
      topicMap[tName].skillsTested.add(rev.cognitiveSkill);
    }
  });

  const strongAreas = [];
  const practiceAreas = [];
  const weakAreas = [];

  const topicDiagnostics = Object.values(topicMap).map((entry) => {
    const accuracyPercent = Math.round((entry.correct / entry.total) * 100);
    let status = "Strong";
    let reason = "";

    const skillsList = [...entry.skillsTested].join(", ") || "concept application";

    if (accuracyPercent < 60) {
      status = "Needs Practice";
      weakAreas.push(entry.topic);
      reason = `Answered ${entry.correct} of ${entry.total} (${accuracyPercent}%) correctly. Missed Question${entry.missedQuestions.length > 1 ? "s" : ""} #${entry.missedQuestions.join(", #")} involving ${skillsList}.`;
    } else if (accuracyPercent < 85) {
      status = "Areas to Practice";
      practiceAreas.push(entry.topic);
      reason = `Answered ${entry.correct} of ${entry.total} (${accuracyPercent}%) correctly. Solid foundation, but needs refinement on Question #${entry.missedQuestions.join(", #")}.`;
    } else {
      status = "Strong";
      strongAreas.push(entry.topic);
      reason = `Answered ${entry.correct} of ${entry.total} (${accuracyPercent}%) correctly across ${skillsList}.`;
    }

    return {
      topic: entry.topic,
      sourceConcept: entry.sourceConcept,
      total: entry.total,
      correct: entry.correct,
      accuracyPercent,
      status,
      reason,
      missedQuestionNumbers: entry.missedQuestions
    };
  });

  // Sort diagnostics so weakest areas appear first
  topicDiagnostics.sort((a, b) => a.accuracyPercent - b.accuracyPercent);

  // Stage 3: Building your study recommendations
  updateStage(3, "complete");
  await new Promise((r) => setTimeout(r, 480));

  const attemptBundle = {
    attemptId: generateId("att"),
    examId: examRuntime.examBundle.examId,
    title: examRuntime.examBundle.title,
    classLevel: examRuntime.examBundle.classLevel,
    subject: examRuntime.examBundle.subject,
    examType: examRuntime.examBundle.examType,
    difficulty: examRuntime.examBundle.difficulty,
    examMode: examRuntime.examBundle.examMode,
    materialSummary: examRuntime.examBundle.materialSummary || "",
    scorePercent,
    correctCount,
    totalQuestions,
    timeSpentSeconds: examRuntime.elapsedSeconds,
    strongAreas,
    practiceAreas,
    weakAreas,
    topicDiagnostics,
    questionReviews,
    createdAtIso: new Date().toISOString()
  };

  setActiveResultSession(attemptBundle);
  trackEvent("exam_completed", {
    subject: attemptBundle.subject,
    classLevel: attemptBundle.classLevel,
    examType: attemptBundle.examType,
    scorePercent
  });

  // Save to Firestore (or queue if guest)
  await saveAttemptAndWeakAreas(attemptBundle);

  navigateTo("results.html");
}
