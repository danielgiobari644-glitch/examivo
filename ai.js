/**
 * EXAMIVO — Client-Side AI Pipeline Interface & Response Validator
 * Architecture:
 *   Browser -> Secure Firebase Backend / Cloud Function (/api/ai/*) -> External AI Provider -> Browser
 *
 * NEVER stores or exposes AI API keys in frontend JavaScript.
 * Validates all structured JSON responses before presenting them to the student.
 */

import { QUESTION_TYPE_LABELS } from "./utils.js";

const API_BASE = "/api/ai";

/**
 * Validate and normalize a single AI-generated Question object (Section 44)
 */
export function validateAndNormalizeQuestion(raw, index = 0, fallbackSubject = "General", fallbackDifficulty = "Medium") {
  if (!raw || typeof raw !== "object") return null;

  const questionText = String(raw.question || raw.prompt || "").trim();
  if (!questionText || questionText.length < 6) return null;

  const rawType = String(raw.type || "multiple_choice").toLowerCase().trim();
  const validTypes = Object.keys(QUESTION_TYPE_LABELS);
  const type = validTypes.includes(rawType) ? rawType : "multiple_choice";

  let options = Array.isArray(raw.options)
    ? raw.options.map((o) => String(o).trim()).filter(Boolean)
    : [];

  let correctAnswer = raw.correctAnswer;

  if (type === "multiple_choice" || type === "scenario" || type === "calculation") {
    // If options are provided (4-option MCQ format), validate correctAnswer index
    if (options.length >= 2) {
      if (typeof correctAnswer === "string") {
        // Handle "A", "B", "C", "D" or exact option string match
        const letterIdx = ["A", "B", "C", "D", "E"].indexOf(correctAnswer.trim().toUpperCase());
        if (letterIdx >= 0 && letterIdx < options.length) {
          correctAnswer = letterIdx;
        } else {
          const matchIdx = options.findIndex(
            (opt) => opt.toLowerCase() === correctAnswer.trim().toLowerCase()
          );
          correctAnswer = matchIdx >= 0 ? matchIdx : 0;
        }
      } else if (typeof correctAnswer === "number") {
        if (correctAnswer < 0 || correctAnswer >= options.length) {
          correctAnswer = 0;
        }
      } else {
        correctAnswer = 0;
      }
    } else if (type === "multiple_choice") {
      // A multiple_choice item must have at least 2 options to be valid
      return null;
    }
  } else if (type === "true_false") {
    options = ["True", "False"];
    if (typeof correctAnswer === "boolean") {
      correctAnswer = correctAnswer ? 0 : 1;
    } else if (typeof correctAnswer === "string") {
      correctAnswer = correctAnswer.toLowerCase().includes("false") ? 1 : 0;
    } else if (typeof correctAnswer === "number") {
      correctAnswer = correctAnswer === 1 ? 1 : 0;
    } else {
      correctAnswer = 0;
    }
  } else if (type === "matching") {
    // Normalize matching pairs if provided
    const pairs = Array.isArray(raw.pairs) ? raw.pairs : [];
    if (pairs.length >= 2) {
      options = pairs.map((p) => ({
        left: String(p.left || p.term || "").trim(),
        right: String(p.right || p.match || "").trim()
      }));
      correctAnswer = options.map((p) => p.right);
    }
  } else {
    // fill_blank, short_answer, theory, essay
    if (correctAnswer === undefined || correctAnswer === null) {
      correctAnswer = String(raw.modelAnswer || raw.expectedAnswer || raw.explanation || "").trim();
    } else if (typeof correctAnswer !== "string") {
      correctAnswer = String(correctAnswer);
    }
  }

  const explanation = String(
    raw.explanation || raw.rationale || "Review the core concept and step-by-step derivation from your study material."
  ).trim();

  const topic = String(raw.topic || raw.sourceConcept || fallbackSubject).trim();
  const difficulty = String(raw.difficulty || fallbackDifficulty).toLowerCase().trim();
  const cognitiveSkill = String(raw.cognitiveSkill || "application").toLowerCase().trim();
  const sourceConcept = String(raw.sourceConcept || topic).trim();
  const examRelevance = ["high", "medium", "low"].includes(String(raw.examRelevance || "").toLowerCase())
    ? String(raw.examRelevance).toLowerCase()
    : "high";

  return {
    id: raw.id || `q_${index + 1}_${Date.now().toString(36)}`,
    question: questionText,
    type,
    options,
    correctAnswer,
    explanation,
    topic,
    difficulty,
    cognitiveSkill,
    sourceConcept,
    examRelevance,
    keyPoints: Array.isArray(raw.keyPoints) ? raw.keyPoints.map(String) : []
  };
}

/**
 * Validate complete AI Pipeline Response (Content Analysis + Exam Focus + Questions)
 */
export function validatePipelineResponse(payload, config = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("EXAMIVO received an invalid response from the analysis service.");
  }

  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const validatedQuestions = [];
  const seenPrompts = new Set();

  for (let i = 0; i < rawQuestions.length; i++) {
    const q = validateAndNormalizeQuestion(
      rawQuestions[i],
      i,
      config.subject || "General",
      config.difficulty || "Medium"
    );
    if (q) {
      const normKey = q.question.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!seenPrompts.has(normKey)) {
        seenPrompts.add(normKey);
        validatedQuestions.push(q);
      }
    }
  }

  if (validatedQuestions.length === 0) {
    throw new Error("EXAMIVO could not validate any generated questions from the supplied material.");
  }

  const rawFocus = payload.examFocus || {};
  const highPriority = Array.isArray(rawFocus.highPriority) && rawFocus.highPriority.length > 0
    ? rawFocus.highPriority.map((item) =>
        typeof item === "string"
          ? { concept: item, reason: "Core examination concept identified in your study material." }
          : {
              concept: String(item.concept || item.topic || "Core Concept"),
              reason: String(item.reason || item.note || "High relevance to the selected examination format.")
            }
      )
    : [...new Set(validatedQuestions.slice(0, 3).map((q) => q.topic))].map((t) => ({
        concept: t,
        reason: "Primary concept emphasized across the examination blueprint."
      }));

  const alsoRevise = Array.isArray(rawFocus.alsoRevise) && rawFocus.alsoRevise.length > 0
    ? rawFocus.alsoRevise.map((item) =>
        typeof item === "string"
          ? { concept: item, reason: "Supporting topic for comprehensive mastery." }
          : {
              concept: String(item.concept || item.topic || "Supporting Concept"),
              reason: String(item.reason || item.note || "Frequently tested alongside primary topics.")
            }
      )
    : [...new Set(validatedQuestions.slice(3).map((q) => q.sourceConcept || q.topic))].slice(0, 3).map((t) => ({
        concept: t,
        reason: "Recommended supporting concept for complete syllabus readiness."
      }));

  const examFocus = {
    highPriority,
    alsoRevise,
    rationale: String(
      rawFocus.rationale ||
        "Prioritized based on the selected examination format and your supplied material."
    )
  };

  return {
    title: String(payload.title || `${config.subject || "Subject"} — ${config.examType || "Exam"} Practice`),
    materialSummary: String(payload.materialSummary || ""),
    examFocus,
    questions: validatedQuestions
  };
}

/**
 * Execute the full 9-stage AI Examination Pipeline via the secure backend
 * Calls onStageChange(stageIndex, stageState) as stages progress naturally.
 *
 * Stages:
 * 0: Reading your material (reading)
 * 1: Identifying key concepts (analyzing)
 * 2: Adapting to your level (thinking)
 * 3: Analyzing examination patterns (analyzing)
 * 4: Building your questions (generating)
 * 5: Checking question quality (checking)
 */
export async function runExamGenerationPipeline(setupConfig, onStageChange = null) {
  if (!navigator.onLine) {
    throw new Error("An internet connection is required for EXAMIVO AI to analyze your material and generate questions.");
  }

  const stageSequence = [
    { index: 0, aiState: "reading" },
    { index: 1, aiState: "analyzing" },
    { index: 2, aiState: "thinking" },
    { index: 3, aiState: "analyzing" },
    { index: 4, aiState: "generating" }
  ];

  let currentStageIdx = 0;
  if (typeof onStageChange === "function") {
    onStageChange(0, "reading");
  }

  // Advance through stages 0..4 naturally while awaiting the backend pipeline
  const stageTimer = setInterval(() => {
    if (currentStageIdx < stageSequence.length - 1) {
      currentStageIdx += 1;
      const st = stageSequence[currentStageIdx];
      if (typeof onStageChange === "function") {
        onStageChange(st.index, st.aiState);
      }
    }
  }, 1450);

  try {
    const response = await fetch(`${API_BASE}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setupConfig)
    });

    clearInterval(stageTimer);

    if (!response.ok) {
      let errMessage = "EXAMIVO couldn't complete that request.";
      try {
        const errData = await response.json();
        if (errData && errData.userMessage) {
          errMessage = errData.userMessage;
        }
      } catch (_) {}
      throw new Error(errMessage);
    }

    // Stage 5: Checking question quality (validation stage)
    if (typeof onStageChange === "function") {
      onStageChange(5, "checking");
    }

    const rawData = await response.json();
    const validated = validatePipelineResponse(rawData, setupConfig);

    // Brief pause on Stage 5 so the student sees quality check complete cleanly
    await new Promise((r) => setTimeout(r, 480));

    return validated;
  } catch (err) {
    clearInterval(stageTimer);
    throw new Error(
      err.message || "EXAMIVO couldn't complete that request. Please verify your material and try again."
    );
  }
}

/**
 * Generate Targeted Follow-up Practice for Weak Areas ("Practice My Weak Areas")
 */
export async function runWeakAreaPracticePipeline(weakPracticeRequest, onStageChange = null) {
  if (!navigator.onLine) {
    throw new Error("An internet connection is required to generate targeted practice.");
  }

  let stageIdx = 0;
  const aiStates = ["analyzing", "thinking", "generating"];
  if (typeof onStageChange === "function") {
    onStageChange(0, "analyzing");
  }

  const timer = setInterval(() => {
    if (stageIdx < 2) {
      stageIdx += 1;
      if (typeof onStageChange === "function") {
        onStageChange(stageIdx, aiStates[stageIdx]);
      }
    }
  }, 1300);

  try {
    const response = await fetch(`${API_BASE}/weak-practice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(weakPracticeRequest)
    });

    clearInterval(timer);

    if (!response.ok) {
      let msg = "EXAMIVO couldn't generate your targeted practice right now.";
      try {
        const errJson = await response.json();
        if (errJson && errJson.userMessage) msg = errJson.userMessage;
      } catch (_) {}
      throw new Error(msg);
    }

    if (typeof onStageChange === "function") {
      onStageChange(3, "checking");
    }

    const rawData = await response.json();
    const validated = validatePipelineResponse(rawData, weakPracticeRequest);
    await new Promise((r) => setTimeout(r, 420));
    return validated;
  } catch (err) {
    clearInterval(timer);
    throw new Error(err.message || "EXAMIVO couldn't build your targeted practice right now.");
  }
}

/**
 * Evaluate Open-Ended / Theory / Short Answer / Calculation Responses via Backend AI
 */
export async function evaluateOpenResponsesViaAI(evaluationPayload) {
  if (!navigator.onLine) {
    return null;
  }
  try {
    const response = await fetch(`${API_BASE}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evaluationPayload)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

/**
 * Generate "Study My Mistakes" Revision Notes, Important Concepts, Examples & Practice Questions
 */
export async function generateStudyMistakesGuide(studyRequest) {
  if (!navigator.onLine) {
    throw new Error("An internet connection is required to generate your personalized study notes.");
  }

  const response = await fetch(`${API_BASE}/study`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(studyRequest)
  });

  if (!response.ok) {
    let msg = "EXAMIVO couldn't generate your study guide right now.";
    try {
      const errJson = await response.json();
      if (errJson && errJson.userMessage) msg = errJson.userMessage;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.modules) || data.modules.length === 0) {
    throw new Error("EXAMIVO received an incomplete revision guide. Please try again.");
  }
  return data;
}
