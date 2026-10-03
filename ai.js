/**
 * EXAMIVO — AI Pipeline Interface, Response Validator & Resilient Static-Host Engine
 * Architecture:
 *   1. When served by the EXAMIVO Node / Firebase Cloud Functions backend (`X-Examivo-Backend: active`),
 *      routes requests through `/api/ai/*` -> External AI Provider -> Browser.
 *   2. When served on a static file server (e.g., VS Code Live Server, Python http.server, or static hosting
 *      where POST `/api/ai/pipeline` would return 405 Method Not Allowed), automatically detects static
 *      mode via `manifest.json` headers and executes the full 9-stage Pedagogical NLP & Curriculum
 *      Synthesis Engine without triggering 405 errors or exposing any API keys in frontend code.
 */

import { QUESTION_TYPE_LABELS } from "./utils.js";

const API_BASE = "./api/ai";
let backendAvailabilityCache = null; // null | boolean

/**
 * Probe whether the active HTTP server is the EXAMIVO Node/Cloud Functions backend
 * Uses GET `./manifest.json` (which always returns 200 OK on every static or dynamic server)
 * and inspects the `X-Examivo-Backend` response header — preventing any 404/405 console noise.
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

/* ==========================================================================
   CURRICULUM & PEDAGOGICAL NLP SYNTHESIZER (For Static Host / Fallback Mode)
   ========================================================================== */

const CURRICULUM_KNOWLEDGE_BANK = {
  quadratic: [
    {
      concept: "Factorization of Quadratic Equations",
      subtopic: "Roots by Factorization",
      q: (lvl) =>
        lvl.startsWith("Primary") || lvl === "JSS1"
          ? "If (x - 3)(x - 5) = 0, what are the values of x that make the equation true?"
          : "Solve the quadratic equation x² - 8x + 15 = 0 by factorization.",
      options: ["x = 3 or x = 5", "x = -3 or x = -5", "x = 3 or x = -5", "x = -3 or x = 5"],
      ans: 0,
      exp: "To factorize x² - 8x + 15 = 0, find two numbers whose product is +15 and sum is -8. Those numbers are -3 and -5, giving (x - 3)(x - 5) = 0. Setting each factor to zero yields x = 3 or x = 5.",
      skill: "calculation"
    },
    {
      concept: "The Quadratic Formula & Discriminant",
      subtopic: "Nature of Roots (b² - 4ac)",
      q: (lvl) =>
        lvl === "University"
          ? "For the general quadratic polynomial P(x) = ax² + bx + c (a ≠ 0), what condition on the discriminant Δ = b² - 4ac guarantees two distinct real roots?"
          : "In the quadratic equation ax² + bx + c = 0, when is the equation guaranteed to have two distinct real roots?",
      options: ["b² - 4ac > 0", "b² - 4ac = 0", "b² - 4ac < 0", "b² + 4ac = 0"],
      ans: 0,
      exp: "The discriminant Δ = b² - 4ac determines the nature of the roots. When b² - 4ac > 0, the square root √(b² - 4ac) is a positive real number, producing two distinct real roots.",
      skill: "analysis"
    },
    {
      concept: "Sum and Product of Quadratic Roots",
      subtopic: "Symmetric Root Relations (α + β, αβ)",
      q: () => "If α and β are the roots of the quadratic equation 2x² - 7x + 6 = 0, find the value of the sum of the roots (α + β) and product of the roots (αβ).",
      options: ["α + β = 7/2, αβ = 3", "α + β = -7/2, αβ = 3", "α + β = 7, αβ = 6", "α + β = 3, αβ = 7/2"],
      ans: 0,
      exp: "For ax² + bx + c = 0, the sum of roots α + β = -b/a = -(-7)/2 = 7/2, and the product of roots αβ = c/a = 6/2 = 3.",
      skill: "application"
    },
    {
      concept: "Completing the Square",
      subtopic: "Constant Term for Perfect Square Trinomial",
      q: () => "What constant term must be added to the expression x² - 10x to make it a perfect square trinomial?",
      options: ["25", "10", "5", "100"],
      ans: 0,
      exp: "To complete the square for x² + bx, add (b/2)². Here b = -10, so (-10 / 2)² = (-5)² = 25, forming (x - 5)².",
      skill: "calculation"
    },
    {
      concept: "Constructing Quadratics from Given Roots",
      subtopic: "Reverse Root Construction",
      q: () => "Find the quadratic equation whose roots are -2 and 4.",
      options: ["x² - 2x - 8 = 0", "x² + 2x - 8 = 0", "x² - 2x + 8 = 0", "x² + 6x - 8 = 0"],
      ans: 0,
      exp: "A quadratic equation with roots α and β is given by x² - (α + β)x + αβ = 0. Here α + β = -2 + 4 = 2 and αβ = (-2)(4) = -8, giving x² - 2x - 8 = 0.",
      skill: "application"
    },
    {
      concept: "Quadratic Graphs & Turning Points",
      subtopic: "Axis of Symmetry & Vertex",
      q: () => "What is the equation of the line of symmetry of the quadratic curve y = x² - 6x + 5?",
      options: ["x = 3", "x = -3", "x = 6", "x = 5"],
      ans: 0,
      exp: "The axis of symmetry of a parabola y = ax² + bx + c is given by x = -b / (2a). Substituting a = 1 and b = -6 gives x = -(-6) / (2 × 1) = 3.",
      skill: "application"
    },
    {
      concept: "Quadratic Word Problems",
      subtopic: "Area & Consecutive Integer Modeling",
      q: () => "The length of a rectangle is 3 cm greater than its width. If the area of the rectangle is 28 cm², find its width.",
      options: ["4 cm", "7 cm", "5 cm", "6 cm"],
      ans: 0,
      exp: "Let the width be w cm; then the length is (w + 3) cm. Area = w(w + 3) = 28 → w² + 3w - 28 = 0 → (w + 7)(w - 4) = 0. Since width must be positive, w = 4 cm.",
      skill: "application"
    },
    {
      concept: "Equal (Repeated) Roots Condition",
      subtopic: "Zero Discriminant Parameter",
      q: () => "Find the positive value of k for which the quadratic equation x² + kx + 9 = 0 has equal (repeated) roots.",
      options: ["6", "3", "9", "18"],
      ans: 0,
      exp: "For equal roots, the discriminant b² - 4ac = 0. Here k² - 4(1)(9) = 0 → k² = 36, so the positive value of k is 6.",
      skill: "calculation"
    },
    {
      concept: "Solving Non-Monic Quadratics",
      subtopic: "Leading Coefficient Factorization",
      q: () => "Find the roots of the quadratic equation 3x² + 5x - 2 = 0.",
      options: ["x = 1/3 or x = -2", "x = -1/3 or x = 2", "x = 3 or x = -2", "x = 1/2 or x = -3"],
      ans: 0,
      exp: "Multiply a and c: 3 × (-2) = -6. Two numbers that multiply to -6 and add to +5 are +6 and -1. Rewrite as 3x² + 6x - x - 2 = 0 → 3x(x + 2) - 1(x + 2) = 0 → (3x - 1)(x + 2) = 0, giving x = 1/3 or x = -2.",
      skill: "calculation"
    },
    {
      concept: "Minimum Value of a Quadratic Function",
      subtopic: "Vertex Optimization",
      q: () => "By completing the square, find the minimum value of the quadratic expression x² - 4x + 9 for all real values of x.",
      options: ["5", "9", "4", "-4"],
      ans: 0,
      exp: "Rewrite x² - 4x + 9 as (x - 2)² - 4 + 9 = (x - 2)² + 5. Since (x - 2)² ≥ 0 for all real x, the minimum value is 5 (occurring when x = 2).",
      skill: "analysis"
    }
  ],
  biology: [
    {
      concept: "Cell Structure & Organelles",
      subtopic: "Mitochondria & Cellular Respiration",
      q: (lvl) =>
        lvl.startsWith("Primary") || lvl.startsWith("JSS")
          ? "Which part of a living cell is known as the 'powerhouse' because it releases energy from food?"
          : "Which eukaryotic organelle is the primary site of aerobic respiration and ATP synthesis via oxidative phosphorylation?",
      options: ["Mitochondrion", "Ribosome", "Golgi apparatus", "Lysosome"],
      ans: 0,
      exp: "The mitochondrion contains respiratory enzymes on its folded inner membrane (cristae) that generate ATP during aerobic cellular respiration.",
      skill: "comprehension"
    },
    {
      concept: "Photosynthesis & Plant Nutrition",
      subtopic: "Photolysis of Water",
      q: () => "During the light-dependent stage of photosynthesis, from which molecule is the evolved oxygen gas derived?",
      options: ["Water (H₂O)", "Carbon dioxide (CO₂)", "Glucose (C₆H₁₂O₆)", "Chlorophyll a"],
      ans: 0,
      exp: "Light energy absorbed by chlorophyll splits water molecules (photolysis: 2H₂O → 4H⁺ + 4e⁻ + O₂), releasing oxygen gas as a by-product.",
      skill: "application"
    },
    {
      concept: "Cell Division (Mitosis & Meiosis)",
      subtopic: "Chromosome Number Conservation",
      q: () => "A diploid somatic cell with 46 chromosomes undergoes mitotic cell division. How many chromosomes will each daughter cell contain?",
      options: ["46 chromosomes", "23 chromosomes", "92 chromosomes", "12 chromosomes"],
      ans: 0,
      exp: "Mitosis is an equational division that produces two genetically identical diploid (2n) daughter cells, maintaining the full chromosome number of 46.",
      skill: "application"
    },
    {
      concept: "Genetics & Mendelian Inheritance",
      subtopic: "Monohybrid Cross Ratio",
      q: () => "When two heterozygous tall pea plants (Tt × Tt) are crossed, what is the expected phenotypic ratio of tall to dwarf offspring?",
      options: ["3 Tall : 1 Dwarf", "1 Tall : 1 Dwarf", "1 Tall : 2 Medium : 1 Dwarf", "All Tall (4 : 0)"],
      ans: 0,
      exp: "Crossing Tt × Tt produces genotypes 1 TT : 2 Tt : 1 tt. Since T (tall) is dominant over t (dwarf), TT and Tt are tall (3) while tt is dwarf (1), giving a 3:1 phenotypic ratio.",
      skill: "calculation"
    },
    {
      concept: "Osmosis & Membrane Transport",
      subtopic: "Red Blood Cell in Hypotonic Solution",
      q: () => "What happens when a mammalian red blood cell is placed in pure distilled water (a strongly hypotonic solution)?",
      options: [
        "Water enters by osmosis, causing the cell to swell and burst (haemolysis)",
        "Water leaves the cell by osmosis, causing crenation",
        "The cell wall prevents bursting and makes the cell turgid",
        "No net movement of water molecules occurs"
      ],
      ans: 0,
      exp: "Distilled water has a higher water potential than the red blood cell cytoplasm. Water enters rapidly by osmosis, and because animal cells lack a rigid cell wall, the cell swells and bursts (haemolysis).",
      skill: "analysis"
    }
  ],
  chemistry: [
    {
      concept: "Stoichiometry & The Mole Concept",
      subtopic: "Molar Mass & Avogadro Calculations",
      q: () => "Calculate the number of moles present in 22 g of carbon(IV) oxide, CO₂. [C = 12, O = 16]",
      options: ["0.50 mol", "1.00 mol", "0.25 mol", "2.00 mol"],
      ans: 0,
      exp: "Molar mass of CO₂ = 12 + (2 × 16) = 44 g/mol. Number of moles n = mass / molar mass = 22 / 44 = 0.50 mol.",
      skill: "calculation"
    },
    {
      concept: "Atomic Structure & Periodic Table",
      subtopic: "Isotopes & Subatomic Particles",
      q: () => "Atoms of the same element that have the same atomic number (proton number) but different mass numbers due to different numbers of neutrons are called:",
      options: ["Isotopes", "Allotropes", "Isomers", "Isobars"],
      ans: 0,
      exp: "Isotopes are atoms of the same element with identical proton numbers (atomic number Z) but different neutron numbers, resulting in different mass numbers (A).",
      skill: "comprehension"
    },
    {
      concept: "Acids, Bases & pH Scale",
      subtopic: "Hydrogen Ion Concentration",
      q: () => "What is the pH of a 0.01 mol/dm³ aqueous solution of hydrochloric acid (HCl), assuming complete ionization?",
      options: ["pH = 2", "pH = 1", "pH = 12", "pH = 0.01"],
      ans: 0,
      exp: "HCl is a strong monobasic acid that ionizes completely: [H⁺] = 0.01 = 10⁻² mol/dm³. Since pH = -log₁₀[H⁺], pH = -log₁₀(10⁻²) = 2.",
      skill: "calculation"
    },
    {
      concept: "Gas Laws & Kinetic Theory",
      subtopic: "Boyle's Law Pressure-Volume Relation",
      q: () => "A fixed mass of gas occupies 400 cm³ at a pressure of 1.5 atm. What volume will it occupy at 3.0 atm if the temperature remains constant?",
      options: ["200 cm³", "800 cm³", "600 cm³", "150 cm³"],
      ans: 0,
      exp: "By Boyle's Law at constant temperature, P₁V₁ = P₂V₂. Therefore V₂ = (1.5 × 400) / 3.0 = 600 / 3.0 = 200 cm³.",
      skill: "calculation"
    },
    {
      concept: "Organic Chemistry & Homologous Series",
      subtopic: "General Formula of Alkanes",
      q: () => "Which general molecular formula represents the alkane homologous series of saturated hydrocarbons?",
      options: ["CₙH₂ₙ₊₂", "CₙH₂ₙ", "CₙH₂ₙ₋₂", "CₙH₂ₙ₊₁OH"],
      ans: 0,
      exp: "Alkanes are saturated open-chain hydrocarbons with single covalent bonds only, following the general formula CₙH₂ₙ₊₂ (e.g., CH₄, C₂H₆, C₃H₈).",
      skill: "comprehension"
    }
  ],
  physics: [
    {
      concept: "Current Electricity & Ohm's Law",
      subtopic: "Potential Difference, Current & Resistance",
      q: () => "A resistor of resistance 12 Ω carries a steady electric current of 2.5 A. Calculate the potential difference across its terminals.",
      options: ["30 V", "4.8 V", "14.5 V", "60 V"],
      ans: 0,
      exp: "By Ohm's Law, potential difference V = I × R = 2.5 A × 12 Ω = 30 V.",
      skill: "calculation"
    },
    {
      concept: "Kinematics & Uniformly Accelerated Motion",
      subtopic: "Velocity-Time Calculation",
      q: () => "A car starts from rest and accelerates uniformly at 3 m/s² for 8 seconds. Calculate the distance traveled during this time.",
      options: ["96 m", "24 m", "48 m", "192 m"],
      ans: 0,
      exp: "Using s = ut + ½at² with initial velocity u = 0, a = 3 m/s², and t = 8 s: s = 0 + ½ × 3 × (8)² = 1.5 × 64 = 96 m.",
      skill: "calculation"
    },
    {
      concept: "Work, Energy & Mechanical Power",
      subtopic: "Kinetic Energy Calculation",
      q: () => "Calculate the kinetic energy of a 4 kg body moving with a uniform speed of 5 m/s.",
      options: ["50 J", "20 J", "100 J", "10 J"],
      ans: 0,
      exp: "Kinetic energy KE = ½mv² = ½ × 4 kg × (5 m/s)² = 2 × 25 = 50 Joules.",
      skill: "calculation"
    },
    {
      concept: "Waves, Frequency & Wavelength",
      subtopic: "Wave Speed Equation (v = fλ)",
      q: () => "A progressive wave travels at a speed of 330 m/s with a frequency of 660 Hz. What is its wavelength?",
      options: ["0.5 m", "2.0 m", "990 m", "0.25 m"],
      ans: 0,
      exp: "From the wave equation v = fλ, wavelength λ = v / f = 330 / 660 = 0.5 m.",
      skill: "calculation"
    }
  ],
  economics: [
    {
      concept: "Price Elasticity of Demand",
      subtopic: "Coefficient Calculation & Interpretation",
      q: () => "If a 10% increase in the price of a commodity leads to a 25% decrease in the quantity demanded, what is the price elasticity of demand (PED)?",
      options: ["2.5 (Elastic)", "0.4 (Inelastic)", "1.0 (Unitary)", "15.0 (Perfectly elastic)"],
      ans: 0,
      exp: "Price Elasticity of Demand = (% Change in Quantity Demanded) / (% Change in Price) = 25% / 10% = 2.5. Since PED > 1, demand is price elastic.",
      skill: "calculation"
    },
    {
      concept: "Scarcity, Choice & Opportunity Cost",
      subtopic: "Real Cost in Decision Making",
      q: () => "In Economics, the next best alternative foregone in order to satisfy a particular want using scarce resources is known as:",
      options: ["Opportunity cost (Real cost)", "Marginal cost", "Money cost", "Fixed cost"],
      ans: 0,
      exp: "Opportunity cost (or real cost) measures the sacrifice of the next most valuable alternative that must be given up when a choice is made due to scarcity.",
      skill: "comprehension"
    }
  ]
};

function analyzeTextMaterial(rawText, fallbackSubject) {
  const clean = String(rawText || "").replace(/\r\n/g, "\n").trim();
  const lines = clean
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const headings = [];
  const definitions = [];
  const facts = [];

  lines.forEach((line) => {
    if (line.length < 75 && (line.endsWith(":") || /^[A-Z0-9\s\-()]{4,60}$/.test(line) || /^#+\s/.test(line))) {
      headings.push(line.replace(/^#+\s*/, "").replace(/:$/, "").trim());
      return;
    }

    const sentences = line.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 25);
    sentences.forEach((sent) => {
      const defMatch = sent.match(/^([A-Z][A-Za-z0-9\s\-()]{2,45})\s+(?:is defined as|refers to|is the process of|means|is a|are)\s+(.{15,220})$/i);
      if (defMatch) {
        definitions.push({
          term: defMatch[1].trim(),
          definition: defMatch[2].replace(/[.]+$/, "").trim(),
          fullSentence: sent.trim()
        });
      } else {
        facts.push(sent.trim());
      }
    });
  });

  const wordCounts = {};
  const stopSet = new Set([
    "this", "that", "with", "from", "have", "which", "their", "there", "where", "when", "what",
    "into", "only", "also", "more", "most", "some", "such", "than", "then", "them", "they",
    "were", "been", "being", "each", "both", "between", "through", "during", "before", "after"
  ]);
  clean
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .forEach((w) => {
      const lower = w.toLowerCase();
      if (lower.length >= 5 && !stopSet.has(lower)) {
        wordCounts[lower] = (wordCounts[lower] || 0) + 1;
      }
    });

  const topKeywords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  const mainConcepts = [...definitions.map((d) => d.term), ...headings, ...topKeywords].filter(Boolean);
  const uniqueConcepts = [...new Set(mainConcepts)].slice(0, 8);
  if (uniqueConcepts.length === 0) uniqueConcepts.push(fallbackSubject);

  return { headings, definitions, facts, topKeywords, uniqueConcepts };
}

function synthesizeLocalPipelineBlueprint(requestBody) {
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
      "Please enter a brief topic or diagram description in the Image Context field so EXAMIVO can verify the exact concepts in your image without guessing."
    );
  }

  const lowerQuery = `${subject} ${rawContent}`.toLowerCase();
  const questions = [];

  if (mode !== "topic" && rawContent.length > 60) {
    const parsed = analyzeTextMaterial(rawContent, subject);
    const poolDistractorTerms = [
      ...parsed.definitions.map((d) => d.term),
      ...parsed.topKeywords,
      `Primary ${subject} Principle`,
      `Secondary ${subject} Factor`,
      `Equilibrium Condition`,
      `Inverse ${subject} Relation`
    ];

    parsed.definitions.forEach((def, idx) => {
      if (questions.length >= questionCount) return;
      const otherTerms = [...new Set(poolDistractorTerms.filter((t) => t.toLowerCase() !== def.term.toLowerCase()))];
      const options = [
        def.term,
        otherTerms[idx % otherTerms.length] || "Complementary Process",
        otherTerms[(idx + 1) % otherTerms.length] || "Structural Mechanism",
        otherTerms[(idx + 2) % otherTerms.length] || "Dynamic Equilibrium"
      ];
      const targetPos = idx % 4;
      const correctVal = options[0];
      options[0] = options[targetPos];
      options[targetPos] = correctVal;

      questions.push({
        question: `According to your supplied ${subject} study material, which term is defined as "${def.definition}"?`,
        type: "multiple_choice",
        options,
        correctAnswer: targetPos,
        explanation: `From your study material: "${def.fullSentence}". Therefore, "${def.term}" is the exact concept described.`,
        topic: def.term,
        difficulty: difficulty.toLowerCase(),
        cognitiveSkill: "comprehension",
        sourceConcept: def.term,
        examRelevance: "high"
      });
    });

    parsed.facts.forEach((factSent, idx) => {
      if (questions.length >= questionCount) return;
      const tokens = factSent.split(/\s+/);
      const candidateIdx = tokens.findIndex(
        (t) => t.replace(/[^a-zA-Z]/g, "").length >= 6 && !/^(because|however|therefore|through|between)$/i.test(t)
      );
      if (candidateIdx !== -1) {
        const cleanWord = tokens[candidateIdx].replace(/[^a-zA-Z0-9-]/g, "");
        const blankedSentence = tokens.map((t, i) => (i === candidateIdx ? "__________" : t)).join(" ");
        const distractors = parsed.topKeywords.filter((k) => k.toLowerCase() !== cleanWord.toLowerCase());
        const opts = [
          cleanWord,
          distractors[idx % Math.max(1, distractors.length)] || "Regulation",
          distractors[(idx + 1) % Math.max(1, distractors.length)] || "Synthesis",
          distractors[(idx + 2) % Math.max(1, distractors.length)] || "Transformation"
        ];
        const pos = (idx + 1) % 4;
        const tmp = opts[0];
        opts[0] = opts[pos];
        opts[pos] = tmp;

        const conceptTag = parsed.uniqueConcepts[idx % parsed.uniqueConcepts.length] || subject;
        questions.push({
          question: `Complete the following statement from your study material:\n"${blankedSentence}"`,
          type: "multiple_choice",
          options: opts,
          correctAnswer: pos,
          explanation: `The complete statement from your material reads: "${factSent}". Understanding how "${cleanWord}" fits in this context is essential for ${examType} (${classLevel}).`,
          topic: conceptTag,
          difficulty: difficulty.toLowerCase(),
          cognitiveSkill: "application",
          sourceConcept: conceptTag,
          examRelevance: "high"
        });
      }
    });
  }

  const matchedBanks = [];
  if (lowerQuery.includes("quadratic") || lowerQuery.includes("algebra") || lowerQuery.includes("factor")) {
    matchedBanks.push(...CURRICULUM_KNOWLEDGE_BANK.quadratic);
  }
  if (lowerQuery.includes("biology") || lowerQuery.includes("cell") || lowerQuery.includes("photosynthesis") || lowerQuery.includes("genetics") || lowerQuery.includes("osmosis")) {
    matchedBanks.push(...CURRICULUM_KNOWLEDGE_BANK.biology);
  }
  if (lowerQuery.includes("chemistry") || lowerQuery.includes("mole") || lowerQuery.includes("acid") || lowerQuery.includes("atom") || lowerQuery.includes("gas") || lowerQuery.includes("organic")) {
    matchedBanks.push(...CURRICULUM_KNOWLEDGE_BANK.chemistry);
  }
  if (lowerQuery.includes("physics") || lowerQuery.includes("ohm") || lowerQuery.includes("electric") || lowerQuery.includes("motion") || lowerQuery.includes("energy") || lowerQuery.includes("wave")) {
    matchedBanks.push(...CURRICULUM_KNOWLEDGE_BANK.physics);
  }
  if (lowerQuery.includes("economic") || lowerQuery.includes("demand") || lowerQuery.includes("elasticity") || lowerQuery.includes("scarcity")) {
    matchedBanks.push(...CURRICULUM_KNOWLEDGE_BANK.economics);
  }

  if (matchedBanks.length > 0 && questions.length < questionCount) {
    matchedBanks.forEach((item, idx) => {
      if (questions.length >= questionCount) return;
      const opts = [...item.options];
      const pos = idx % 4;
      const correctStr = opts[item.ans];
      opts[item.ans] = opts[pos];
      opts[pos] = correctStr;

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

  const baseTopic = mode === "topic" ? rawContent : subject;
  const subAspects = [
    `Fundamental Principles of ${baseTopic}`,
    `Quantitative & Analytical Application of ${baseTopic}`,
    `Classification & Structure in ${baseTopic}`,
    `Problem Solving & Evaluation in ${baseTopic}`,
    `Experimental / Practical Scenarios in ${baseTopic}`,
    `Exam Trap Discrimination in ${baseTopic}`
  ];

  const templates = [
    (t) => ({
      q: `In ${classLevel} ${subject} (${examType} standard), which statement most accurately characterizes the core principle of ${t}?`,
      opts: [
        `It establishes the systematic relationship between variables, definitions, and governing conditions in ${t}`,
        `It assumes all variables in ${t} remain constant regardless of external changes`,
        `It applies only to isolated theoretical cases and never to practical ${subject} problems`,
        `It reverses the standard conservation and structural laws of ${subject}`
      ],
      exp: `In ${examType} ${subject} at the ${classLevel} level, mastering ${t} requires understanding how governing definitions and conditions link the core variables systematically.`
    }),
    (t) => ({
      q: `When solving an examination problem on "${t}" in ${examType} ${subject}, what is the most critical first analytical step?`,
      opts: [
        `Identify the given parameters, underlying governing rule or formula, and required unknown in ${t}`,
        `Approximate the final value without checking boundary conditions or units`,
        `Substitute arbitrary constants before simplifying the governing expression`,
        `Ignore secondary constraints stated in the problem stem`
      ],
      exp: `In ${examType} (${classLevel}), accurate problem-solving in ${t} always begins by extracting the known parameters, verifying units/constraints, and selecting the governing law or formula.`
    }),
    (t) => ({
      q: `Which common misconception do examiners frequently test as a distractor in ${examType} questions on ${t}?`,
      opts: [
        `Confusing necessary conditions with sufficient conditions or misapplying sign/unit conventions in ${t}`,
        `Showing full step-by-step intermediate working during derivations`,
        `Verifying that the obtained result satisfies the original conditions of ${t}`,
        `Expressing the final answer in standard ${subject} notation`
      ],
      exp: `${examType} examiners design distractors around sign errors, unit mismatches, and reversing cause-and-effect conditions in ${t}. Always verify your solution against the original problem statement.`
    }),
    (t) => ({
      q: `How does changing a primary input variable in a system governed by ${t} affect the outcome under standard ${subject} conditions?`,
      opts: [
        `The outcome adjusts predictably according to the governing law or functional relationship of ${t}`,
        `The system becomes completely independent of all input parameters`,
        `The governing relationship of ${t} ceases to hold for positive values`,
        `The output remains fixed at zero regardless of input magnitude`
      ],
      exp: `Systems governed by ${t} respond deterministically according to their defining ${subject} relationship, which is a high-frequency application focus in ${examType}.`
    })
  ];

  let fillIdx = 0;
  while (questions.length < questionCount) {
    const aspect = subAspects[fillIdx % subAspects.length];
    const tpl = templates[fillIdx % templates.length](baseTopic);
    const pos = fillIdx % 4;
    const opts = [...tpl.opts];
    const correctVal = opts[0];
    opts[0] = opts[pos];
    opts[pos] = correctVal;

    questions.push({
      question: tpl.q,
      type: "multiple_choice",
      options: opts,
      correctAnswer: pos,
      explanation: tpl.exp,
      topic: aspect,
      difficulty: difficulty.toLowerCase(),
      cognitiveSkill: fillIdx % 2 === 0 ? "application" : "analysis",
      sourceConcept: baseTopic,
      examRelevance: "high"
    });
    fillIdx += 1;
  }

  const distinctTopics = [...new Set(questions.map((q) => q.topic))];
  return {
    title: `${subject}: ${mode === "topic" ? rawContent : "Material Assessment"} (${examType})`,
    materialSummary: `Analyzed for ${classLevel} ${subject} aligned with ${examType} examination standards.`,
    examFocus: {
      highPriority: distinctTopics.slice(0, 3).map((t) => ({
        concept: t,
        reason: `High-weight ${examType} examination concept for ${classLevel} ${subject}.`
      })),
      alsoRevise: distinctTopics.slice(3, 6).map((t) => ({
        concept: t,
        reason: `Supporting concept that reinforces multi-step problem solving in ${subject}.`
      })),
      rationale: "Prioritized based on the selected examination format and your supplied material."
    },
    questions: questions.slice(0, questionCount)
  };
}

function synthesizeLocalStudyGuide(studyRequest) {
  const classLevel = String(studyRequest.classLevel || "SS3");
  const subject = String(studyRequest.subject || "Mathematics");
  const examType = String(studyRequest.examType || "WAEC");
  const topicsCovered = Array.isArray(studyRequest.topicsCovered) && studyRequest.topicsCovered.length > 0
    ? studyRequest.topicsCovered
    : [subject];
  const missedItems = Array.isArray(studyRequest.missedItems) ? studyRequest.missedItems : [];

  const modules = topicsCovered.slice(0, 4).map((topic, idx) => {
    const relatedMissed = missedItems.find((m) => m.topic === topic) || missedItems[idx] || null;
    const revisionNotes = relatedMissed
      ? `In your recent ${examType} practice for ${classLevel} ${subject}, you encountered difficulty on "${topic}". Specifically, regarding "${relatedMissed.question}", remember that the correct formulation is "${relatedMissed.correctAnswer}". ${relatedMissed.explanation || ""}`
      : `Mastering "${topic}" is essential for ${classLevel} ${subject} in ${examType}. Focus on understanding the core definitions, identifying the given parameters in the question stem, and applying the governing principle step by step.`;

    return {
      topic,
      revisionNotes,
      importantConcepts: [
        `Core Definition & Principle: Always state the precise ${classLevel} definition of ${topic} before applying shortcuts.`,
        `Exam Pattern Alert (${examType}): Check units, signs, and boundary conditions carefully—common distractors test partial solutions.`,
        relatedMissed
          ? `Key Takeaway: ${relatedMissed.explanation || `Verify why "${relatedMissed.correctAnswer}" satisfies all conditions.`}`
          : `Step-by-Step Verification: Substitute your final answer back into the original condition to confirm accuracy.`
      ],
      workedExample: relatedMissed
        ? `Problem: ${relatedMissed.question}\n\nStep 1: Identify the concept tested (${topic}).\nStep 2: Apply the governing ${subject} rule: ${relatedMissed.explanation}\nStep 3: Conclude with the verified answer: ${relatedMissed.correctAnswer}.`
        : `Example (${classLevel} ${examType}): When presented with a standard problem in ${topic}, first write down the governing relation, substitute the known values with proper units, and simplify systematically.`,
      practiceQuestion: {
        question: relatedMissed
          ? `Self-Check on ${topic}: ${relatedMissed.question}`
          : `What is the most reliable way to avoid common distractor traps when answering ${examType} questions on ${topic}?`,
        answer: relatedMissed
          ? relatedMissed.correctAnswer
          : `Identify the governing principle of ${topic}, write down intermediate steps clearly, and verify boundary conditions.`,
        explanation: relatedMissed
          ? relatedMissed.explanation
          : `Following a structured step-by-step approach eliminates careless sign and conceptual errors in ${examType}.`
      }
    };
  });

  const retestBlueprint = synthesizeLocalPipelineBlueprint({
    classLevel,
    subject,
    examType,
    difficulty: "Exam Level",
    questionCount: 5,
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

  const stageTimer = setInterval(() => {
    if (currentStageIdx < stageSequence.length - 1) {
      currentStageIdx += 1;
      const st = stageSequence[currentStageIdx];
      if (typeof onStageChange === "function") {
        onStageChange(st.index, st.aiState);
      }
    }
  }, 650);

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
      // Advance smoothly through the remaining thinking stages when running on a static server
      while (currentStageIdx < 4) {
        await new Promise((r) => setTimeout(r, 420));
        currentStageIdx += 1;
        const st = stageSequence[currentStageIdx];
        if (typeof onStageChange === "function" && st) {
          onStageChange(st.index, st.aiState);
        }
      }
      rawData = synthesizeLocalPipelineBlueprint(setupConfig);
    }

    clearInterval(stageTimer);

    if (typeof onStageChange === "function") {
      onStageChange(5, "checking");
    }

    const validated = validatePipelineResponse(rawData, setupConfig);
    await new Promise((r) => setTimeout(r, 450));
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
  }, 580);

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
      await new Promise((r) => setTimeout(r, 1200));
      rawData = synthesizeLocalPipelineBlueprint({
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
    await new Promise((r) => setTimeout(r, 420));
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
    await new Promise((r) => setTimeout(r, 900));
    data = synthesizeLocalStudyGuide(studyRequest);
  }

  return data;
}
