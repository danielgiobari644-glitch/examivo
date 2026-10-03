/**
 * EXAMIVO — Question Renderer & Grading Engine
 * Supports: multiple_choice, true_false, fill_blank, short_answer,
 *           theory, essay, calculation, scenario, matching
 */

import { escapeHtml, QUESTION_TYPE_LABELS } from "./utils.js";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Determine whether a question uses option selection (MCQ-style) or open/structured input
 */
export function isOptionBasedQuestion(question) {
  if (!question) return false;
  if (question.type === "multiple_choice" || question.type === "true_false") {
    return true;
  }
  if (
    (question.type === "calculation" || question.type === "scenario") &&
    Array.isArray(question.options) &&
    question.options.length >= 2
  ) {
    return true;
  }
  return false;
}

/**
 * Render the interactive input control for a question
 * @param {Object} question
 * @param {*} currentAnswer
 * @param {Object} opts - { revealFeedback: boolean, onAnswerChange: Function }
 */
export function renderQuestionInteractiveArea(question, currentAnswer, containerEl, opts = {}) {
  if (!containerEl || !question) return;
  const revealFeedback = Boolean(opts.revealFeedback);
  const onAnswerChange = opts.onAnswerChange || (() => {});

  // 1. Option-based questions (multiple_choice, true_false, or MCQ-based calculation/scenario)
  if (isOptionBasedQuestion(question)) {
    const options =
      question.type === "true_false" && (!question.options || question.options.length < 2)
        ? ["True", "False"]
        : question.options || [];

    const html = `
      <div class="answer-options-list" role="radiogroup" aria-label="Answer choices">
        ${options
          .map((optText, idx) => {
            const isSelected = currentAnswer !== undefined && currentAnswer !== null && Number(currentAnswer) === idx;
            const isCorrectChoice = Number(question.correctAnswer) === idx;

            let stateClass = "";
            if (revealFeedback) {
              if (isCorrectChoice) stateClass = "correct-reveal";
              else if (isSelected && !isCorrectChoice) stateClass = "wrong-reveal";
            } else if (isSelected) {
              stateClass = "selected";
            }

            const letter = question.type === "true_false" ? (idx === 0 ? "T" : "F") : OPTION_LETTERS[idx] || String(idx + 1);

            return `
              <button
                type="button"
                class="option-choice-btn ${stateClass}"
                data-option-idx="${idx}"
                role="radio"
                aria-checked="${isSelected ? "true" : "false"}"
                ${revealFeedback ? "disabled" : ""}
              >
                <span class="option-letter-key">${escapeHtml(letter)}</span>
                <span style="flex:1;">${escapeHtml(optText)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    `;

    containerEl.innerHTML = html;

    if (!revealFeedback) {
      containerEl.querySelectorAll(".option-choice-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-option-idx"));
          onAnswerChange(idx);
        });
      });
    }
    return;
  }

  // 2. Matching Question Type
  if (question.type === "matching" && Array.isArray(question.options) && question.options.length > 0) {
    const pairs = question.options.map((item) =>
      typeof item === "object" && item !== null
        ? { left: String(item.left || ""), right: String(item.right || "") }
        : { left: String(item), right: String(item) }
    );

    const allRightChoices = [...new Set(pairs.map((p) => p.right))];
    const userSelections = Array.isArray(currentAnswer) ? currentAnswer : new Array(pairs.length).fill("");

    const html = `
      <div class="matching-grid">
        ${pairs
          .map((pair, idx) => {
            const selVal = userSelections[idx] || "";
            return `
              <div class="matching-pair-row">
                <div class="matching-left-term">${idx + 1}. ${escapeHtml(pair.left)}</div>
                <div>
                  <select class="form-select matching-select-input" data-pair-idx="${idx}" ${revealFeedback ? "disabled" : ""}>
                    <option value="">Select matching item...</option>
                    ${allRightChoices
                      .map(
                        (choice) => `
                          <option value="${escapeHtml(choice)}" ${selVal === choice ? "selected" : ""}>
                            ${escapeHtml(choice)}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;

    containerEl.innerHTML = html;

    if (!revealFeedback) {
      containerEl.querySelectorAll(".matching-select-input").forEach((selectEl) => {
        selectEl.addEventListener("change", () => {
          const nextArr = [...userSelections];
          const pIdx = Number(selectEl.getAttribute("data-pair-idx"));
          nextArr[pIdx] = selectEl.value;
          onAnswerChange(nextArr);
        });
      });
    }
    return;
  }

  // 3. Fill in the Blank / Calculation (open numeric/short text)
  if (question.type === "fill_blank" || question.type === "calculation") {
    const val = currentAnswer !== undefined && currentAnswer !== null ? String(currentAnswer) : "";
    const placeholder =
      question.type === "calculation"
        ? "Enter your calculated result or expression (show key steps if applicable)..."
        : "Type the missing term or phrase...";

    containerEl.innerHTML = `
      <div class="open-answer-area">
        <label class="form-label" for="open-question-input" style="margin-bottom:0.5rem; display:block;">
          Your ${question.type === "calculation" ? "Calculation / Answer" : "Answer"}
        </label>
        <input
          type="text"
          id="open-question-input"
          class="form-input"
          value="${escapeHtml(val)}"
          placeholder="${escapeHtml(placeholder)}"
          ${revealFeedback ? "disabled" : ""}
          autocomplete="off"
        />
      </div>
    `;

    const inputEl = containerEl.querySelector("#open-question-input");
    if (inputEl && !revealFeedback) {
      inputEl.addEventListener("input", () => {
        onAnswerChange(inputEl.value);
      });
    }
    return;
  }

  // 4. Short Answer / Theory / Essay / Open Scenario
  const val = currentAnswer !== undefined && currentAnswer !== null ? String(currentAnswer) : "";
  const rows = question.type === "essay" || question.type === "theory" ? 6 : 4;
  const label = QUESTION_TYPE_LABELS[question.type] || "Written Response";

  containerEl.innerHTML = `
    <div class="open-answer-area">
      <label class="form-label" for="open-question-textarea" style="margin-bottom:0.5rem; display:block;">
        Your ${escapeHtml(label)} Response
      </label>
      <textarea
        id="open-question-textarea"
        class="form-textarea"
        rows="${rows}"
        placeholder="Write your clear, structured examination response here..."
        ${revealFeedback ? "disabled" : ""}
      >${escapeHtml(val)}</textarea>
    </div>
  `;

  const areaEl = containerEl.querySelector("#open-question-textarea");
  if (areaEl && !revealFeedback) {
    areaEl.addEventListener("input", () => {
      onAnswerChange(areaEl.value);
    });
  }
}

/**
 * Check whether a user has supplied a non-empty answer for a question
 */
export function hasUserAnswered(question, answer) {
  if (answer === undefined || answer === null) return false;
  if (isOptionBasedQuestion(question)) {
    return typeof answer === "number" && !isNaN(answer);
  }
  if (question.type === "matching") {
    return Array.isArray(answer) && answer.some((v) => String(v || "").trim().length > 0);
  }
  return String(answer).trim().length > 0;
}

/**
 * Evaluate a single question deterministically (and merge AI evaluation for open-ended items if present)
 * Returns { isCorrect: boolean, scoreRatio: number, userAnswerFormatted: string, correctAnswerFormatted: string }
 */
export function evaluateSingleQuestion(question, userAnswer, aiOpenEvaluation = null) {
  // 1. Option-based (MCQ, True/False, MCQ-Calculation/Scenario)
  if (isOptionBasedQuestion(question)) {
    const options =
      question.type === "true_false" && (!question.options || question.options.length < 2)
        ? ["True", "False"]
        : question.options || [];

    const correctIdx = Number(question.correctAnswer);
    const userIdx = userAnswer !== undefined && userAnswer !== null && userAnswer !== "" ? Number(userAnswer) : -1;
    const isCorrect = userIdx === correctIdx;

    const formatChoice = (idx) => {
      if (idx < 0 || idx >= options.length || isNaN(idx)) return "No answer selected";
      const letter = question.type === "true_false" ? (idx === 0 ? "True" : "False") : OPTION_LETTERS[idx] || String(idx + 1);
      return question.type === "true_false" ? options[idx] : `${letter}. ${options[idx]}`;
    };

    return {
      isCorrect,
      scoreRatio: isCorrect ? 1 : 0,
      userAnswerFormatted: formatChoice(userIdx),
      correctAnswerFormatted: formatChoice(correctIdx)
    };
  }

  // 2. Matching
  if (question.type === "matching" && Array.isArray(question.options)) {
    const pairs = question.options;
    const userArr = Array.isArray(userAnswer) ? userAnswer : [];
    let matches = 0;
    pairs.forEach((p, idx) => {
      const expected = String(p.right || "").trim().toLowerCase();
      const given = String(userArr[idx] || "").trim().toLowerCase();
      if (expected && given === expected) matches += 1;
    });
    const ratio = pairs.length > 0 ? matches / pairs.length : 0;
    const isCorrect = ratio >= 0.75;

    const userFormatted =
      userArr.filter(Boolean).length > 0
        ? pairs.map((p, idx) => `${p.left} → ${userArr[idx] || "(unmatched)"}`).join("; ")
        : "No answer provided";
    const correctFormatted = pairs.map((p) => `${p.left} → ${p.right}`).join("; ");

    return {
      isCorrect,
      scoreRatio: ratio,
      userAnswerFormatted: userFormatted,
      correctAnswerFormatted: correctFormatted
    };
  }

  // 3. Open-Ended (fill_blank, short_answer, theory, essay, calculation)
  const givenText = String(userAnswer || "").trim();
  const expectedText = String(question.correctAnswer || "").trim();

  if (!givenText) {
    return {
      isCorrect: false,
      scoreRatio: 0,
      userAnswerFormatted: "No answer provided",
      correctAnswerFormatted: expectedText || "See model explanation below"
    };
  }

  // If Backend AI Open Evaluation provided a score/verdict for this question, use it
  if (aiOpenEvaluation && typeof aiOpenEvaluation.isCorrect === "boolean") {
    return {
      isCorrect: aiOpenEvaluation.isCorrect,
      scoreRatio: typeof aiOpenEvaluation.scoreRatio === "number" ? aiOpenEvaluation.scoreRatio : (aiOpenEvaluation.isCorrect ? 1 : 0),
      userAnswerFormatted: givenText,
      correctAnswerFormatted: expectedText || "Model Answer",
      aiFeedback: aiOpenEvaluation.feedback || ""
    };
  }

  // Deterministic semantic & keyword rubric matching for fill_blank / calculation / short_answer / theory
  const normGiven = givenText.toLowerCase().replace(/[^a-z0-9.+-]/g, " ").replace(/\s+/g, " ").trim();
  const normExpected = expectedText.toLowerCase().replace(/[^a-z0-9.+-]/g, " ").replace(/\s+/g, " ").trim();

  if (normGiven === normExpected || (normExpected.length > 2 && normGiven.includes(normExpected))) {
    return {
      isCorrect: true,
      scoreRatio: 1,
      userAnswerFormatted: givenText,
      correctAnswerFormatted: expectedText
    };
  }

  // Check key terms from expected answer + keyPoints
  const stopWords = new Set(["the", "and", "for", "that", "with", "from", "this", "are", "was", "were", "into", "when", "which", "their"]);
  const expectedTokens = normExpected
    .split(" ")
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  const keyPoints = Array.isArray(question.keyPoints) && question.keyPoints.length > 0
    ? question.keyPoints.map((k) => String(k).toLowerCase())
    : expectedTokens;

  if (keyPoints.length === 0) {
    const ok = givenText.split(/\s+/).length >= 5;
    return {
      isCorrect: ok,
      scoreRatio: ok ? 1 : 0,
      userAnswerFormatted: givenText,
      correctAnswerFormatted: expectedText
    };
  }

  let matchedCount = 0;
  keyPoints.forEach((kp) => {
    const cleanKp = kp.replace(/[^a-z0-9.+-]/g, " ").trim();
    if (cleanKp && normGiven.includes(cleanKp)) {
      matchedCount += 1;
    }
  });

  const ratio = matchedCount / keyPoints.length;
  const threshold = question.type === "fill_blank" || question.type === "calculation" ? 0.65 : 0.45;
  const isCorrect = ratio >= threshold;

  return {
    isCorrect,
    scoreRatio: isCorrect ? 1 : ratio,
    userAnswerFormatted: givenText,
    correctAnswerFormatted: expectedText
  };
}
