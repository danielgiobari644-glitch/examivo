/**
 * EXAMIVO — Progressive Guided Exam Setup & Material Analysis Controller (setup.html)
 * Step 1: Class -> Step 2: Subject -> Step 3: Examination -> Step 4: Material Input
 * -> Full-Screen "EXAMIVO IS THINKING" -> "EXAM FOCUS" -> Launch Examination
 */

import {
  CLASS_PROFILES,
  SUBJECTS_LIST,
  EXAM_PROFILES,
  DIFFICULTY_LEVELS,
  escapeHtml,
  formatBytes,
  generateId,
  extractMaterialFromFile
} from "./utils.js";
import {
  initCommonUI,
  renderAIStatus,
  showToast,
  navigateTo
} from "./ui.js";
import { initAuth } from "./auth.js";
import { setActiveExamSession, saveExamToFirestore } from "./storage.js";
import { runExamGenerationPipeline } from "./ai.js";
import { trackEvent } from "./firebase.js";

const THINKING_STAGES = [
  "Reading your material",
  "Identifying key concepts",
  "Adapting to your level",
  "Analyzing examination patterns",
  "Building your questions",
  "Checking question quality"
];

const setupState = {
  currentStep: 1,
  classLevel: "",
  subject: "",
  customSubject: "",
  examType: "WAEC",
  questionCount: 10,
  difficulty: "Exam Level",
  examMode: "exam", // 'exam' | 'practice'
  timed: true,
  durationMinutes: 15,
  materialMode: "topic", // 'document' | 'image' | 'text' | 'topic'
  topicInput: "",
  pastedText: "",
  uploadedFileMeta: null, // { sourceType, fileName, fileSize, mimeType, extractedText, base64 }
  imageContextNote: "",
  generatedBlueprint: null
};

document.addEventListener("DOMContentLoaded", () => {
  initCommonUI();
  initAuth();
  trackEvent("practice_started");

  // Check URL query params for pre-selected topic or subject (e.g. from Dashboard Weak Area click)
  const params = new URLSearchParams(window.location.search);
  if (params.get("class")) setupState.classLevel = params.get("class");
  if (params.get("subject")) setupState.subject = params.get("subject");
  if (params.get("exam")) setupState.examType = params.get("exam");
  if (params.get("topic")) {
    setupState.topicInput = params.get("topic");
    setupState.materialMode = "topic";
  }

  renderStep1Classes();
  renderStep2Subjects();
  renderStep3Exams();
  initStep4MaterialControls();
  bindStepBreadcrumbNavigation();

  // If pre-populated via URL params, advance to appropriate step
  if (setupState.classLevel && setupState.subject && setupState.topicInput) {
    goToStep(4);
  } else {
    goToStep(1);
  }
});

/* ==========================================================================
   STEP NAVIGATION & SUMMARY CHIP STRIP
   ========================================================================== */

function goToStep(stepNum) {
  setupState.currentStep = stepNum;

  document.querySelectorAll(".wizard-step").forEach((el) => {
    const s = Number(el.getAttribute("data-step"));
    el.classList.toggle("active", s === stepNum);
  });

  document.querySelectorAll(".setup-step-indicator").forEach((ind) => {
    const s = Number(ind.getAttribute("data-step-nav"));
    ind.classList.toggle("active", s === stepNum);
    ind.classList.toggle("completed", s < stepNum);
  });

  renderSelectionSummaryStrip();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindStepBreadcrumbNavigation() {
  document.querySelectorAll(".setup-step-indicator").forEach((ind) => {
    ind.addEventListener("click", () => {
      const targetStep = Number(ind.getAttribute("data-step-nav"));
      if (targetStep === 1) {
        goToStep(1);
      } else if (targetStep === 2 && setupState.classLevel) {
        goToStep(2);
      } else if (targetStep === 3 && setupState.classLevel && getEffectiveSubject()) {
        goToStep(3);
      } else if (targetStep === 4 && setupState.classLevel && getEffectiveSubject() && setupState.examType) {
        goToStep(4);
      }
    });
  });

  document.querySelectorAll("[data-prev-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prev = Number(btn.getAttribute("data-prev-step"));
      goToStep(prev);
    });
  });
}

function getEffectiveSubject() {
  if (setupState.subject === "Other") {
    return setupState.customSubject.trim() || "Custom Subject";
  }
  return setupState.subject;
}

function renderSelectionSummaryStrip() {
  const strip = document.getElementById("selection-summary-strip");
  if (!strip) return;

  const chips = [];
  if (setupState.classLevel) {
    chips.push(`<span class="summary-chip">Class: <strong>${escapeHtml(setupState.classLevel)}</strong></span>`);
  }
  const subj = getEffectiveSubject();
  if (subj) {
    chips.push(`<span class="summary-chip">Subject: <strong>${escapeHtml(subj)}</strong></span>`);
  }
  if (setupState.currentStep >= 3 && setupState.examType) {
    chips.push(`<span class="summary-chip">Exam: <strong>${escapeHtml(setupState.examType)}</strong></span>`);
    chips.push(`<span class="summary-chip">${setupState.questionCount} Questions · <strong>${escapeHtml(setupState.difficulty)}</strong></span>`);
    chips.push(`<span class="summary-chip">Mode: <strong>${setupState.examMode === "practice" ? "Practice Mode" : "Exam Mode"}</strong></span>`);
  }

  strip.innerHTML = chips.join("");
}

/* ==========================================================================
   STEP 1: WHAT ARE YOU PREPARING FOR? (CLASS SELECTION)
   ========================================================================== */

function renderStep1Classes() {
  const container = document.getElementById("class-groups-container");
  if (!container) return;

  const groups = {
    "Primary School": ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"],
    "Junior Secondary": ["JSS1", "JSS2", "JSS3"],
    "Senior Secondary": ["SS1", "SS2", "SS3"],
    "Tertiary & Custom": ["University", "Other"]
  };

  container.innerHTML = Object.entries(groups)
    .map(
      ([groupName, classIds]) => `
      <div class="class-category-group">
        <div class="class-category-label">${escapeHtml(groupName)}</div>
        <div class="selection-grid">
          ${classIds
            .map((cid) => {
              const profile = CLASS_PROFILES[cid];
              const isSelected = setupState.classLevel === cid;
              return `
                <button type="button" class="select-card ${isSelected ? "selected" : ""}" data-class-id="${escapeHtml(cid)}">
                  <span class="select-card-check">✓</span>
                  <span class="select-card-title">${escapeHtml(cid)}</span>
                  <span class="select-card-desc">${escapeHtml(
                    cid.startsWith("Primary")
                      ? "Clear foundational language"
                      : cid.startsWith("JSS")
                      ? "Junior secondary level"
                      : cid.startsWith("SS")
                      ? "Senior secondary standard"
                      : cid === "University"
                      ? "Tertiary academic depth"
                      : "Professional / Custom"
                  )}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `
    )
    .join("");

  container.querySelectorAll("[data-class-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = btn.getAttribute("data-class-id");
      setupState.classLevel = cid;

      // Auto-select sensible default exam type based on class
      if (cid.startsWith("Primary")) {
        setupState.examType = "Common Entrance";
      } else if (cid.startsWith("JSS")) {
        setupState.examType = "NECO";
      } else if (cid.startsWith("SS")) {
        setupState.examType = "WAEC";
      } else if (cid === "University") {
        setupState.examType = "School Examination";
      }

      container.querySelectorAll("[data-class-id]").forEach((b) => {
        b.classList.toggle("selected", b.getAttribute("data-class-id") === cid);
      });

      setTimeout(() => {
        renderStep3Exams();
        goToStep(2);
      }, 220);
    });
  });
}

/* ==========================================================================
   STEP 2: WHAT SUBJECT?
   ========================================================================== */

function renderStep2Subjects() {
  const container = document.getElementById("subjects-grid-container");
  const customWrap = document.getElementById("custom-subject-wrap");
  const customInput = document.getElementById("custom-subject-input");
  const continueBtn = document.getElementById("custom-subject-continue-btn");
  if (!container) return;

  container.innerHTML = SUBJECTS_LIST.map((subj) => {
    const isSelected = setupState.subject === subj.id;
    return `
      <button type="button" class="select-card ${isSelected ? "selected" : ""}" data-subject-id="${escapeHtml(subj.id)}">
        <span class="select-card-check">✓</span>
        <span class="select-card-title">${escapeHtml(subj.name)}</span>
        <span class="select-card-desc">${escapeHtml(subj.desc)}</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll("[data-subject-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sid = btn.getAttribute("data-subject-id");
      setupState.subject = sid;

      container.querySelectorAll("[data-subject-id]").forEach((b) => {
        b.classList.toggle("selected", b.getAttribute("data-subject-id") === sid);
      });

      if (sid === "Other") {
        if (customWrap) customWrap.style.display = "block";
        if (customInput) customInput.focus();
      } else {
        if (customWrap) customWrap.style.display = "none";
        setTimeout(() => goToStep(3), 210);
      }
    });
  });

  if (continueBtn && customInput) {
    continueBtn.addEventListener("click", () => {
      const val = customInput.value.trim();
      if (!val) {
        showToast("Please enter a subject or course name.", "warning");
        customInput.focus();
        return;
      }
      setupState.customSubject = val;
      goToStep(3);
    });
  }
}

/* ==========================================================================
   STEP 3: WHAT EXAMINATION & PARAMETERS?
   ========================================================================== */

function renderStep3Exams() {
  const examGrid = document.getElementById("exam-types-grid");
  if (!examGrid) return;

  examGrid.innerHTML = Object.values(EXAM_PROFILES)
    .map((ex) => {
      const isSelected = setupState.examType === ex.id;
      return `
        <button type="button" class="select-card ${isSelected ? "selected" : ""}" data-exam-id="${escapeHtml(ex.id)}">
          <span class="select-card-check">✓</span>
          <span class="select-card-title">${escapeHtml(ex.name)}</span>
          <span class="select-card-desc">${escapeHtml(ex.desc)}</span>
        </button>
      `;
    })
    .join("");

  examGrid.querySelectorAll("[data-exam-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const eid = btn.getAttribute("data-exam-id");
      setupState.examType = eid;
      examGrid.querySelectorAll("[data-exam-id]").forEach((b) => {
        b.classList.toggle("selected", b.getAttribute("data-exam-id") === eid);
      });
      updateRecommendedDuration();
      renderSelectionSummaryStrip();
    });
  });

  // Question Count Pills
  document.querySelectorAll("[data-q-count]").forEach((btn) => {
    btn.classList.toggle("selected", Number(btn.getAttribute("data-q-count")) === setupState.questionCount);
    if (!btn.dataset.bound) {
      btn.dataset.bound = "true";
      btn.addEventListener("click", () => {
        setupState.questionCount = Number(btn.getAttribute("data-q-count"));
        document.querySelectorAll("[data-q-count]").forEach((b) => {
          b.classList.toggle("selected", Number(b.getAttribute("data-q-count")) === setupState.questionCount);
        });
        updateRecommendedDuration();
        renderSelectionSummaryStrip();
      });
    }
  });

  // Difficulty Pills
  const diffContainer = document.getElementById("difficulty-pills-container");
  if (diffContainer && !diffContainer.dataset.rendered) {
    diffContainer.dataset.rendered = "true";
    diffContainer.innerHTML = DIFFICULTY_LEVELS.map(
      (d) => `
        <button type="button" class="pill-option ${setupState.difficulty === d.id ? "selected" : ""}" data-diff-id="${escapeHtml(d.id)}" title="${escapeHtml(d.desc)}">
          ${escapeHtml(d.label)}
        </button>
      `
    ).join("");

    diffContainer.querySelectorAll("[data-diff-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setupState.difficulty = btn.getAttribute("data-diff-id");
        diffContainer.querySelectorAll("[data-diff-id]").forEach((b) => {
          b.classList.toggle("selected", b.getAttribute("data-diff-id") === setupState.difficulty);
        });
        renderSelectionSummaryStrip();
      });
    });
  }

  // Exam Mode Cards (EXAM MODE vs PRACTICE MODE)
  document.querySelectorAll("[data-exam-mode]").forEach((card) => {
    card.classList.toggle("selected", card.getAttribute("data-exam-mode") === setupState.examMode);
    if (!card.dataset.bound) {
      card.dataset.bound = "true";
      card.addEventListener("click", () => {
        setupState.examMode = card.getAttribute("data-exam-mode");
        document.querySelectorAll("[data-exam-mode]").forEach((c) => {
          c.classList.toggle("selected", c.getAttribute("data-exam-mode") === setupState.examMode);
        });
        renderSelectionSummaryStrip();
      });
    }
  });

  // Timer Toggle
  document.querySelectorAll("[data-timer-opt]").forEach((btn) => {
    const isTimed = btn.getAttribute("data-timer-opt") === "timed";
    btn.classList.toggle("selected", isTimed === setupState.timed);
    if (!btn.dataset.bound) {
      btn.dataset.bound = "true";
      btn.addEventListener("click", () => {
        setupState.timed = btn.getAttribute("data-timer-opt") === "timed";
        document.querySelectorAll("[data-timer-opt]").forEach((b) => {
          b.classList.toggle("selected", (b.getAttribute("data-timer-opt") === "timed") === setupState.timed);
        });
      });
    }
  });

  const step3NextBtn = document.getElementById("step-3-next-btn");
  if (step3NextBtn && !step3NextBtn.dataset.bound) {
    step3NextBtn.dataset.bound = "true";
    step3NextBtn.addEventListener("click", () => {
      goToStep(4);
    });
  }

  updateRecommendedDuration();
}

function updateRecommendedDuration() {
  const profile = EXAM_PROFILES[setupState.examType] || EXAM_PROFILES["WAEC"];
  const mins = Math.max(5, Math.round(setupState.questionCount * (profile.defaultMinutesPerQuestion || 1.4)));
  setupState.durationMinutes = mins;
  const labelEl = document.getElementById("recommended-time-label");
  if (labelEl) {
    labelEl.textContent = `${mins} min`;
  }
}

/* ==========================================================================
   STEP 4: GIVE EXAMIVO SOMETHING TO WORK WITH (MATERIAL INPUT)
   ========================================================================== */

function initStep4MaterialControls() {
  const modeCards = document.querySelectorAll("[data-material-mode]");
  const panels = {
    document: document.getElementById("material-panel-document"),
    image: document.getElementById("material-panel-image"),
    text: document.getElementById("material-panel-text"),
    topic: document.getElementById("material-panel-topic")
  };

  const switchMaterialMode = (mode) => {
    setupState.materialMode = mode;
    modeCards.forEach((c) => {
      c.classList.toggle("selected", c.getAttribute("data-material-mode") === mode);
    });
    Object.entries(panels).forEach(([key, panel]) => {
      if (panel) panel.style.display = key === mode ? "block" : "none";
    });
  };

  modeCards.forEach((card) => {
    card.addEventListener("click", () => {
      switchMaterialMode(card.getAttribute("data-material-mode"));
    });
  });

  // Pre-populate topic input if set
  const topicInputEl = document.getElementById("topic-input-field");
  const detectedStripEl = document.getElementById("detected-topics-strip");

  const renderDetectedTopicsPreview = (rawVal) => {
    if (!detectedStripEl) return;
    const topics = String(rawVal || "")
      .split(/[,;\n]+|\s+\band\b\s+|\s*&\s*/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
    if (topics.length === 0) {
      detectedStripEl.innerHTML = "";
      return;
    }
    detectedStripEl.innerHTML = `
      <span style="font-size:0.76rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">
        Topics to Research (${topics.length}):
      </span>
      ${topics
        .map((t) => `<span class="badge badge-primary">${escapeHtml(t)}</span>`)
        .join("")}
    `;
  };

  if (topicInputEl) {
    if (setupState.topicInput) {
      topicInputEl.value = setupState.topicInput;
      renderDetectedTopicsPreview(setupState.topicInput);
    }
    topicInputEl.addEventListener("input", () => {
      setupState.topicInput = topicInputEl.value;
      renderDetectedTopicsPreview(topicInputEl.value);
    });
  }

  const pastedTextEl = document.getElementById("pasted-text-field");
  if (pastedTextEl) {
    pastedTextEl.addEventListener("input", () => {
      setupState.pastedText = pastedTextEl.value;
    });
  }

  const imageNoteEl = document.getElementById("image-context-note");
  if (imageNoteEl) {
    imageNoteEl.addEventListener("input", () => {
      setupState.imageContextNote = imageNoteEl.value;
    });
  }

  // Document Dropzone & File Input
  setupFileDropzone(
    "doc-dropzone",
    "doc-file-input",
    "doc-file-preview",
    "doc-ai-indicator",
    ["pdf", "doc", "docx", "txt"]
  );

  // Image Dropzone & File Input
  setupFileDropzone(
    "img-dropzone",
    "img-file-input",
    "img-file-preview",
    "img-ai-indicator",
    ["jpg", "jpeg", "png", "webp"]
  );

  // Analyze & Build Exam Button
  const analyzeBtn = document.getElementById("start-analysis-btn");
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", handleAnalyzeAndGenerate);
  }

  // Begin Exam Button on Step 5 (EXAM FOCUS screen)
  const beginExamBtn = document.getElementById("begin-exam-btn");
  if (beginExamBtn) {
    beginExamBtn.addEventListener("click", launchExamSession);
  }

  switchMaterialMode(setupState.materialMode);
}

function setupFileDropzone(dropzoneId, inputId, previewId, aiSlotId, allowedExts) {
  const dropzone = document.getElementById(dropzoneId);
  const fileInput = document.getElementById(inputId);
  const previewContainer = document.getElementById(previewId);

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await handleSelectedFile(file, previewContainer, aiSlotId, allowedExts);
    }
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (file) {
      await handleSelectedFile(file, previewContainer, aiSlotId, allowedExts);
    }
  });
}

async function handleSelectedFile(file, previewContainer, aiSlotId, allowedExts) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!allowedExts.includes(ext)) {
    showToast(`Please select a supported file format (${allowedExts.map((e) => e.toUpperCase()).join(", ")}).`, "warning");
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    showToast("File is larger than 15 MB. Please upload a smaller document or image.", "warning");
    return;
  }

  // Render File Icon, Filename, File Size + AI Intelligence Indicator transitioning into analysis readiness
  if (previewContainer) {
    previewContainer.style.display = "block";
    previewContainer.innerHTML = `
      <div class="file-preview-card">
        <div class="file-preview-left">
          <div class="file-type-badge">${escapeHtml(ext.toUpperCase())}</div>
          <div class="file-info-meta">
            <div class="file-name-text">${escapeHtml(file.name)}</div>
            <div class="file-size-text">${escapeHtml(formatBytes(file.size))} · Extracting material structure...</div>
          </div>
        </div>
        <div id="${escapeHtml(aiSlotId)}"></div>
      </div>
    `;
    renderAIStatus("reading", `#${aiSlotId}`, { size: "xs", showLabel: true, customLabel: "Reading File" });
  }

  try {
    const extracted = await extractMaterialFromFile(file);
    setupState.uploadedFileMeta = extracted;
    trackEvent("material_uploaded", { type: extracted.sourceType, ext });

    if (previewContainer) {
      const sizeTextEl = previewContainer.querySelector(".file-size-text");
      if (sizeTextEl) {
        sizeTextEl.textContent = `${formatBytes(file.size)} · Ready for EXAMIVO Analysis`;
      }
      renderAIStatus("complete", `#${aiSlotId}`, { size: "xs", showLabel: true, customLabel: "Material Ready" });
    }
    showToast("Material loaded and ready for analysis.", "success");
  } catch (err) {
    showToast(err.message || "Could not process the selected file.", "danger");
  }
}

/* ==========================================================================
   FULL-SCREEN "EXAMIVO IS THINKING" & PIPELINE EXECUTION
   ========================================================================== */

async function handleAnalyzeAndGenerate() {
  const effectiveSubject = getEffectiveSubject();
  if (!setupState.classLevel) {
    showToast("Please select your class level first.", "warning");
    goToStep(1);
    return;
  }
  if (!effectiveSubject) {
    showToast("Please select a subject first.", "warning");
    goToStep(2);
    return;
  }

  // Validate material input based on active materialMode
  let materialPayload = {
    mode: setupState.materialMode,
    content: "",
    fileName: "",
    mimeType: "",
    base64: null
  };

  if (setupState.materialMode === "topic") {
    const topicVal = (document.getElementById("topic-input-field")?.value || setupState.topicInput).trim();
    if (!topicVal) {
      showToast("Please enter a topic you are studying (e.g. Quadratic equations).", "warning");
      document.getElementById("topic-input-field")?.focus();
      return;
    }
    materialPayload.content = topicVal;
  } else if (setupState.materialMode === "text") {
    const textVal = (document.getElementById("pasted-text-field")?.value || setupState.pastedText).trim();
    if (!textVal || textVal.length < 15) {
      showToast("Please paste your study notes or textbook passage (at least a sentence or two).", "warning");
      document.getElementById("pasted-text-field")?.focus();
      return;
    }
    materialPayload.content = textVal;
  } else if (setupState.materialMode === "document" || setupState.materialMode === "image") {
    if (!setupState.uploadedFileMeta) {
      showToast(`Please upload a ${setupState.materialMode} first.`, "warning");
      return;
    }
    const meta = setupState.uploadedFileMeta;
    const extraNote = (document.getElementById("image-context-note")?.value || setupState.imageContextNote).trim();
    materialPayload = {
      mode: setupState.materialMode,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      content: [meta.extractedText, extraNote].filter(Boolean).join("\n\n"),
      base64: meta.base64
    };
  }

  const pipelineRequest = {
    classLevel: setupState.classLevel,
    classProfile: CLASS_PROFILES[setupState.classLevel] || CLASS_PROFILES["SS3"],
    subject: effectiveSubject,
    examType: setupState.examType,
    examProfile: EXAM_PROFILES[setupState.examType] || EXAM_PROFILES["WAEC"],
    questionCount: setupState.questionCount,
    difficulty: setupState.difficulty,
    examMode: setupState.examMode,
    material: materialPayload
  };

  showThinkingOverlay(true);

  try {
    const blueprint = await runExamGenerationPipeline(pipelineRequest, (stageIndex, aiState) => {
      updateThinkingStageUI(stageIndex, aiState);
    });

    setupState.generatedBlueprint = blueprint;
    trackEvent("exam_generated", {
      subject: effectiveSubject,
      classLevel: setupState.classLevel,
      examType: setupState.examType,
      questionCount: blueprint.questions.length
    });

    showThinkingOverlay(false);
    renderExamFocusScreen(blueprint, effectiveSubject);
    goToStep(5);
  } catch (err) {
    showThinkingOverlay(false);
    renderPipelineErrorModal(err.message);
  }
}

function showThinkingOverlay(visible) {
  const overlay = document.getElementById("ai-thinking-overlay");
  if (!overlay) return;

  if (visible) {
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    renderAIStatus("reading", "#thinking-core-slot", { size: "lg", showLabel: true });
    renderThinkingStagesList(0);
  } else {
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
  }
}

function renderThinkingStagesList(activeIdx = 0) {
  const listEl = document.getElementById("thinking-stages-list");
  if (!listEl) return;

  listEl.innerHTML = THINKING_STAGES.map((label, idx) => {
    let statusClass = "";
    let iconMarkup = `<span class="stage-dot-future"></span>`;

    if (idx < activeIdx) {
      statusClass = "completed";
      iconMarkup = `<span class="stage-check-completed" aria-label="Completed">✓</span>`;
    } else if (idx === activeIdx) {
      statusClass = "active";
      iconMarkup = `<span class="stage-dot-active"></span>`;
    }

    return `
      <div class="thinking-stage-item ${statusClass}" data-stage-idx="${idx}">
        <span class="stage-icon-slot">${iconMarkup}</span>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }).join("");
}

function updateThinkingStageUI(stageIndex, aiState) {
  renderAIStatus(aiState, "#thinking-core-slot", { size: "lg", showLabel: true });
  renderThinkingStagesList(stageIndex);
}

function renderPipelineErrorModal(humanMessage) {
  const errContainer = document.getElementById("setup-error-region");
  if (!errContainer) {
    showToast(humanMessage || "Something went wrong.", "danger");
    return;
  }
  errContainer.style.display = "block";
  errContainer.innerHTML = `
    <div class="error-state-card" style="margin-bottom:1.5rem;">
      ${renderAIStatus("error", null, { size: "sm", showLabel: false })}
      <h3>Something went wrong.</h3>
      <p>${escapeHtml(humanMessage || "EXAMIVO couldn't complete that request.")}</p>
      <button type="button" class="btn btn-primary" id="retry-pipeline-btn">Try Again</button>
    </div>
  `;
  const retryBtn = document.getElementById("retry-pipeline-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      errContainer.style.display = "none";
      handleAnalyzeAndGenerate();
    });
  }
}

/* ==========================================================================
   STEP 5: EXAM FOCUS SCREEN & LAUNCHING EXAM
   ========================================================================== */

function renderExamFocusScreen(blueprint, effectiveSubject) {
  const focusHighEl = document.getElementById("focus-high-priority-list");
  const focusAlsoEl = document.getElementById("focus-also-revise-list");
  const rationaleEl = document.getElementById("focus-rationale-text");
  const metaSummaryEl = document.getElementById("focus-exam-meta-summary");

  if (metaSummaryEl) {
    metaSummaryEl.innerHTML = `
      <span class="badge badge-primary">${escapeHtml(setupState.classLevel)}</span>
      <span class="badge badge-accent">${escapeHtml(effectiveSubject)}</span>
      <span class="badge badge-neutral">${escapeHtml(setupState.examType)}</span>
      <span class="badge badge-neutral">${blueprint.questions.length} Questions</span>
      <span class="badge badge-neutral">${setupState.examMode === "practice" ? "Practice Mode" : "Exam Mode"}</span>
    `;
  }

  if (focusHighEl) {
    focusHighEl.innerHTML = (blueprint.examFocus.highPriority || [])
      .map(
        (item) => `
          <li class="focus-concept-item">
            <span class="focus-concept-name">${escapeHtml(item.concept)}</span>
            <span class="focus-concept-note">${escapeHtml(item.reason)}</span>
          </li>
        `
      )
      .join("");
  }

  if (focusAlsoEl) {
    focusAlsoEl.innerHTML = (blueprint.examFocus.alsoRevise || [])
      .map(
        (item) => `
          <li class="focus-concept-item">
            <span class="focus-concept-name">${escapeHtml(item.concept)}</span>
            <span class="focus-concept-note">${escapeHtml(item.reason)}</span>
          </li>
        `
      )
      .join("");
  }

  if (rationaleEl) {
    rationaleEl.textContent =
      blueprint.examFocus.rationale ||
      "Prioritized based on the selected examination format and your supplied material.";
  }
}

async function launchExamSession() {
  const blueprint = setupState.generatedBlueprint;
  if (!blueprint || !Array.isArray(blueprint.questions) || blueprint.questions.length === 0) {
    showToast("Please generate your examination first.", "warning");
    return;
  }

  const effectiveSubject = getEffectiveSubject();
  const examBundle = {
    examId: generateId("exam"),
    title: blueprint.title || `${effectiveSubject} — ${setupState.examType}`,
    classLevel: setupState.classLevel,
    subject: effectiveSubject,
    examType: setupState.examType,
    difficulty: setupState.difficulty,
    examMode: setupState.examMode,
    timed: setupState.timed,
    durationSeconds: setupState.timed ? setupState.durationMinutes * 60 : 0,
    materialSummary: blueprint.materialSummary || "",
    examFocus: blueprint.examFocus,
    questions: blueprint.questions,
    startedAtIso: new Date().toISOString()
  };

  setActiveExamSession(examBundle);

  // Persist Exam & Questions to Firestore in background if signed in
  saveExamToFirestore(examBundle).catch(() => {});

  navigateTo("exam.html");
}
