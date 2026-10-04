/**
 * EXAMIVO — Multi-Topic Live Academic Research & AI Examination Pipeline (ai.js)
 *
 * Key Capabilities:
 * 1. Multi-Topic Parsing: Supports single or multiple topics (comma, semicolon, newline, or "and" separated).
 * 2. Live Web Search & Academic Research: Searches and retrieves authoritative encyclopedic & curriculum
 *    extracts for every entered topic via CORS-enabled MediaWiki/Wikipedia APIs (`origin=*`), plus
 *    routes through `/api/ai/*` when the EXAMIVO Node/Firebase Cloud Functions backend is active.
 * 3. Research-Driven Question Construction: Builds real, content-specific examination questions
 *    (Definitions, Mechanism Cloze, Factual Verification, Exception Detection, and Quantitative Calculations)
 *    strictly from the researched topic facts and/or uploaded study material.
 */

import { QUESTION_TYPE_LABELS } from "./utils.js";

const API_BASE = "./api/ai";
let backendAvailabilityCache = null;

/**
 * Probe whether the active HTTP server is the EXAMIVO Node/Cloud Functions backend
 * Uses GET `./manifest.json` (which always returns 200 OK on every static or dynamic server)
 * and inspects `X-Examivo-Backend: active` so static servers (like VS Code Live Server)
 * never log a 405 Method Not Allowed error.
 */
async function isDynamicBackendActive() {
  if (backendAvailabilityCache !== null) {
    return backendAvailabilityCache;
  }
  try {
    const res = await fetch("./manifest.json", {
      method: "GET",
      cache: "no-store"
    });
    const headerVal = res.headers.get("x-examivo-backend");
    backendAvailabilityCache = headerVal === "active";
    return backendAvailabilityCache;
  } catch (_) {
    backendAvailabilityCache = false;
    return false;
  }
}

/**
 * Parse raw topic input into an array of distinct topics (supports 1 or many topics)
 */
export function parseTopicList(rawInput, fallbackSubject = "General") {
  const str = String(rawInput || "").trim();
  if (!str) return [fallbackSubject];

  const parts = str
    .split(/[,;\n•]+|\s+\band\b\s+|\s*&\s*/i)
    .map((t) => t.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((t) => t.length >= 2);

  return parts.length > 0 ? [...new Set(parts)] : [str];
}

/* ==========================================================================
   CURATED QUANTITATIVE & SYLLABUS PROBLEM BANK (Blended with Live Web Research)
   ========================================================================== */

const QUANTITATIVE_SYLLABUS_BANK = [
  {
    keywords: ["quadratic", "factorization", "completing the square", "discriminant", "parabola"],
    items: [
      {
        concept: "Factorization of Quadratic Equations",
        subtopic: "Roots by Factorization",
        q: (lvl) =>
          lvl.startsWith("Primary") || lvl === "JSS1"
            ? "If (x - 3)(x - 5) = 0, what are the values of x that satisfy the equation?"
            : "Solve the quadratic equation x² - 8x + 15 = 0 by factorization.",
        options: ["x = 3 or x = 5", "x = -3 or x = -5", "x = 3 or x = -5", "x = -3 or x = 5"],
        ans: 0,
        exp: "To factorize x² - 8x + 15 = 0, find two numbers whose product is +15 and sum is -8 (-3 and -5), giving (x - 3)(x - 5) = 0. Thus x = 3 or x = 5.",
        skill: "calculation"
      },
      {
        concept: "The Quadratic Formula & Discriminant",
        subtopic: "Nature of Roots (b² - 4ac)",
        q: () => "In the quadratic equation ax² + bx + c = 0 (a ≠ 0), what condition on the discriminant guarantees two distinct real roots?",
        options: ["b² - 4ac > 0", "b² - 4ac = 0", "b² - 4ac < 0", "b² + 4ac = 0"],
        ans: 0,
        exp: "When the discriminant Δ = b² - 4ac > 0, √(b² - 4ac) is a positive real number, producing two distinct real roots.",
        skill: "analysis"
      },
      {
        concept: "Sum and Product of Quadratic Roots",
        subtopic: "Symmetric Root Relations (α + β, αβ)",
        q: () => "If α and β are the roots of the quadratic equation 2x² - 7x + 6 = 0, find the sum (α + β) and product (αβ) of the roots.",
        options: ["α + β = 7/2, αβ = 3", "α + β = -7/2, αβ = 3", "α + β = 7, αβ = 6", "α + β = 3, αβ = 7/2"],
        ans: 0,
        exp: "For ax² + bx + c = 0, sum of roots α + β = -b/a = 7/2, and product of roots αβ = c/a = 6/2 = 3.",
        skill: "calculation"
      },
      {
        concept: "Completing the Square",
        subtopic: "Perfect Square Trinomial",
        q: () => "What constant term must be added to x² - 10x to make it a perfect square trinomial?",
        options: ["25", "10", "5", "100"],
        ans: 0,
        exp: "Add (b/2)² = (-10 / 2)² = (-5)² = 25 to obtain (x - 5)².",
        skill: "calculation"
      },
      {
        concept: "Quadratic Word Problems",
        subtopic: "Area Modeling",
        q: () => "The length of a rectangle is 3 cm greater than its width. If its area is 28 cm², find the width of the rectangle.",
        options: ["4 cm", "7 cm", "5 cm", "6 cm"],
        ans: 0,
        exp: "Let width = w; then w(w + 3) = 28 → w² + 3w - 28 = 0 → (w + 7)(w - 4) = 0. Since width > 0, w = 4 cm.",
        skill: "application"
      }
    ]
  },
  {
    keywords: ["simultaneous", "linear equation", "elimination", "substitution"],
    items: [
      {
        concept: "Simultaneous Linear Equations",
        subtopic: "Elimination & Substitution Methods",
        q: () => "Solve the simultaneous equations: 2x + y = 11 and x - y = 1.",
        options: ["x = 4, y = 3", "x = 3, y = 5", "x = 5, y = 1", "x = 2, y = 7"],
        ans: 0,
        exp: "Adding the two equations eliminates y: (2x + y) + (x - y) = 11 + 1 → 3x = 12 → x = 4. Substituting x = 4 into x - y = 1 gives 4 - y = 1 → y = 3.",
        skill: "calculation"
      }
    ]
  },
  {
    keywords: ["ohm", "resistor", "resistance", "electric circuit", "current electricity"],
    items: [
      {
        concept: "Ohm's Law & Electric Circuits",
        subtopic: "Potential Difference, Current & Resistance",
        q: () => "A resistor of resistance 12 Ω carries a steady electric current of 2.5 A. Calculate the potential difference across its terminals.",
        options: ["30 V", "4.8 V", "14.5 V", "60 V"],
        ans: 0,
        exp: "By Ohm's Law, V = I × R = 2.5 A × 12 Ω = 30 V.",
        skill: "calculation"
      },
      {
        concept: "Parallel & Series Resistors",
        subtopic: "Equivalent Resistance",
        q: () => "Two resistors of 6 Ω and 3 Ω are connected in parallel across a battery. What is their combined (equivalent) resistance?",
        options: ["2 Ω", "9 Ω", "4.5 Ω", "1.5 Ω"],
        ans: 0,
        exp: "For parallel resistors, R_eq = (R₁ × R₂) / (R₁ + R₂) = (6 × 3) / (6 + 3) = 18 / 9 = 2 Ω.",
        skill: "calculation"
      }
    ]
  },
  {
    keywords: ["stoichiometry", "mole concept", "molar mass", "avogadro"],
    items: [
      {
        concept: "Stoichiometry & The Mole Concept",
        subtopic: "Molar Mass Calculation",
        q: () => "Calculate the number of moles present in 22 g of carbon(IV) oxide, CO₂. [C = 12, O = 16]",
        options: ["0.50 mol", "1.00 mol", "0.25 mol", "2.00 mol"],
        ans: 0,
        exp: "Molar mass of CO₂ = 12 + (2 × 16) = 44 g/mol. Moles n = mass / molar mass = 22 / 44 = 0.50 mol.",
        skill: "calculation"
      }
    ]
  }
];

/* ==========================================================================
   LIVE WEB SEARCH & ENCYCLOPEDIC ACADEMIC RESEARCH ENGINE
   Queries Wikipedia's CORS-enabled API (`origin=*`) for all entered topics
   ========================================================================== */

const NON_ACADEMIC_REGEX =
  /may refer to:|soccer club|football club|basketball|baseball|hockey|rugby|athletic club|sports team|singer-songwriter|studio album|debut solo album|extended play|record label|music video|concert tour|television series|tv series|sitcom|reality television|film directed|motion picture|box office|novel by|short story by|video game|board game|card game|comic book|manga|anime|fictional character|superhero|peer-reviewed|scientific journal|academic journal/i;

function cleanResearchedText(raw) {
  let text = String(raw || "");
  // Remove nested parentheticals inside etymology / pronunciation blocks
  text = text.replace(/\((?:from |pronounced |listen|lit\.)[^()]*\([^()]*\)[^()]*\)/gi, "");
  for (let i = 0; i < 3; i++) {
    text = text.replace(
      /\s*\([^()]*?(?:listen|pronounced|from Latin|from Ancient Greek|from Greek|from French|from German|also called|US also|UK also|lit\.|pertaining to|\/[^/]+\/)[^()]*?\)/gi,
      ""
    );
  }
  return text
    .replace(/\(\s*[,;:\s]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoResearchedSentences(text, articleTitle) {
  const cleaned = cleanResearchedText(text);
  const rawSents = cleaned.split(/(?<=[.?!])\s+/);
  const out = [];
  for (let s of rawSents) {
    s = s.trim();
    if (s.length < 45 || s.length > 340) continue;
    if (/^(see also|references|further reading|external links|notes|bibliography)/i.test(s)) continue;
    if (NON_ACADEMIC_REGEX.test(s)) continue;
    s = s.replace(/^(It|This)\s+(is|was|occurs|involves|consists|refers|describes|states|produces)\b/i, `${articleTitle} $2`);
    out.push(s);
  }
  return out;
}

function extractDomainTermsFromSentences(sentences, excludeTitle = "") {
  const stopWords = new Set([
    "which", "their", "there", "where", "while", "these", "those", "other", "such", "about",
    "between", "through", "during", "before", "after", "under", "above", "below", "within",
    "without", "because", "however", "therefore", "although", "usually", "typically", "often",
    "called", "known", "process", "system", "state", "form", "forms", "types", "number", "first",
    "second", "third", "large", "small", "many", "some", "most", "more", "used", "using", "include",
    "includes", "including", "example", "examples", "general", "common", "important", "different",
    "builds", "pertaining", "building", "comprises", "accepted", "developed", "century", "decades",
    "object", "allows", "surface", "across", "entire", "cities", "enough", "cannot", "slowly",
    "moving", "years", "billion", "million", "special", "results", "resulting", "produce", "produces"
  ]);
  const excludeLower = (excludeTitle || "").toLowerCase();
  const terms = [];

  for (const s of sentences) {
    const words = s.replace(/[^a-zA-Z0-9\s-]/g, " ").split(/\s+/);
    for (const w of words) {
      const lw = w.toLowerCase();
      if (
        lw.length >= 6 &&
        lw.length <= 22 &&
        !stopWords.has(lw) &&
        !excludeLower.includes(lw) &&
        !lw.includes(excludeLower) &&
        !/^\d+$/.test(lw)
      ) {
        if (!terms.some((t) => t.toLowerCase() === lw)) {
          terms.push(w);
        }
      }
    }
  }
  return terms;
}

function maskConceptInText(text, title) {
  if (!title) return text;
  let masked = text;
  const fullEscaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  masked = masked.replace(
    new RegExp(`(?:\\b(?:a|an|the)\\s+)?\\b${fullEscaped}(?:es|s)?\\b`, "gi"),
    "this concept"
  );

  // If single-word title or plural/singular variant, mask the root word cleanly without double articles
  const words = title
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  if (words.length === 1) {
    const stem = words[0].replace(/(?:es|s)$/i, "");
    if (stem.length >= 4) {
      const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      masked = masked.replace(
        new RegExp(`(?:\\b(?:a|an|the)\\s+)?\\b${esc}(?:es|s|ic|al)?\\b`, "gi"),
        "this concept"
      );
    }
  }
  return masked;
}

function createCounterfactualStatement(sentence, currentTitle, siblingTitle) {
  const swaps = [
    [/\bhigh\b/gi, "low"],
    [/\blow\b/gi, "high"],
    [/\bhigher\b/gi, "lower"],
    [/\blower\b/gi, "higher"],
    [/\bincreases\b/gi, "decreases"],
    [/\bdecreases\b/gi, "increases"],
    [/\bincrease\b/gi, "decrease"],
    [/\bdecrease\b/gi, "increase"],
    [/\baerobic\b/gi, "anaerobic"],
    [/\banaerobic\b/gi, "aerobic"],
    [/\beukaryotic\b/gi, "prokaryotic viral"],
    [/\babsorbs\b/gi, "releases"],
    [/\breleases\b/gi, "absorbs"],
    [/\btwo\b/gi, "four"],
    [/\bfour\b/gi, "two"],
    [/\bidentical\b/gi, "non-identical haploid"],
    [/\bspontaneous\b/gi, "non-spontaneous energy-consuming"],
    [/\bdirectly proportional\b/gi, "inversely proportional"],
    [/\binversely proportional\b/gi, "directly proportional"],
    [/\bpositive\b/gi, "negative"],
    [/\bnegative\b/gi, "positive"],
    [/\binwards\b/gi, "outwards"],
    [/\boutwards\b/gi, "inwards"],
    [/\bendo[a-z]+\b/gi, "exothermic"],
    [/\bexo[a-z]+\b/gi, "endothermic"]
  ];

  for (const [pattern, replacement] of swaps) {
    if (pattern.test(sentence)) {
      return sentence.replace(pattern, replacement);
    }
  }

  if (siblingTitle && currentTitle && siblingTitle.toLowerCase() !== currentTitle.toLowerCase()) {
    const esc = currentTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reg = new RegExp(esc, "gi");
    if (reg.test(sentence)) {
      return sentence.replace(reg, siblingTitle);
    }
  }

  if (/\bis\b/i.test(sentence)) {
    return sentence.replace(/\bis\b/i, "is never");
  }
  if (/\boccurs\b/i.test(sentence)) {
    return sentence.replace(/\boccurs\b/i, "never occurs");
  }
  return `Unlike standard principles, ${sentence.charAt(0).toLowerCase() + sentence.slice(1)} only at absolute zero.`;
}

/**
 * Search and research multiple topics live via Wikipedia's CORS-enabled API
 */
async function researchTopicsLive(topicsList, subject) {
  const cleanTopics = topicsList.slice(0, 8);

  // 1. Run parallel search queries for each topic (primary topic + subject-scoped subtopics)
  const searchResults = await Promise.all(
    cleanTopics.map(async (topic) => {
      try {
        const isGoodHit = (h) =>
          !/^(list of|lists of|outline of|index of|glossary of|timeline of|\d{4}\s)/i.test(h.title) &&
          !/\(disambiguation\)/i.test(h.title) &&
          !NON_ACADEMIC_REGEX.test(h.snippet || "") &&
          !NON_ACADEMIC_REGEX.test(h.title || "");

        const searchUrl =
          "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
          encodeURIComponent(topic) +
          "&srlimit=5&utf8=1&format=json&origin=*";
        const res = await fetch(searchUrl);
        const data = res.ok ? await res.json() : {};
        const primaryHits = (data?.query?.search || []).filter(isGoodHit);

        let scopedHits = [];
        if (subject && subject.toLowerCase() !== "other") {
          const fbUrl =
            "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
            encodeURIComponent(`${topic} ${subject}`) +
            "&srlimit=5&utf8=1&format=json&origin=*";
          const fbRes = await fetch(fbUrl);
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            scopedHits = (fbData?.query?.search || []).filter(isGoodHit);
          }
        }

        // Combine primary #1 exact match with subject-scoped subtopics
        const combined = [...primaryHits.slice(0, 2), ...scopedHits, ...primaryHits.slice(2)];
        return { topic, hits: combined };
      } catch (_) {
        return { topic, hits: [] };
      }
    })
  );

  const titleToUserTopic = {};
  const primaryTitles = [];
  const secondaryTitles = [];

  for (const entry of searchResults) {
    entry.hits.forEach((hit, idx) => {
      const lower = hit.title.toLowerCase();
      if (!titleToUserTopic[lower]) {
        titleToUserTopic[lower] = entry.topic;
      }
      if (idx === 0) {
        if (!primaryTitles.includes(hit.title)) primaryTitles.push(hit.title);
      } else if (idx <= 3) {
        if (!primaryTitles.includes(hit.title) && !secondaryTitles.includes(hit.title)) {
          secondaryTitles.push(hit.title);
        }
      }
    });
  }

  const orderedTitles = [...primaryTitles, ...secondaryTitles];
  if (orderedTitles.length === 0) {
    cleanTopics.forEach((t) => {
      orderedTitles.push(t);
      titleToUserTopic[t.toLowerCase()] = t;
    });
  }

  // 2. Batch-fetch introductory extracts for up to 16 discovered titles in a single request
  const batchTitles = orderedTitles.slice(0, 16);
  const extractUrl =
    "https://en.wikipedia.org/w/api.php?action=query&redirects=1&prop=extracts&exintro=1&explaintext=1&titles=" +
    encodeURIComponent(batchTitles.join("|")) +
    "&format=json&origin=*";

  const extRes = await fetch(extractUrl);
  if (!extRes.ok) return [];
  const extData = await extRes.json();

  const redirectMap = {};
  const redirects = extData?.query?.redirects || [];
  redirects.forEach((r) => {
    redirectMap[(r.from || "").toLowerCase()] = r.to;
    const mapped = titleToUserTopic[(r.from || "").toLowerCase()];
    if (mapped && r.to) {
      titleToUserTopic[r.to.toLowerCase()] = mapped;
    }
  });

  const rawPagesMap = {};
  Object.values(extData?.query?.pages || {}).forEach((p) => {
    if (
      !p.missing &&
      (p.extract || "").length > 110 &&
      !NON_ACADEMIC_REGEX.test(p.extract) &&
      !NON_ACADEMIC_REGEX.test(p.title || "")
    ) {
      rawPagesMap[p.title.toLowerCase()] = p;
    }
  });

  // Preserve the exact priority order: primary user topic matches first, then secondary subtopics
  const orderedRawPages = [];
  const seenPageIds = new Set();
  for (const origTitle of batchTitles) {
    const resolvedTitle = redirectMap[origTitle.toLowerCase()] || origTitle;
    const p = rawPagesMap[resolvedTitle.toLowerCase()];
    if (p && !seenPageIds.has(p.pageid)) {
      seenPageIds.add(p.pageid);
      orderedRawPages.push(p);
    }
  }

  // If the student only entered 1 or 2 topics, also fetch the full multi-section extract of the top page
  if (cleanTopics.length <= 2 && orderedRawPages.length > 0 && orderedRawPages[0].pageid) {
    try {
      const fullUrl =
        "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=" +
        orderedRawPages[0].pageid +
        "&format=json&origin=*";
      const fullRes = await fetch(fullUrl);
      if (fullRes.ok) {
        const fullData = await fullRes.json();
        const fullText = fullData?.query?.pages?.[orderedRawPages[0].pageid]?.extract;
        if (fullText && fullText.length > orderedRawPages[0].extract.length) {
          orderedRawPages[0].extract = fullText.slice(0, 18000);
        }
      }
    } catch (_) {}
  }

  return orderedRawPages
    .map((p) => {
      const sentences = splitIntoResearchedSentences(p.extract, p.title);
      const keyTerms = extractDomainTermsFromSentences(sentences, p.title);
      return {
        title: p.title,
        userTopic: titleToUserTopic[p.title.toLowerCase()] || cleanTopics[0],
        sentences,
        keyTerms
      };
    })
    .filter((p) => p.sentences.length >= 2);
}

/**
 * Construct real, researched examination questions from the researched topic pages
 * and/or supplied study text
 */
async function buildResearchedExamBlueprint(requestBody) {
  const classLevel = String(requestBody.classLevel || "SS3");
  const subject = String(requestBody.subject || "Mathematics");
  const examType = String(requestBody.examType || "WAEC");
  const difficulty = String(requestBody.difficulty || "Exam Level");
  const questionCount = Math.min(30, Math.max(3, Number(requestBody.questionCount) || 10));
  const material = requestBody.material || { mode: "topic", content: subject };
  const rawContent = String(material.content || subject).trim();
  const mode = String(material.mode || "topic");

  if (mode === "image" && !rawContent) {
    throw new Error(
      "Please enter the topic(s) or a brief description of your image in the Image Context field so EXAMIVO can research and generate accurate questions."
    );
  }

  const userTopics = mode === "topic" ? parseTopicList(rawContent, subject) : [subject];
  const questions = [];

  // 1. If the user pasted text or uploaded a document, extract researched sentences directly from their text first
  let researchedPages = [];
  if (mode !== "topic" && rawContent.length > 80) {
    const docSentences = splitIntoResearchedSentences(rawContent, subject);
    const docTerms = extractDomainTermsFromSentences(docSentences, subject);
    if (docSentences.length >= 2) {
      researchedPages.push({
        title: material.fileName ? material.fileName.replace(/\.[^.]+$/, "") : subject,
        userTopic: subject,
        sentences: docSentences,
        keyTerms: docTerms
      });
    }
    // Also research top extracted terms on Wikipedia to enrich distractors and depth
    const topTermsToResearch = docTerms.slice(0, 3);
    if (topTermsToResearch.length > 0) {
      const extraPages = await researchTopicsLive(topTermsToResearch, subject);
      researchedPages.push(...extraPages);
    }
  } else {
    // Topic Mode: Research all entered topics live!
    researchedPages = await researchTopicsLive(userTopics, subject);
  }

  // 2. Check if any entered topic matches our Quantitative / Calculation Problem Bank
  const combinedQuery = `${subject} ${userTopics.join(" ")}`.toLowerCase();
  for (const group of QUANTITATIVE_SYLLABUS_BANK) {
    if (group.keywords.some((kw) => combinedQuery.includes(kw))) {
      group.items.forEach((item, idx) => {
        if (questions.length >= questionCount) return;
        const opts = [...item.options];
        const pos = idx % 4;
        [opts[0], opts[pos]] = [opts[pos], opts[0]];
        questions.push({
          question: item.q(classLevel),
          type: "multiple_choice",
          options: opts,
          correctAnswer: pos,
          explanation: item.exp,
          topic: item.concept,
          difficulty: difficulty.toLowerCase(),
          cognitiveSkill: item.skill,
          sourceConcept: item.subtopic,
          examRelevance: "high"
        });
      });
    }
  }

  if (researchedPages.length > 0) {
    const allTitles = [...new Set(researchedPages.map((p) => p.title))];
    const allDomainTerms = [...new Set(researchedPages.flatMap((p) => p.keyTerms))];

    const primaryCount = Math.max(1, userTopics.length);
    const primaryPages = researchedPages.slice(0, primaryCount);
    const secondaryPages = researchedPages.slice(primaryCount);

    const buildQuestionsFromPageGroup = (pageGroup) => {
      // 1. Concept & Definition Identification Questions
      pageGroup.forEach((page, idx) => {
        if (questions.length >= questionCount) return;
        const s0 = page.sentences[0];
        const defMatch = s0.match(/^.{2,95}?\b(?:is|are|refers to|describes|states that)\s+(.{28,280})$/i);
        if (defMatch) {
          const defBody = maskConceptInText(defMatch[1].replace(/[.]+$/, ""), page.title);
          const otherTitles = allTitles.filter((t) => t.toLowerCase() !== page.title.toLowerCase());
          const fallbackTerms = allDomainTerms.filter((t) => t.toLowerCase() !== page.title.toLowerCase());
          const distractorPool = [...otherTitles, ...fallbackTerms, `${subject} Equilibrium`, `Inverse ${page.userTopic}`];

          const opts = [
            page.title,
            distractorPool[idx % distractorPool.length],
            distractorPool[(idx + 1) % distractorPool.length],
            distractorPool[(idx + 2) % distractorPool.length]
          ];
          const pos = questions.length % 4;
          [opts[0], opts[pos]] = [opts[pos], opts[0]];

          questions.push({
            question: `In ${subject}, which concept or process is defined as ${defBody}?`,
            type: "multiple_choice",
            options: opts,
            correctAnswer: pos,
            explanation: `${s0} (Topic: ${page.userTopic})`,
            topic: page.userTopic,
            difficulty: difficulty.toLowerCase(),
            cognitiveSkill: "comprehension",
            sourceConcept: page.title,
            examRelevance: "high"
          });
        }
      });

      // 2. Factual Statement Verification
      pageGroup.forEach((page) => {
        if (questions.length >= questionCount) return;
        const trueSent = page.sentences[1] || page.sentences[0];
        if (!trueSent) return;

        const otherPages = researchedPages.filter((op) => op.title !== page.title);
        const sBase1 = page.sentences[2] || page.sentences[0];
        const sBase2 = otherPages[0]?.sentences?.[0] || page.sentences[0];
        const sBase3 = otherPages[1]?.sentences?.[0] || page.sentences[1] || page.sentences[0];

        const d1 = createCounterfactualStatement(sBase1, page.title, otherPages[0]?.title);
        const d2 = otherPages[0]
          ? createCounterfactualStatement(
              sBase2.replace(new RegExp(otherPages[0].title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), page.title),
              page.title
            )
          : createCounterfactualStatement(trueSent, page.title);
        const d3 = createCounterfactualStatement(sBase3, otherPages[1]?.title || page.title, page.title);

        const opts = [trueSent, d1, d2, d3];
        const pos = questions.length % 4;
        [opts[0], opts[pos]] = [opts[pos], opts[0]];

        questions.push({
          question: `Regarding ${page.title} (${page.userTopic}), which of the following statements is factually CORRECT?`,
          type: "multiple_choice",
          options: opts,
          correctAnswer: pos,
          explanation: `Verified fact for ${page.title}: "${trueSent}"`,
          topic: page.userTopic,
          difficulty: difficulty.toLowerCase(),
          cognitiveSkill: "application",
          sourceConcept: page.title,
          examRelevance: "high"
        });
      });

      // 3. Key Term / Mechanism Cloze Completion
      for (let sRound = 1; sRound <= 6; sRound++) {
        if (questions.length >= questionCount) break;
        for (let pIdx = 0; pIdx < pageGroup.length; pIdx++) {
          if (questions.length >= questionCount) break;
          const page = pageGroup[pIdx];
          const sent = page.sentences[sRound];
          if (!sent) continue;

          const matchingTerm = page.keyTerms.find((term) => {
            const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`\\b${esc}\\b`, "i").test(sent);
          });

          if (matchingTerm) {
            const esc = matchingTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const blankedSent = sent.replace(new RegExp(`\\b${esc}\\b`), "__________");
            const otherTerms = allDomainTerms.filter((t) => t.toLowerCase() !== matchingTerm.toLowerCase());
            if (otherTerms.length >= 3) {
              const offset = (pIdx + sRound * 3) % otherTerms.length;
              const opts = [
                matchingTerm,
                otherTerms[offset % otherTerms.length],
                otherTerms[(offset + 1) % otherTerms.length],
                otherTerms[(offset + 2) % otherTerms.length]
              ];
              const pos = questions.length % 4;
              [opts[0], opts[pos]] = [opts[pos], opts[0]];

              questions.push({
                question: `Complete the following statement on ${page.title} (${page.userTopic}):\n"${blankedSent}"`,
                type: "multiple_choice",
                options: opts,
                correctAnswer: pos,
                explanation: `Complete statement: "${sent}". The key term "${matchingTerm}" is central to understanding ${page.title}.`,
                topic: page.userTopic,
                difficulty: difficulty.toLowerCase(),
                cognitiveSkill: "comprehension",
                sourceConcept: page.title,
                examRelevance: "high"
              });
            }
          }
        }
      }

      // 4. Exception / Misconception Detection
      pageGroup.forEach((page) => {
        if (questions.length >= questionCount) return;
        if (page.sentences.length < 4) return;

        const t1 = page.sentences[0];
        const t2 = page.sentences[1];
        const t3 = page.sentences[2];
        const falseStatement = createCounterfactualStatement(page.sentences[3], page.title);

        const opts = [falseStatement, t1, t2, t3];
        const pos = questions.length % 4;
        [opts[0], opts[pos]] = [opts[pos], opts[0]];

        questions.push({
          question: `All of the following statements regarding ${page.title} (${page.userTopic}) are true EXCEPT:`,
          type: "multiple_choice",
          options: opts,
          correctAnswer: pos,
          explanation: `The statement "${falseStatement}" is NOT true. According to established principles of ${page.title}: "${page.sentences[3]}"`,
          topic: page.userTopic,
          difficulty: difficulty.toLowerCase(),
          cognitiveSkill: "analysis",
          sourceConcept: page.title,
          examRelevance: "high"
        });
      });
    };

    // First build diverse questions across all primary user topics, then secondary related subtopics
    buildQuestionsFromPageGroup(primaryPages);
    if (questions.length < questionCount && secondaryPages.length > 0) {
      buildQuestionsFromPageGroup(secondaryPages);
    }
  }

  // Prioritize Exam Focus concepts from the actual researched topics and subtopics
  const highPriority = userTopics.slice(0, 4).map((t) => {
    const subPages = researchedPages.filter((p) => p.userTopic.toLowerCase() === t.toLowerCase());
    const subNames = subPages.map((p) => p.title).slice(0, 3).join(", ");
    return {
      concept: t,
      reason: subNames
        ? `Researched core concepts: ${subNames} (${examType} ${classLevel} focus).`
        : `High-priority ${examType} concept for ${classLevel} ${subject}.`
    };
  });

  const secondaryTitles = researchedPages
    .map((p) => p.title)
    .filter((title) => !userTopics.some((ut) => ut.toLowerCase() === title.toLowerCase()))
    .slice(0, 4);

  const alsoRevise = secondaryTitles.map((st) => ({
    concept: st,
    reason: `Closely linked subtopic identified while researching your ${subject} topics.`
  }));

  return {
    title: `${subject}: ${userTopics.join(", ")} (${examType})`,
    materialSummary: `Researched ${researchedPages.length} authoritative topic articles covering ${userTopics.join(", ")} for ${classLevel} ${subject} (${examType}).`,
    examFocus: {
      highPriority,
      alsoRevise,
      rationale: "Prioritized based on the selected examination format and live academic research of your supplied topics."
    },
    questions: questions.slice(0, questionCount)
  };
}

/**
 * Build a researched "Study My Mistakes" guide for all missed topics
 */
async function buildResearchedStudyGuide(studyRequest) {
  const classLevel = String(studyRequest.classLevel || "SS3");
  const subject = String(studyRequest.subject || "Mathematics");
  const examType = String(studyRequest.examType || "WAEC");
  const topicsCovered = Array.isArray(studyRequest.topicsCovered) && studyRequest.topicsCovered.length > 0
    ? studyRequest.topicsCovered
    : [subject];
  const missedItems = Array.isArray(studyRequest.missedItems) ? studyRequest.missedItems : [];

  const researchedPages = await researchTopicsLive(topicsCovered, subject);

  const modules = topicsCovered.slice(0, 5).map((topic, idx) => {
    const matchedPage =
      researchedPages.find((p) => p.userTopic.toLowerCase() === topic.toLowerCase()) ||
      researchedPages[idx] ||
      null;
    const relatedMissed = missedItems.find((m) => m.topic === topic) || missedItems[idx] || null;

    const researchedSummary = matchedPage
      ? matchedPage.sentences.slice(0, 3).join(" ")
      : "";

    const revisionNotes = [
      researchedSummary,
      relatedMissed
        ? `\n\nMistake Diagnostic: On the question "${relatedMissed.question}", the verified answer is "${relatedMissed.correctAnswer}". ${relatedMissed.explanation || ""}`
        : ""
    ]
      .filter(Boolean)
      .join("");

    const importantConcepts = matchedPage && matchedPage.sentences.length >= 3
      ? matchedPage.sentences.slice(0, 4)
      : [
          `Core Definition: Review the exact ${classLevel} definition and governing conditions of ${topic}.`,
          relatedMissed
            ? `Key Correction: ${relatedMissed.explanation || relatedMissed.correctAnswer}`
            : `Ensure all variables and units in ${topic} match the ${examType} standard.`
        ];

    return {
      topic,
      revisionNotes: revisionNotes || `Review the core definitions and mechanisms of ${topic} for ${classLevel} ${subject}.`,
      importantConcepts,
      workedExample: relatedMissed
        ? `Exam Question: ${relatedMissed.question}\n\nYour Previous Answer: ${relatedMissed.userAnswer}\nCorrect Answer: ${relatedMissed.correctAnswer}\n\nStep-by-Step Breakdown:\n${relatedMissed.explanation}`
        : matchedPage
        ? `Concept Application (${matchedPage.title}):\n${matchedPage.sentences.slice(0, 2).join("\n\n")}`
        : `Apply the governing principle of ${topic} step by step.`,
      practiceQuestion: {
        question: relatedMissed
          ? `Retest Check (${topic}): ${relatedMissed.question}`
          : matchedPage
          ? `What is the defining characteristic of ${matchedPage.title}?`
          : `State the primary principle of ${topic}.`,
        answer: relatedMissed
          ? relatedMissed.correctAnswer
          : matchedPage
          ? matchedPage.sentences[0]
          : topic,
        explanation: relatedMissed
          ? relatedMissed.explanation
          : matchedPage
          ? matchedPage.sentences.slice(0, 2).join(" ")
          : ""
      }
    };
  });

  const retestBlueprint = await buildResearchedExamBlueprint({
    classLevel,
    subject,
    examType,
    difficulty: "Exam Level",
    questionCount: Math.max(5, topicsCovered.length * 2),
    material: {
      mode: "topic",
      content: topicsCovered.join(", ")
    }
  });

  return {
    modules,
    retestQuestions: retestBlueprint.questions
  };
}

/* ==========================================================================
   VALIDATION FUNCTIONS (Section 44)
   ========================================================================== */

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
    if (options.length >= 2) {
      if (typeof correctAnswer === "string") {
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
    const pairs = Array.isArray(raw.pairs) ? raw.pairs : [];
    if (pairs.length >= 2) {
      options = pairs.map((p) => ({
        left: String(p.left || p.term || "").trim(),
        right: String(p.right || p.match || "").trim()
      }));
      correctAnswer = options.map((p) => p.right);
    }
  } else {
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

  return {
    title: String(payload.title || `${config.subject || "Subject"} — ${config.examType || "Exam"} Practice`),
    materialSummary: String(payload.materialSummary || ""),
    examFocus: {
      highPriority,
      alsoRevise,
      rationale: String(
        rawFocus.rationale ||
          "Prioritized based on the selected examination format and your supplied material."
      )
    },
    questions: validatedQuestions
  };
}

/* ==========================================================================
   PIPELINE ORCHESTRATORS
   ========================================================================== */

export async function runExamGenerationPipeline(setupConfig, onStageChange = null) {
  if (!navigator.onLine) {
    throw new Error("An internet connection is required for EXAMIVO AI to research your topics and generate questions.");
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

  const stageTimer = setInterval(() => {
    if (currentStageIdx < stageSequence.length - 1) {
      currentStageIdx += 1;
      const st = stageSequence[currentStageIdx];
      if (typeof onStageChange === "function") {
        onStageChange(st.index, st.aiState);
      }
    }
  }, 620);

  try {
    let rawData = null;
    const hasBackend = await isDynamicBackendActive();

    if (hasBackend) {
      try {
        const response = await fetch(`${API_BASE}/pipeline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(setupConfig)
        });
        if (response.ok) {
          rawData = await response.json();
        } else if (response.status === 422) {
          const errData = await response.json();
          throw new Error(errData.userMessage || "Please check your supplied material.");
        } else if (response.status === 405 || response.status === 404) {
          backendAvailabilityCache = false;
        }
      } catch (fetchErr) {
        if (fetchErr.message && fetchErr.message.includes("Image Context")) {
          throw fetchErr;
        }
      }
    }

    if (!rawData) {
      rawData = await buildResearchedExamBlueprint(setupConfig);
      while (currentStageIdx < 4) {
        await new Promise((r) => setTimeout(r, 320));
        currentStageIdx += 1;
        const st = stageSequence[currentStageIdx];
        if (typeof onStageChange === "function" && st) {
          onStageChange(st.index, st.aiState);
        }
      }
    }

    clearInterval(stageTimer);

    if (typeof onStageChange === "function") {
      onStageChange(5, "checking");
    }

    const validated = validatePipelineResponse(rawData, setupConfig);
    await new Promise((r) => setTimeout(r, 420));
    return validated;
  } catch (err) {
    clearInterval(stageTimer);
    throw new Error(
      err.message || "EXAMIVO couldn't complete that request. Please verify your material and try again."
    );
  }
}

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
  }, 550);

  try {
    let rawData = null;
    const hasBackend = await isDynamicBackendActive();

    if (hasBackend) {
      try {
        const response = await fetch(`${API_BASE}/weak-practice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(weakPracticeRequest)
        });
        if (response.ok) {
          rawData = await response.json();
        }
      } catch (_) {}
    }

    if (!rawData) {
      rawData = await buildResearchedExamBlueprint({
        classLevel: weakPracticeRequest.classLevel,
        subject: weakPracticeRequest.subject,
        examType: weakPracticeRequest.examType,
        difficulty: weakPracticeRequest.difficulty || "Medium",
        questionCount: weakPracticeRequest.questionCount || 6,
        material: {
          mode: "topic",
          content: (weakPracticeRequest.weakTopics || [weakPracticeRequest.subject]).join(", ")
        }
      });
    }

    clearInterval(timer);
    if (typeof onStageChange === "function") {
      onStageChange(3, "checking");
    }

    const validated = validatePipelineResponse(rawData, weakPracticeRequest);
    await new Promise((r) => setTimeout(r, 400));
    return validated;
  } catch (err) {
    clearInterval(timer);
    throw new Error(err.message || "EXAMIVO couldn't build your targeted practice right now.");
  }
}

export async function evaluateOpenResponsesViaAI(evaluationPayload) {
  if (!navigator.onLine) return null;
  try {
    const hasBackend = await isDynamicBackendActive();
    if (!hasBackend) return null;

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

export async function generateStudyMistakesGuide(studyRequest) {
  if (!navigator.onLine) {
    throw new Error("An internet connection is required to generate your personalized study notes.");
  }

  let data = null;
  const hasBackend = await isDynamicBackendActive();

  if (hasBackend) {
    try {
      const response = await fetch(`${API_BASE}/study`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studyRequest)
      });
      if (response.ok) {
        data = await response.json();
      }
    } catch (_) {}
  }

  if (!data || !Array.isArray(data.modules) || data.modules.length === 0) {
    data = await buildResearchedStudyGuide(studyRequest);
  }

  return data;
}
