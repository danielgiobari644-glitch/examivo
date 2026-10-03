/**
 * EXAMIVO — Core Profiles, Constants & Utility Functions
 * Class-Adaptive Language Profiles, Subject Catalog, Exam Profiles & Material Extractors
 */

export const CLASS_PROFILES = {
  "Primary 1": {
    id: "Primary 1",
    group: "Primary School",
    shortLabel: "Primary 1",
    languageLevel: "Foundational early-primary English. Very short, clear sentences, concrete everyday examples, warm and encouraging tone.",
    cognitiveFocus: "Basic recognition, direct recall, simple counting and identification.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank"]
  },
  "Primary 2": {
    id: "Primary 2",
    group: "Primary School",
    shortLabel: "Primary 2",
    languageLevel: "Simple, direct primary English. Clear sentence structure and relatable everyday situations.",
    cognitiveFocus: "Direct comprehension, basic classification, and simple operations.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank"]
  },
  "Primary 3": {
    id: "Primary 3",
    group: "Primary School",
    shortLabel: "Primary 3",
    languageLevel: "Clear lower-middle primary English. Introduces foundational subject vocabulary with brief contextual explanations.",
    cognitiveFocus: "Comprehension, basic application, and short guided steps.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank", "matching"]
  },
  "Primary 4": {
    id: "Primary 4",
    group: "Primary School",
    shortLabel: "Primary 4",
    languageLevel: "Upper-primary English. Clear, structured sentences with standard upper-primary curriculum terms.",
    cognitiveFocus: "Concept understanding, multi-step arithmetic/reasoning, and structured recall.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer"]
  },
  "Primary 5": {
    id: "Primary 5",
    group: "Primary School",
    shortLabel: "Primary 5",
    languageLevel: "Pre-entrance upper-primary English. Crisp, structured academic phrasing suitable for 10-11 year olds.",
    cognitiveFocus: "Application, word problems, verbal/quantitative reasoning, and concept definitions.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer", "calculation"]
  },
  "Primary 6": {
    id: "Primary 6",
    group: "Primary School",
    shortLabel: "Primary 6",
    languageLevel: "Common Entrance / Primary completion standard. Clear, accurate terminology without unnecessary complexity.",
    cognitiveFocus: "Exam readiness, multi-step word problems, comprehension, and foundational science/social concepts.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer", "calculation"]
  },
  "JSS1": {
    id: "JSS1",
    group: "Junior Secondary",
    shortLabel: "JSS1",
    languageLevel: "Simple, clear Junior Secondary English. Introduces core subject terminology clearly without dense academic jargon.",
    cognitiveFocus: "Foundational secondary concepts, definitions, basic calculations, and direct application.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer", "matching"]
  },
  "JSS2": {
    id: "JSS2",
    group: "Junior Secondary",
    shortLabel: "JSS2",
    languageLevel: "Progressive Junior Secondary English. Balanced clarity with standard curriculum terminology.",
    cognitiveFocus: "Intermediate application, structured reasoning, diagram/process understanding, and calculations.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer", "calculation", "matching"]
  },
  "JSS3": {
    id: "JSS3",
    group: "Junior Secondary",
    shortLabel: "JSS3",
    languageLevel: "Moderately academic Junior Secondary (BECE/Junior WAEC) English. Precise definitions and structured explanations.",
    cognitiveFocus: "Full Junior Secondary syllabus integration, objective + short theory mastery, and calculation accuracy.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer", "theory", "calculation"]
  },
  "SS1": {
    id: "SS1",
    group: "Senior Secondary",
    shortLabel: "SS1",
    languageLevel: "Foundational Senior Secondary academic English. Uses proper technical and scientific nomenclature with clear step-by-step explanations.",
    cognitiveFocus: "Analytical understanding, derivations, formal definitions, and scenario application.",
    defaultQuestionTypes: ["multiple_choice", "short_answer", "theory", "calculation", "scenario"]
  },
  "SS2": {
    id: "SS2",
    group: "Senior Secondary",
    shortLabel: "SS2",
    languageLevel: "Advanced Senior Secondary academic language. Formal, rigorous, and aligned with WASSCE/NECO syllabus depth.",
    cognitiveFocus: "Multi-concept synthesis, quantitative problem solving, structured theory, and practical analysis.",
    defaultQuestionTypes: ["multiple_choice", "short_answer", "theory", "calculation", "scenario", "matching"]
  },
  "SS3": {
    id: "SS3",
    group: "Senior Secondary",
    shortLabel: "SS3",
    languageLevel: "Senior-secondary terminal examination language (WAEC / NECO / JAMB UTME standard). Precise, rigorous, exam-standard phrasing.",
    cognitiveFocus: "High-stakes exam discrimination, multi-step synthesis, speed & accuracy, and mark-scheme aligned theory.",
    defaultQuestionTypes: ["multiple_choice", "short_answer", "theory", "essay", "calculation", "scenario"]
  },
  "University": {
    id: "University",
    group: "Tertiary / Higher Education",
    shortLabel: "University",
    languageLevel: "University-level academic and technical terminology. Rigorous, formal, discipline-specific discourse.",
    cognitiveFocus: "Critical analysis, theoretical proofs/derivations, complex case scenarios, and edge-case evaluation.",
    defaultQuestionTypes: ["multiple_choice", "short_answer", "theory", "essay", "calculation", "scenario"]
  },
  "Other": {
    id: "Other",
    group: "Tertiary / Higher Education",
    shortLabel: "Professional / Other",
    languageLevel: "Clear, professional, domain-accurate academic English adapted to the supplied material.",
    cognitiveFocus: "Applied mastery, conceptual precision, and practical problem solving.",
    defaultQuestionTypes: ["multiple_choice", "true_false", "short_answer", "theory", "scenario"]
  }
};

export const SUBJECTS_LIST = [
  { id: "Mathematics", name: "Mathematics", category: "STEM", desc: "Algebra, geometry, calculus, statistics & quantitative methods" },
  { id: "English Language", name: "English Language", category: "Languages & Humanities", desc: "Lexis, structure, comprehension, summary & oral/written expression" },
  { id: "Biology", name: "Biology", category: "STEM", desc: "Cell biology, genetics, ecology, physiology & evolution" },
  { id: "Chemistry", name: "Chemistry", category: "STEM", desc: "Stoichiometry, atomic structure, organic, inorganic & physical chemistry" },
  { id: "Physics", name: "Physics", category: "STEM", desc: "Mechanics, waves, thermodynamics, electricity & modern physics" },
  { id: "Basic Science", name: "Basic Science", category: "STEM", desc: "Foundational living systems, matter, energy & environmental science" },
  { id: "Basic Technology", name: "Basic Technology", category: "STEM", desc: "Technical drawing, materials, workshop safety, machines & energy" },
  { id: "Economics", name: "Economics", category: "Social & Commercial", desc: "Microeconomics, macroeconomics, markets, fiscal policy & development" },
  { id: "Government", name: "Government", category: "Social & Commercial", desc: "Political systems, constitutions, public administration & international relations" },
  { id: "Civic Education", name: "Civic Education", category: "Social & Commercial", desc: "Citizenship, human rights, democracy, rule of law & national values" },
  { id: "Geography", name: "Geography", category: "Social & Commercial", desc: "Physical landforms, climatology, human geography & map reading" },
  { id: "Literature", name: "Literature", category: "Languages & Humanities", desc: "Prose, drama, poetry, literary devices & critical appreciation" },
  { id: "Agricultural Science", name: "Agricultural Science", category: "STEM", desc: "Crop production, soil science, animal husbandry & farm economics" },
  { id: "Computer Science", name: "Computer Science", category: "STEM", desc: "Algorithms, data structures, networking, logic gates & software systems" },
  { id: "Christian Religious Studies", name: "Christian Religious Studies", category: "Languages & Humanities", desc: "Biblical history, themes, moral teachings & apostolic theology" },
  { id: "Islamic Religious Studies", name: "Islamic Religious Studies", category: "Languages & Humanities", desc: "Qur'anic studies, Hadith, Fiqh, Tawhid & Islamic history" },
  { id: "Accounting", name: "Accounting", category: "Social & Commercial", desc: "Double-entry bookkeeping, ledgers, financial statements & ratios" },
  { id: "Commerce", name: "Commerce", category: "Social & Commercial", desc: "Trade, banking, insurance, transportation & business organization" },
  { id: "Further Mathematics", name: "Further Mathematics", category: "STEM", desc: "Advanced calculus, matrices, vectors, mechanics & probability" },
  { id: "Other", name: "Other", category: "Custom", desc: "Specify a custom course, university module, or specialized subject" }
];

export const EXAM_PROFILES = {
  "WAEC": {
    id: "WAEC",
    name: "WAEC (WASSCE)",
    badge: "West African Senior School Certificate",
    desc: "Combines rigorous objective questions with structured theory & calculation problems aligned with WASSCE marking schemes.",
    styleNotes: "Emphasize standard WASSCE phrasing, multi-step calculations, formal definitions, and clear marking-scheme points.",
    allowedTypes: ["multiple_choice", "short_answer", "theory", "calculation", "scenario"],
    defaultMinutesPerQuestion: 1.5
  },
  "NECO": {
    id: "NECO",
    name: "NECO (SSCE / BECE)",
    badge: "National Examinations Council",
    desc: "Syllabus-comprehensive objective and structured theory questions testing breadth of curriculum mastery.",
    styleNotes: "Focus on syllabus coverage, clear conceptual distinctions, structured definitions, and applied calculations.",
    allowedTypes: ["multiple_choice", "true_false", "short_answer", "theory", "calculation"],
    defaultMinutesPerQuestion: 1.5
  },
  "JAMB / UTME": {
    id: "JAMB / UTME",
    name: "JAMB / UTME",
    badge: "Unified Tertiary Matriculation Exam",
    desc: "High-speed, high-discrimination 4-option multiple choice questions testing deep conceptual traps and rapid problem-solving.",
    styleNotes: "Strictly 4-option multiple_choice (and calculation-based multiple_choice) with plausible distractors targeting common student misconceptions.",
    allowedTypes: ["multiple_choice"],
    defaultMinutesPerQuestion: 1.0
  },
  "Common Entrance": {
    id: "Common Entrance",
    name: "Common Entrance",
    badge: "National Common Entrance",
    desc: "Upper-primary examination focusing on rapid accuracy, quantitative/verbal reasoning, and core foundational concepts.",
    styleNotes: "Clear, unambiguous multiple-choice and fill-in-the-blank questions appropriate for Primary 5–6 students.",
    allowedTypes: ["multiple_choice", "fill_blank", "true_false", "calculation"],
    defaultMinutesPerQuestion: 1.2
  },
  "School Examination": {
    id: "School Examination",
    name: "School Examination",
    badge: "End-of-Term Assessment",
    desc: "Balanced terminal school exam combining Section A (Objectives) and Section B (Short Answer / Theory).",
    styleNotes: "Balanced mix of multiple choice, fill in the blank, short answer, and structured theory questions.",
    allowedTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer", "theory", "calculation"],
    defaultMinutesPerQuestion: 1.5
  },
  "Class Test": {
    id: "Class Test",
    name: "Class Test",
    badge: "Continuous Assessment",
    desc: "Targeted topic assessment measuring immediate comprehension of recent classroom notes or chapters.",
    styleNotes: "Direct, focused questions closely anchored to definitions, examples, and formulas in the study material.",
    allowedTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer", "calculation"],
    defaultMinutesPerQuestion: 1.2
  },
  "Quiz": {
    id: "Quiz",
    name: "Quiz",
    badge: "Rapid Concept Check",
    desc: "Fast-paced objective check to verify core concept retention, terminology, and key facts.",
    styleNotes: "Crisp multiple choice, true/false, fill-in-the-blank, and matching items.",
    allowedTypes: ["multiple_choice", "true_false", "fill_blank", "matching"],
    defaultMinutesPerQuestion: 0.9
  },
  "Mock Examination": {
    id: "Mock Examination",
    name: "Mock Examination",
    badge: "Full Readiness Simulation",
    desc: "Comprehensive pre-exam simulation testing endurance, synthesis across concepts, and exam-level difficulty.",
    styleNotes: "Rigorous exam-standard questions combining objective, scenario, calculation, and theory items.",
    allowedTypes: ["multiple_choice", "short_answer", "theory", "calculation", "scenario", "matching"],
    defaultMinutesPerQuestion: 1.5
  },
  "Custom Examination": {
    id: "Custom Examination",
    name: "Custom Examination",
    badge: "Tailored Blueprint",
    desc: "Flexible examination blueprint covering diverse cognitive skills and question formats.",
    styleNotes: "Include a thoughtful variety of multiple choice, scenario, short answer, matching, and calculation/theory questions.",
    allowedTypes: ["multiple_choice", "true_false", "fill_blank", "short_answer", "theory", "essay", "calculation", "scenario", "matching"],
    defaultMinutesPerQuestion: 1.4
  }
};

export const DIFFICULTY_LEVELS = [
  { id: "Easy", label: "Easy", desc: "Foundational recall, direct concept recognition & single-step reasoning" },
  { id: "Medium", label: "Medium", desc: "Standard application, two-step problem solving & conceptual connections" },
  { id: "Hard", label: "Hard", desc: "Multi-step synthesis, non-obvious edge cases & analytical reasoning" },
  { id: "Exam Level", label: "Exam Level", desc: "Calibrated strictly to official examination standards and mark schemes" },
  { id: "Mixed", label: "Mixed", desc: "Progressive blend from foundational checks to high-discrimination exam items" }
];

export const QUESTION_TYPE_LABELS = {
  multiple_choice: "Multiple Choice",
  true_false: "True / False",
  fill_blank: "Fill in the Blank",
  short_answer: "Short Answer",
  theory: "Theory",
  essay: "Essay",
  calculation: "Calculation",
  scenario: "Application / Scenario",
  matching: "Matching"
};

/**
 * Safe HTML escaping to prevent XSS when rendering user or AI strings
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generate collision-resistant unique ID
 */
export function generateId(prefix = "exm") {
  const rand = Math.random().toString(36).substring(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`;
}

/**
 * Format file size in human-readable bytes
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format seconds into MM:SS or HH:MM:SS
 */
export function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format timestamp or ISO string into readable date
 */
export function formatDate(input) {
  if (!input) return "Just now";
  try {
    let dateObj;
    if (typeof input === "object" && typeof input.toDate === "function") {
      dateObj = input.toDate();
    } else if (typeof input === "object" && input.seconds) {
      dateObj = new Date(input.seconds * 1000);
    } else {
      dateObj = new Date(input);
    }
    if (isNaN(dateObj.getTime())) return "Recently";
    return dateObj.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch (_) {
    return "Recently";
  }
}

/**
 * Convert a File or Blob to Base64 data URL ( resizing large images so payload stays fast )
 */
export async function fileToBase64Payload(file) {
  const isImage = file.type.startsWith("image/");
  if (isImage) {
    try {
      return await compressImageFile(file, 1600, 0.84);
    } catch (_) {
      // Fallback to raw reader
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({
        mimeType: file.type || "application/octet-stream",
        base64,
        dataUrl: result
      });
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

function compressImageFile(file, maxDim = 1600, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.split(",")[1];
      resolve({
        mimeType: "image/jpeg",
        base64,
        dataUrl
      });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Extract readable text or structured payload from uploaded Document / Image
 * Supports TXT, DOC/DOCX, PDF, and Images (JPG, JPEG, PNG, WEBP)
 */
export async function extractMaterialFromFile(file) {
  const name = file.name || "material";
  const ext = name.split(".").pop().toLowerCase();
  const mime = file.type || "";

  // 1. Plain Text / Markdown / CSV
  if (ext === "txt" || ext === "md" || mime === "text/plain") {
    const text = await file.text();
    return {
      sourceType: "document",
      fileName: name,
      fileSize: file.size,
      mimeType: "text/plain",
      extractedText: text.trim().slice(0, 60000),
      base64: null
    };
  }

  // 2. Image files (JPG, JPEG, PNG, WEBP)
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(ext)) {
    const encoded = await fileToBase64Payload(file);
    return {
      sourceType: "image",
      fileName: name,
      fileSize: file.size,
      mimeType: encoded.mimeType,
      extractedText: "",
      base64: encoded.base64
    };
  }

  // 3. PDF or DOC/DOCX files: extract readable ASCII/Unicode text streams on client + pass base64 for backend parser/AI
  const arrayBuffer = await file.arrayBuffer();
  const extractedText = await extractTextFromBinaryDocument(arrayBuffer, ext);
  let base64 = null;
  if (file.size <= 6 * 1024 * 1024) {
    const encoded = await fileToBase64Payload(file);
    base64 = encoded.base64;
  }

  return {
    sourceType: "document",
    fileName: name,
    fileSize: file.size,
    mimeType: mime || (ext === "pdf" ? "application/pdf" : "application/octet-stream"),
    extractedText: extractedText.slice(0, 60000),
    base64
  };
}

/**
 * Lightweight client-side text stream extractor for PDF / DOCX / DOC files
 * Ensures immediate structured text availability alongside backend multimodal analysis.
 */
async function extractTextFromBinaryDocument(arrayBuffer, ext) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const rawStr = decoder.decode(bytes);

    if (ext === "pdf") {
      // Extract parenthesized text strings from PDF content streams if uncompressed
      const matches = [];
      const regex = /\(([^()\\]{3,200})\)/g;
      let match;
      while ((match = regex.exec(rawStr)) !== null) {
        const clean = match[1].replace(/[^\x20-\x7E\n]/g, " ").trim();
        if (clean.length > 2 && /[a-zA-Z]{2,}/.test(clean)) {
          matches.push(clean);
        }
      }
      if (matches.length > 8) {
        return matches.join(" ").replace(/\s+/g, " ").trim();
      }
    }

    // Extract XML text tags if uncompressed or readable text runs
    const xmlStripped = rawStr
      .replace(/<[^>]+>/g, " ")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Keep meaningful sentences with words
    const meaningfulChunks = xmlStripped
      .split(" ")
      .filter((w) => /^[a-zA-Z0-9.,;:'"?!()-]{2,30}$/.test(w));

    if (meaningfulChunks.length > 25) {
      return meaningfulChunks.join(" ").slice(0, 45000);
    }
    return "";
  } catch (_) {
    return "";
  }
}
