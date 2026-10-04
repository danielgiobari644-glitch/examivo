/* ============================================================
   EXAMIVO — Class & Exam profiles (server-side)
   Class-adaptive language is a core product feature: the class
   profile controls vocabulary, sentence complexity and cognitive
   expectations. The exam profile controls format, structure and
   marking style.
   ============================================================ */

const CLASS_PROFILES = {
  primary: {
    match: (c) => /^Primary/i.test(c || ''),
    label: 'Primary',
    language:
      'Use very simple, warm, concrete English. Short sentences (max 14 words). Everyday vocabulary. ' +
      'Explain any term that is not common in daily life, inside the question or explanation. ' +
      'Numbers stay small; stories and objects should be familiar (oranges, books, money in naira).',
    cognitive: 'Recall, recognition, simple counting, one-step reasoning, direct observation.',
    explanationStyle:
      'Explanations are 1–3 short sentences, friendly and concrete. Reference the exact fact or step, never jargon.',
  },
  jss: {
    match: (c) => /^JSS/i.test(c || ''),
    label: 'Junior Secondary',
    language:
      'Use clear, simple academic English. One idea per sentence. Define technical terms in brackets the first ' +
      'time they appear (e.g. "photosynthesis (how green plants make food from sunlight)"). Avoid long nested clauses.',
    cognitive: (c) =>
      c === 'JSS3'
        ? 'Recall, understanding, straightforward application, simple multi-step reasoning, basic interpretation of tables/diagrams.'
        : 'Recall, basic understanding, simple application, classification, one or two-step reasoning.',
    explanationStyle:
      'Explanations are 2–4 sentences. State the fact, then briefly say why it is so. Use the term + plain-language meaning.',
  },
  ss: {
    match: (c) => /^SS/i.test(c || ''),
    label: 'Senior Secondary',
    language:
      'Use senior-secondary academic English. Precise subject terminology is expected and should NOT be oversimplified. ' +
      'Questions may include data, formulas, passages, scenarios. Keep sentences controlled and unambiguous.',
    cognitive: (c) =>
      c === 'SS3'
        ? 'Full WAEC/NECO/JAMB cognitive range: recall, comprehension, application, analysis, synthesis, evaluation, extended calculations.'
        : 'Understanding, application, structured analysis, multi-step calculations, comparison, interpretation.',
    explanationStyle:
      'Explanations are 2–5 sentences, exam-focused: state the correct principle, apply it to this question, and note the classic mistake to avoid.',
  },
  university: {
    match: (c) => /university/i.test(c || ''),
    label: 'University',
    language:
      'Use university-level academic language and correct disciplinary terminology. Assumptions, definitions and units ' +
      'must be stated precisely. Scenario and application questions are encouraged.',
    cognitive: 'Analysis, evaluation, synthesis, modelling, quantitative problem solving, critical argument.',
    explanationStyle:
      'Explanations are rigorous: principle → application → implication. Cite the governing rule or formula.',
  },
  other: {
    match: (c) => /^Other$/i.test(c || ''),
    label: 'Other',
    language:
      'Default to clear, adult general-education English with precise terminology where the subject requires it.',
    cognitive: 'Understanding and application appropriate to adult learners.',
    explanationStyle: 'Explanations are 2–4 sentences: principle, application, takeaway.',
  },
};

const EXAM_PROFILES = {
  waec: {
    label: 'WAEC',
    style:
      'West African Examinations Council style. Objective section: stem-based MCQs with 4 options and plausible ' +
      'distractors built from common misconceptions. Theory questions use command words exactly as WAEC does ' +
      '(List, State, Define, Describe, Explain, Outline, Calculate, Distinguish). Calculations must show the marks expectation. ' +
      'No trick questions; syllabus-true content.',
    typeMix: {
      multiple_choice: 0.6,
      fill_blank: 0.1,
      calculation: 0.12,
      short_answer: 0.1,
      theory: 0.08,
    },
    marksPerQuestion: { theory: 10, essay: 15, short_answer: 4, calculation: 5 },
  },
  neco: {
    label: 'NECO',
    style:
      'NECO style: similar to WAEC but often more direct wording. MCQs with 4 options, straightforward theory commands, ' +
      'emphasis on definitions, listing and explanation. Keep language accessible for the class level.',
    typeMix: {
      multiple_choice: 0.62,
      fill_blank: 0.12,
      calculation: 0.1,
      short_answer: 0.1,
      theory: 0.06,
    },
    marksPerQuestion: { theory: 10, short_answer: 4, calculation: 5 },
  },
  jamb: {
    label: 'JAMB / UTME',
    style:
      'JAMB UTME style: strictly objective. Fast, precise, unambiguous stems; exactly 4 options (A–D); distractors ' +
      'based on common errors (wrong formula, unit slips, half-remembered facts). No essay/theory. Calculations must be ' +
      'solvable in under 90 seconds.',
    typeMix: {
      multiple_choice: 0.72,
      calculation: 0.2,
      true_false: 0.08,
    },
    marksPerQuestion: {},
  },
  common_entrance: {
    label: 'Common Entrance',
    style:
      'Primary school Common Entrance style: friendly, concrete questions; MCQs with 4 options; simple fill-in-the-blanks; ' +
      'tiny calculations with whole numbers; short reasons ("why") questions.',
    typeMix: {
      multiple_choice: 0.55,
      fill_blank: 0.2,
      true_false: 0.15,
      short_answer: 0.1,
    },
    marksPerQuestion: {},
  },
  school_exam: {
    label: 'School Examination',
    style:
      'Terminal school exam style: a balanced paper — objective section (MCQ, fill-blank) plus structured theory ' +
      'questions with command words and mark allocation. Match the class level exactly.',
    typeMix: {
      multiple_choice: 0.5,
      fill_blank: 0.15,
      calculation: 0.1,
      short_answer: 0.12,
      theory: 0.08,
      true_false: 0.05,
    },
    marksPerQuestion: { theory: 8, short_answer: 4, calculation: 5 },
  },
  class_test: {
    label: 'Class Test',
    style:
      'Short class test style: focused, quick questions on the specific material. Mostly objective with at most one ' +
      'short explanation question.',
    typeMix: {
      multiple_choice: 0.55,
      fill_blank: 0.2,
      true_false: 0.15,
      short_answer: 0.1,
    },
    marksPerQuestion: {},
  },
  quiz: {
    label: 'Quiz',
    style:
      'Quick quiz style: snappy, engaging, unambiguous. Objective questions only (MCQ, true/false, fill-blank).',
    typeMix: {
      multiple_choice: 0.6,
      true_false: 0.25,
      fill_blank: 0.15,
    },
    marksPerQuestion: {},
  },
  mock: {
    label: 'Mock Examination',
    style:
      'Full mock simulation: exam-length structure, strict wording, realistic mark allocation, mixed objective + theory, ' +
      'at least two multi-step calculations where the subject allows. Mirror the difficulty distribution of the real exam.',
    typeMix: {
      multiple_choice: 0.45,
      calculation: 0.15,
      fill_blank: 0.1,
      short_answer: 0.12,
      theory: 0.1,
      scenario: 0.08,
    },
    marksPerQuestion: { theory: 12, essay: 15, short_answer: 5, calculation: 6 },
  },
  custom: {
    label: 'Custom Examination',
    style:
      'Balanced custom examination: clear stems, mixed objective and short constructed-response questions, sensible mark allocation.',
    typeMix: {
      multiple_choice: 0.5,
      fill_blank: 0.15,
      true_false: 0.1,
      calculation: 0.1,
      short_answer: 0.1,
      theory: 0.05,
    },
    marksPerQuestion: { theory: 8, short_answer: 4, calculation: 5 },
  },
};

function classProfile(classLevel) {
  for (const p of Object.values(CLASS_PROFILES)) {
    if (p.match(classLevel)) return p;
  }
  return CLASS_PROFILES.other;
}

function examProfile(examType) {
  return EXAM_PROFILES[examType] || EXAM_PROFILES.custom;
}

/** Pick the question-type mix for this exam, filtered by count. */
function planTypeMix(examType, count, focusTypes = null) {
  const mix = examProfile(examType).typeMix;
  const entries = Object.entries(mix);
  const plan = [];
  let remaining = count;
  const pool = [];
  entries.forEach(([type, share], i) => {
    let n = i === entries.length - 1 ? remaining : Math.round(count * share);
    n = Math.max(0, Math.min(n, remaining));
    for (let k = 0; k < n; k++) pool.push(type);
    remaining -= n;
  });
  while (remaining > 0) {
    pool.push(entries[0][0]);
    remaining--;
  }
  // shuffle lightly so the paper feels varied but keeps the mix
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

module.exports = { CLASS_PROFILES, EXAM_PROFILES, classProfile, examProfile, planTypeMix };
