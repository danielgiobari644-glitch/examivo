/**
 * EXAMIVO — "Study My Mistakes" Revision Engine & Retest Controller (study.html)
 * Generates Short Revision Notes, Important Concepts, Worked Examples,
 * Interactive Check Questions, and "Retest Me".
 */

import {
  escapeHtml,
  generateId
} from "./utils.js";
import {
  initCommonUI,
  renderAIStatus,
  showToast,
  navigateTo
} from "./ui.js";
import { initAuth } from "./auth.js";
import {
  getActiveResultSession,
  getActiveStudySession,
  setActiveStudySession,
  setActiveExamSession,
  saveStudySessionToFirestore,
  saveExamToFirestore
} from "./storage.js";
import {
  generateStudyMistakesGuide,
  runWeakAreaPracticePipeline,
  validateAndNormalizeQuestion
} from "./ai.js";
import { trackEvent } from "./firebase.js";

let activeAttempt = null;
let activeStudyData = null;

document.addEventListener("DOMContentLoaded", async () => {
  initCommonUI();
  initAuth();

  activeAttempt = getActiveResultSession();
  const cachedStudy = getActiveStudySession();

  if (cachedStudy && activeAttempt && cachedStudy.attemptId === activeAttempt.attemptId) {
    activeStudyData = cachedStudy;
    renderStudyModules(activeStudyData);
  } else if (activeAttempt) {
    await buildStudyGuideFromAttempt(activeAttempt);
  } else if (cachedStudy) {
    activeStudyData = cachedStudy;
    renderStudyModules(activeStudyData);
  } else {
    renderEmptyStudyState();
  }

  const retestBtn = document.getElementById("retest-me-btn");
  if (retestBtn) {
    retestBtn.addEventListener("click", handleRetestMe);
  }
});

function renderEmptyStudyState() {
  const root = document.getElementById("study-content-root");
  if (!root) return;
  root.innerHTML = `
    <div class="empty-state" style="margin-top:2rem;">
      ${renderAIStatus("idle", null, { size: "md", showLabel: false })}
      <h3>Your personalized revision notes will appear here.</h3>
      <p>Complete a practice examination first, then click "Study My Mistakes" so EXAMIVO can build targeted notes and worked examples around the exact questions you missed.</p>
      <a href="setup.html" class="btn btn-primary btn-lg" data-smooth-nav>Start Preparing</a>
    </div>
  `;
}

async function buildStudyGuideFromAttempt(attempt) {
  const loadingBox = document.getElementById("study-loading-box");
  const contentBox = document.getElementById("study-modules-container");

  if (loadingBox) {
    loadingBox.style.display = "flex";
    renderAIStatus("thinking", "#study-ai-core-slot", {
      size: "lg",
      showLabel: true,
      customLabel: "Synthesizing Revision Notes"
    });
  }
  if (contentBox) contentBox.style.display = "none";

  const missedReviews = (attempt.questionReviews || []).filter((q) => !q.isCorrect);
  const targetReviews =
    missedReviews.length > 0 ? missedReviews : (attempt.questionReviews || []).slice(0, 4);

  const topicsCovered = [...new Set(targetReviews.map((r) => r.topic || attempt.subject))];

  try {
    const response = await generateStudyMistakesGuide({
      attemptId: attempt.attemptId,
      classLevel: attempt.classLevel,
      subject: attempt.subject,
      examType: attempt.examType,
      topicsCovered,
      missedItems: targetReviews.map((r) => ({
        question: r.question,
        userAnswer: r.userAnswerFormatted,
        correctAnswer: r.correctAnswerFormatted,
        explanation: r.explanation,
        topic: r.topic
      }))
    });

    activeStudyData = {
      sessionId: generateId("study"),
      attemptId: attempt.attemptId,
      classLevel: attempt.classLevel,
      subject: attempt.subject,
      examType: attempt.examType,
      topicsCovered,
      modules: response.modules || [],
      retestQuestions: response.retestQuestions || []
    };

    setActiveStudySession(activeStudyData);
    saveStudySessionToFirestore(activeStudyData).catch(() => {});

    if (loadingBox) loadingBox.style.display = "none";
    if (contentBox) contentBox.style.display = "block";
    renderStudyModules(activeStudyData);
  } catch (err) {
    if (loadingBox) {
      loadingBox.innerHTML = `
        <div class="error-state-card" style="width:100%;">
          ${renderAIStatus("error", null, { size: "sm", showLabel: false })}
          <h3>Something went wrong.</h3>
          <p>${escapeHtml(err.message || "EXAMIVO couldn't complete that request.")}</p>
          <button type="button" class="btn btn-primary" id="retry-study-btn">Try Again</button>
        </div>
      `;
      document.getElementById("retry-study-btn")?.addEventListener("click", () => {
        window.location.reload();
      });
    }
  }
}

function renderStudyModules(studyData) {
  const loadingBox = document.getElementById("study-loading-box");
  const contentBox = document.getElementById("study-modules-container");
  const headerMeta = document.getElementById("study-header-meta");
  const modulesListEl = document.getElementById("study-modules-list");

  if (loadingBox) loadingBox.style.display = "none";
  if (contentBox) contentBox.style.display = "block";

  if (headerMeta) {
    headerMeta.innerHTML = `
      <span class="badge badge-primary">${escapeHtml(studyData.classLevel)}</span>
      <span class="badge badge-accent">${escapeHtml(studyData.subject)}</span>
      <span class="badge badge-neutral">${escapeHtml(studyData.examType)}</span>
      <span class="badge badge-neutral">${(studyData.modules || []).length} Targeted Revision Module${(studyData.modules || []).length === 1 ? "" : "s"}</span>
    `;
  }

  if (!modulesListEl) return;

  modulesListEl.innerHTML = (studyData.modules || [])
    .map((mod, idx) => {
      const concepts = Array.isArray(mod.importantConcepts) ? mod.importantConcepts : [];
      const practiceQ = mod.practiceQuestion || null;

      return `
        <section class="study-module-card">
          <div class="study-module-header">
            <div>
              <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--primary);">
                Concept Module ${idx + 1}
              </span>
              <h2 style="font-size:1.35rem; margin-top:0.2rem;">${escapeHtml(mod.topic || "Core Concept")}</h2>
            </div>
            <span class="badge badge-warning">Targeted Revision</span>
          </div>

          <div style="margin-bottom:1.25rem;">
            <h4 style="font-size:0.82rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin-bottom:0.45rem;">
              Short Revision Notes
            </h4>
            <p style="font-size:0.96rem; color:var(--text-primary); line-height:1.68; white-space:pre-wrap;">${escapeHtml(mod.revisionNotes || "")}</p>
          </div>

          <div class="study-notes-grid" style="margin-bottom:1.25rem;">
            <div class="study-subbox">
              <h4>Important Concepts & Key Rules</h4>
              <ul style="padding-left:1.15rem; display:flex; flex-direction:column; gap:0.4rem; color:var(--text-secondary); font-size:0.9rem;">
                ${concepts.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
              </ul>
            </div>
            <div class="study-subbox">
              <h4>Worked Example (${escapeHtml(studyData.classLevel)} Level)</h4>
              <div style="font-size:0.9rem; color:var(--text-secondary); line-height:1.6; white-space:pre-wrap;">${escapeHtml(mod.workedExample || "")}</div>
            </div>
          </div>

          ${
            practiceQ
              ? `
              <div class="study-subbox" style="border-color:var(--border-highlight);">
                <h4>Quick Concept Check</h4>
                <p style="font-weight:600; color:var(--text-primary); margin-bottom:0.75rem;">${escapeHtml(practiceQ.question || "")}</p>
                <button type="button" class="btn btn-secondary btn-sm" data-reveal-check="${idx}">
                  Reveal Answer & Explanation
                </button>
                <div id="study-check-ans-${idx}" style="display:none; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--border-subtle); font-size:0.88rem;">
                  <div style="color:var(--success); font-weight:700; margin-bottom:0.25rem;">
                    Answer: ${escapeHtml(practiceQ.answer || "")}
                  </div>
                  <div style="color:var(--text-secondary);">${escapeHtml(practiceQ.explanation || "")}</div>
                </div>
              </div>
            `
              : ""
          }
        </section>
      `;
    })
    .join("");

  modulesListEl.querySelectorAll("[data-reveal-check]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = btn.getAttribute("data-reveal-check");
      const box = document.getElementById(`study-check-ans-${idx}`);
      if (box) {
        box.style.display = "block";
        btn.style.display = "none";
      }
    });
  });
}

async function handleRetestMe() {
  if (!activeStudyData) return;

  const retestBtn = document.getElementById("retest-me-btn");
  if (retestBtn) {
    retestBtn.disabled = true;
    retestBtn.textContent = "Building Your Retest...";
  }

  try {
    // If the study session already includes validated retest questions, use them or generate fresh ones
    let questions = [];
    if (Array.isArray(activeStudyData.retestQuestions) && activeStudyData.retestQuestions.length >= 4) {
      questions = activeStudyData.retestQuestions
        .map((q, i) => validateAndNormalizeQuestion(q, i, activeStudyData.subject, "Medium"))
        .filter(Boolean);
    }

    if (questions.length < 4) {
      const blueprint = await runWeakAreaPracticePipeline({
        classLevel: activeStudyData.classLevel,
        subject: activeStudyData.subject,
        examType: activeStudyData.examType,
        difficulty: "Exam Level",
        questionCount: 6,
        weakTopics: activeStudyData.topicsCovered || [activeStudyData.subject],
        missedQuestions: []
      });
      questions = blueprint.questions;
    }

    const retestExamBundle = {
      examId: generateId("exam"),
      title: `${activeStudyData.subject} — Mastery Retest`,
      classLevel: activeStudyData.classLevel,
      subject: activeStudyData.subject,
      examType: activeStudyData.examType,
      difficulty: "Exam Level",
      examMode: "exam",
      timed: true,
      durationSeconds: questions.length * 90,
      materialSummary: `Targeted Retest on ${(activeStudyData.topicsCovered || []).join(", ")}`,
      examFocus: {
        highPriority: (activeStudyData.topicsCovered || []).map((t) => ({
          concept: t,
          reason: "Targeted retest after reviewing your mistake revision guide."
        })),
        alsoRevise: [],
        rationale: "Prioritized based on the concepts you just revised in Study My Mistakes."
      },
      questions,
      startedAtIso: new Date().toISOString()
    };

    setActiveExamSession(retestExamBundle);
    saveExamToFirestore(retestExamBundle).catch(() => {});
    trackEvent("practice_repeated", { mode: "retest_me", subject: activeStudyData.subject });

    navigateTo("exam.html");
  } catch (err) {
    showToast(err.message || "Could not start retest right now.", "danger");
    if (retestBtn) {
      retestBtn.disabled = false;
      retestBtn.textContent = "Retest Me";
    }
  }
}
