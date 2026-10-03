/**
 * EXAMIVO — Landing Page, Dashboard & History Controller (index.html, app.html, history.html)
 * Connects Firestore attempts & weakAreas dynamically with zero hardcoded fake stats.
 */

import {
  escapeHtml,
  formatDate,
  formatDuration
} from "./utils.js";
import {
  initCommonUI,
  renderAIStatus,
  showToast,
  navigateTo
} from "./ui.js";
import {
  initAuth,
  promptAuthForFeature
} from "./auth.js";
import {
  fetchUserAttemptsFromFirestore,
  fetchUserWeakAreasFromFirestore,
  computeProgressMetrics,
  getActiveResultSession,
  setActiveResultSession,
  syncPendingGuestAttemptsToFirestore
} from "./storage.js";
import { trackEvent } from "./firebase.js";

const CLASS_ADAPTATION_EXAMPLES = {
  JSS1: {
    badge: "JSS1 · Simple, Clear English",
    concept: "Photosynthesis (Basic Science)",
    question: "Which gas do green plants take in from the air to make their food during photosynthesis?",
    explanation: "Green plants take in carbon dioxide through tiny openings in their leaves called stomata. Using sunlight and water, they turn this into food (glucose) and release oxygen."
  },
  JSS3: {
    badge: "JSS3 · Moderately Academic Language",
    concept: "Photosynthesis (Basic Science / BECE)",
    question: "During the light-dependent stage of photosynthesis, what is the primary role of chlorophyll inside the chloroplast?",
    explanation: "Chlorophyll absorbs solar energy, which is used to split water molecules (photolysis) into hydrogen ions and oxygen gas before carbon dioxide fixation occurs."
  },
  SS3: {
    badge: "SS3 · Senior-Secondary Exam Standard (WAEC / JAMB)",
    concept: "Photosynthesis (Biology — WASSCE / UTME)",
    question: "In the Calvin cycle (light-independent reactions) of C3 plants, which 5-carbon compound acts as the primary carbon dioxide acceptor?",
    explanation: "Ribulose-1,5-bisphosphate (RuBP) accepts CO2 catalyzed by the enzyme RuBisCO, forming an unstable 6-carbon intermediate that immediately splits into two molecules of 3-phosphoglycerate (PGA)."
  },
  University: {
    badge: "University · Tertiary Academic Terminology",
    concept: "Bioenergetics & Photosynthetic Electron Transport",
    question: "Explain how non-cyclic photophosphorylation establishes the proton-motive force across the thylakoid membrane to drive ATP synthesis.",
    explanation: "Plastoquinone (PQ) translocation and lumenal water oxidation by the oxygen-evolving complex (OEC) of Photosystem II generate a steep electrochemical proton gradient (ΔpH) across the thylakoid membrane, driving ATP synthase via chemiosmotic coupling."
  }
};

let allLoadedAttempts = [];

document.addEventListener("DOMContentLoaded", () => {
  initCommonUI();
  trackEvent("app_opened", { page: window.location.pathname });

  const pageType = document.body.getAttribute("data-page") || "landing";

  if (pageType === "landing") {
    initAuth();
    initLandingPage();
  } else if (pageType === "dashboard") {
    initAuth(async (user) => {
      if (user) {
        await syncPendingGuestAttemptsToFirestore();
      }
      await loadAndRenderDashboard(user);
    });
  } else if (pageType === "history") {
    initAuth(async (user) => {
      if (user) {
        await syncPendingGuestAttemptsToFirestore();
      }
      await loadAndRenderHistoryPage(user);
    });
  }
});

/* ==========================================================================
   LANDING PAGE (index.html)
   ========================================================================== */

function initLandingPage() {
  const heroCoreSlot = document.getElementById("hero-ai-core-slot");
  if (heroCoreSlot) {
    renderAIStatus("analyzing", heroCoreSlot, {
      size: "xl",
      showLabel: true,
      customLabel: "EXAMIVO Intelligence Active"
    });

    // Gently cycle the hero preview stage rows to illustrate the pipeline
    const stageRows = document.querySelectorAll("[data-hero-stage]");
    const statesCycle = ["reading", "analyzing", "thinking", "generating", "checking"];
    let idx = 0;

    setInterval(() => {
      idx = (idx + 1) % statesCycle.length;
      renderAIStatus(statesCycle[idx], heroCoreSlot, {
        size: "xl",
        showLabel: true
      });
      stageRows.forEach((row, rIdx) => {
        row.classList.toggle("active", rIdx === idx);
      });
    }, 3400);
  }

  // Class-Adaptive Language Showcase Tabs
  const demoTabs = document.querySelectorAll("[data-class-demo]");
  const demoOutput = document.getElementById("class-demo-output");

  const renderClassDemo = (levelKey) => {
    const data = CLASS_ADAPTATION_EXAMPLES[levelKey] || CLASS_ADAPTATION_EXAMPLES.SS3;
    if (!demoOutput) return;
    demoOutput.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
        <span class="badge badge-primary">${escapeHtml(data.badge)}</span>
        <span style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(data.concept)}</span>
      </div>
      <div style="font-weight:700; color:var(--text-primary); font-size:0.98rem; margin-bottom:0.65rem;">
        Q: ${escapeHtml(data.question)}
      </div>
      <div style="font-size:0.88rem; color:var(--text-secondary); padding-top:0.65rem; border-top:1px solid var(--border-subtle);">
        <strong style="color:var(--accent);">EXAMIVO Explanation:</strong> ${escapeHtml(data.explanation)}
      </div>
    `;
  };

  if (demoTabs.length > 0 && demoOutput) {
    renderClassDemo("SS3");
    demoTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const level = tab.getAttribute("data-class-demo");
        demoTabs.forEach((t) => t.classList.toggle("active", t === tab));
        renderClassDemo(level);
      });
    });
  }
}

/* ==========================================================================
   APP DASHBOARD (app.html)
   ========================================================================== */

async function loadAndRenderDashboard(user) {
  const welcomeCoreSlot = document.getElementById("dashboard-ai-core-slot");
  if (welcomeCoreSlot) {
    renderAIStatus("idle", welcomeCoreSlot, {
      size: "md",
      showLabel: true,
      customLabel: "Ready to Prepare"
    });
  }

  const greetingSubEl = document.getElementById("dashboard-greeting-sub");
  if (greetingSubEl) {
    if (user && user.displayName) {
      greetingSubEl.textContent = `Welcome back, ${user.displayName}. Upload your study notes or pick a weak concept to sharpen today.`;
    } else {
      greetingSubEl.textContent = "Give EXAMIVO your study material, select your class and examination format, and start targeted practice.";
    }
  }

  let attempts = [];
  let weakAreas = [];

  if (user) {
    [attempts, weakAreas] = await Promise.all([
      fetchUserAttemptsFromFirestore(25),
      fetchUserWeakAreasFromFirestore()
    ]);
  } else {
    // Include active session result if user just completed an exam as guest
    const sessionAttempt = getActiveResultSession();
    if (sessionAttempt) {
      attempts = [sessionAttempt];
      weakAreas = (sessionAttempt.topicDiagnostics || [])
        .filter((d) => d.status !== "Strong")
        .map((d) => ({
          topic: d.topic,
          subject: sessionAttempt.subject,
          classLevel: sessionAttempt.classLevel,
          examType: sessionAttempt.examType,
          accuracyPercent: d.accuracyPercent,
          status: d.status,
          reason: d.reason
        }));
    }
  }

  allLoadedAttempts = attempts;

  // 1. Render Progress Stats
  const metrics = computeProgressMetrics(attempts, weakAreas);
  const avgEl = document.getElementById("stat-average-score");
  const countEl = document.getElementById("stat-exams-completed");
  const strongSubjEl = document.getElementById("stat-strongest-subject");
  const improveEl = document.getElementById("stat-areas-improve");

  if (avgEl) avgEl.textContent = metrics.averageScore !== null ? `${metrics.averageScore}%` : "—";
  if (countEl) countEl.textContent = String(metrics.examsCompleted);
  if (strongSubjEl) strongSubjEl.textContent = metrics.strongestSubject;
  if (improveEl) {
    improveEl.textContent =
      metrics.areasToImproveCount > 0 ? `${metrics.areasToImproveCount} Concept${metrics.areasToImproveCount === 1 ? "" : "s"}` : "0";
  }

  // 2. Render Recent Practice
  renderRecentPracticeList(attempts.slice(0, 6));

  // 3. Render Weak Areas
  renderDashboardWeakAreas(weakAreas.slice(0, 6));
}

function renderRecentPracticeList(recentAttempts) {
  const container = document.getElementById("recent-practice-container");
  if (!container) return;

  if (!Array.isArray(recentAttempts) || recentAttempts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${renderAIStatus("idle", null, { size: "sm", showLabel: false })}
        <h3>Your first practice starts here.</h3>
        <p>Upload your material and let EXAMIVO build your first practice exam.</p>
        <a href="setup.html" class="btn btn-primary" data-smooth-nav>Start Preparing</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="practice-list">
      ${recentAttempts
        .map((att) => {
          const pct = Number(att.scorePercent) || 0;
          const pillClass = pct >= 75 ? "high" : pct >= 55 ? "mid" : "low";
          return `
            <div class="practice-item-card">
              <div class="practice-item-main">
                <div class="practice-item-title">${escapeHtml(att.title || `${att.subject} Practice`)}</div>
                <div class="practice-item-meta">
                  <span class="badge badge-neutral">${escapeHtml(att.classLevel)}</span>
                  <span>${escapeHtml(att.subject)}</span>
                  <span>·</span>
                  <span>${escapeHtml(att.examType)}</span>
                  <span>·</span>
                  <span>${escapeHtml(formatDate(att.createdAt || att.createdAtIso))}</span>
                </div>
              </div>
              <div class="practice-item-right">
                <span class="score-pill ${pillClass}">${pct}% (${att.correctCount}/${att.totalQuestions})</span>
                <button type="button" class="btn btn-secondary btn-sm" data-open-attempt="${escapeHtml(att.attemptId)}">
                  Review
                </button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  container.querySelectorAll("[data-open-attempt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-attempt");
      const found = allLoadedAttempts.find((a) => a.attemptId === id);
      if (found) {
        setActiveResultSession(found);
      }
      navigateTo(`results.html?attemptId=${encodeURIComponent(id)}`);
    });
  });
}

function renderDashboardWeakAreas(weakAreas) {
  const container = document.getElementById("weak-areas-container");
  if (!container) return;

  if (!Array.isArray(weakAreas) || weakAreas.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No weak areas flagged yet.</h3>
        <p>As you complete practice examinations, EXAMIVO isolates specific topics where you need extra reinforcement.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="weak-area-list">
      ${weakAreas
        .map((w) => {
          const badgeClass = w.status === "Needs Practice" ? "badge-danger" : "badge-warning";
          const practiceUrl = `setup.html?class=${encodeURIComponent(w.classLevel || "SS3")}&subject=${encodeURIComponent(w.subject || "Mathematics")}&exam=${encodeURIComponent(w.examType || "WAEC")}&topic=${encodeURIComponent(w.topic)}`;
          return `
            <div class="weak-item-card">
              <div class="weak-item-top">
                <div>
                  <div class="weak-item-topic">${escapeHtml(w.topic)}</div>
                  <div class="weak-item-subject">${escapeHtml(w.subject || "")} · ${escapeHtml(w.classLevel || "")}</div>
                </div>
                <span class="badge ${badgeClass}">${escapeHtml(w.status || "Needs Practice")}</span>
              </div>
              <div class="weak-item-reason">${escapeHtml(w.reason || `Accuracy: ${w.accuracyPercent ?? 0}% in recent assessment.`)}</div>
              <div class="weak-item-actions">
                <span style="font-size:0.76rem; color:var(--text-muted);">Accuracy: ${w.accuracyPercent ?? 0}%</span>
                <a href="${practiceUrl}" class="btn btn-secondary btn-sm" data-smooth-nav>Practice Topic →</a>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

/* ==========================================================================
   EXAM HISTORY PAGE (history.html)
   ========================================================================== */

async function loadAndRenderHistoryPage(user) {
  const listContainer = document.getElementById("history-list-container");
  const authPromptBanner = document.getElementById("history-auth-banner");

  if (!user) {
    if (authPromptBanner) {
      authPromptBanner.style.display = "flex";
      const signInBtn = document.getElementById("history-signin-btn");
      if (signInBtn && !signInBtn.dataset.bound) {
        signInBtn.dataset.bound = "true";
        signInBtn.addEventListener("click", () => {
          promptAuthForFeature("Sign in to access your full cross-device examination history.");
        });
      }
    }
    const guestSession = getActiveResultSession();
    allLoadedAttempts = guestSession ? [guestSession] : [];
  } else {
    if (authPromptBanner) authPromptBanner.style.display = "none";
    allLoadedAttempts = await fetchUserAttemptsFromFirestore(100);
  }

  populateHistoryFilters(allLoadedAttempts);
  renderHistoryFilteredList(allLoadedAttempts, listContainer);
}

function populateHistoryFilters(attempts) {
  const subjectFilter = document.getElementById("history-subject-filter");
  const examFilter = document.getElementById("history-exam-filter");
  const searchInput = document.getElementById("history-search-input");
  const listContainer = document.getElementById("history-list-container");

  const subjects = [...new Set(attempts.map((a) => a.subject).filter(Boolean))];
  const exams = [...new Set(attempts.map((a) => a.examType).filter(Boolean))];

  if (subjectFilter) {
    subjectFilter.innerHTML = `<option value="">All Subjects</option>` +
      subjects.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  }

  if (examFilter) {
    examFilter.innerHTML = `<option value="">All Exam Types</option>` +
      exams.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
  }

  const applyFilter = () => {
    const sVal = subjectFilter?.value || "";
    const eVal = examFilter?.value || "";
    const qVal = (searchInput?.value || "").toLowerCase().trim();

    const filtered = allLoadedAttempts.filter((att) => {
      if (sVal && att.subject !== sVal) return false;
      if (eVal && att.examType !== eVal) return false;
      if (qVal) {
        const hay = `${att.title || ""} ${att.subject || ""} ${att.classLevel || ""} ${(att.weakAreas || []).join(" ")}`.toLowerCase();
        if (!hay.includes(qVal)) return false;
      }
      return true;
    });

    renderHistoryFilteredList(filtered, listContainer);
  };

  subjectFilter?.addEventListener("change", applyFilter);
  examFilter?.addEventListener("change", applyFilter);
  searchInput?.addEventListener("input", applyFilter);
}

function renderHistoryFilteredList(attempts, container) {
  if (!container) return;

  if (!Array.isArray(attempts) || attempts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${renderAIStatus("idle", null, { size: "sm", showLabel: false })}
        <h3>Your first practice starts here.</h3>
        <p>Upload your material and let EXAMIVO build your first practice exam.</p>
        <a href="setup.html" class="btn btn-primary" data-smooth-nav>Start Preparing</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="practice-list">
      ${attempts
        .map((att) => {
          const pct = Number(att.scorePercent) || 0;
          const pillClass = pct >= 75 ? "high" : pct >= 55 ? "mid" : "low";
          return `
            <div class="practice-item-card">
              <div class="practice-item-main">
                <div class="practice-item-title">${escapeHtml(att.title || `${att.subject} — ${att.examType}`)}</div>
                <div class="practice-item-meta">
                  <span class="badge badge-primary">${escapeHtml(att.classLevel)}</span>
                  <span class="badge badge-neutral">${escapeHtml(att.subject)}</span>
                  <span class="badge badge-neutral">${escapeHtml(att.examType)}</span>
                  <span>·</span>
                  <span>Time: ${escapeHtml(formatDuration(att.timeSpentSeconds || 0))}</span>
                  <span>·</span>
                  <span>${escapeHtml(formatDate(att.createdAt || att.createdAtIso))}</span>
                </div>
              </div>
              <div class="practice-item-right">
                <span class="score-pill ${pillClass}">${pct}% (${att.correctCount}/${att.totalQuestions})</span>
                <button type="button" class="btn btn-secondary btn-sm" data-history-open="${escapeHtml(att.attemptId)}">
                  Inspect Results
                </button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  container.querySelectorAll("[data-history-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-history-open");
      const found = allLoadedAttempts.find((a) => a.attemptId === id);
      if (found) {
        setActiveResultSession(found);
      }
      navigateTo(`results.html?attemptId=${encodeURIComponent(id)}`);
    });
  });
}
