import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Serve all static files from root directory
app.use(express.static(__dirname));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const GEMINI_MODEL = 'gemini-3.8-flash';

async function callGeminiWithRetry(params, retries = 2, delayMs = 1200) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const errMsg = err?.message || '';
      if ((errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('rate')) && attempt < retries) {
        console.warn(`Gemini API transient issue, retrying in ${delayMs}ms... (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// Level contextual guidance for class-adaptive language
function getLevelGuideline(level) {
  const l = (level || '').toLowerCase();
  if (l.includes('primary')) {
    return 'Target audience: Primary school pupil. Language must be friendly, clear, straightforward, age-appropriate, avoid overly complex jargon, but preserve accurate core fundamentals.';
  } else if (l.includes('jss') || l.includes('junior')) {
    return 'Target audience: Junior Secondary Student (JSS 1-3 / grades 7-9). Language must be clear, accessible, structured, moderately academic, introducing scientific/academic terms with clear context.';
  } else if (l.includes('ss') || l.includes('senior')) {
    return 'Target audience: Senior Secondary Student (SS 1-3 / grades 10-12). Senior-secondary academic rigor, rigorous syllabus standards (e.g. WAEC, NECO, JAMB/UTME standards), precise terminology, analytical problem solving.';
  } else if (l.includes('university') || l.includes('tertiary') || l.includes('college')) {
    return 'Target audience: Undergraduate / Tertiary student. Deep theoretical accuracy, academic vocabulary, critical analysis, mathematical/scientific rigor, multi-step synthesis.';
  }
  return 'Target audience: General academic student. Rigorous, accurate, clear, and focused on formal examination success.';
}

// Assessment Type contextual guidance (continuous assessments, midterms, finals, standardized boards)
function getExamTypeGuideline(examType) {
  const t = (examType || '').toLowerCase();
  if (t.includes('continuous assessment') || t.includes('c.a.') || t.includes('ca 1') || t.includes('ca 2') || t.includes('ca 3') || t.includes('cat')) {
    return 'Assessment Profile: Continuous Assessment Test (C.A. / C.A.T.). Emphasize formative classroom evaluation, granular concept retention, direct application of lesson notes, step-by-step reasoning, and diagnostic feedback on common student slips.';
  } else if (t.includes('mid-term') || t.includes('midterm') || t.includes('half-term')) {
    return 'Assessment Profile: Mid-Term Examination. Balanced evaluation covering weeks 1-6 syllabus topics, evaluating foundational understanding, progressive difficulty, and multi-concept problem solving.';
  } else if (t.includes('quiz') || t.includes('weekly') || t.includes('class test')) {
    return 'Assessment Profile: Weekly Diagnostic Quiz / Class Test. Focused, rapid-fire conceptual checks designed to identify gaps immediately after a chapter or topic.';
  } else if (t.includes('term') || t.includes('end of term') || t.includes('terminal')) {
    return 'Assessment Profile: End-of-Term Examination. Comprehensive cumulative evaluation synthesizing all modules across the term, balanced across easy, moderate, and challenging questions.';
  } else if (t.includes('promotion') || t.includes('annual')) {
    return 'Assessment Profile: School Promotion / Annual Examination. Broad syllabus coverage assessing student readiness for grade progression.';
  } else if (t.includes('jamb') || t.includes('utme')) {
    return 'Assessment Profile: JAMB / UTME. Fast-paced multiple choice with authentic time-sensitive distractor patterns, testing speed, precision, and deep syllabus knowledge.';
  } else if (t.includes('waec') || t.includes('wassce')) {
    return 'Assessment Profile: WAEC (WASSCE). Senior school certificate standard, testing core curriculum concepts, standard diagrams, calculation accuracy, and strict academic conventions.';
  } else if (t.includes('neco') || t.includes('ssce')) {
    return 'Assessment Profile: NECO (SSCE). National senior certificate curriculum benchmark with high-yield syllabus testing.';
  } else if (t.includes('entrance') || t.includes('ncee')) {
    return 'Assessment Profile: National Common Entrance Examination (NCEE). Foundational primary-to-secondary aptitude, qualitative logic, quantitative reasoning, and verbal comprehension.';
  } else if (t.includes('bece') || t.includes('jsce')) {
    return 'Assessment Profile: Junior Secondary Certificate (BECE/JSCE). Evaluating junior secondary syllabus mastery across foundational science, arts, and core literacy/numeracy.';
  } else if (t.includes('mock')) {
    return 'Assessment Profile: Mock Examination. Exact simulation of final board conditions to calibrate timing, endurance, and score predictability.';
  } else if (t.includes('igcse') || t.includes('cambridge') || t.includes('o-level')) {
    return 'Assessment Profile: Cambridge IGCSE / GCE O-Level. Analytical inquiry, structured problem-solving, and international curriculum rigor.';
  } else if (t.includes('sat') || t.includes('act')) {
    return 'Assessment Profile: SAT / ACT Standardized Testing. Evidence-based reading, contextual math reasoning, and timed critical analysis.';
  } else if (t.includes('in-course') || t.includes('continuous assessment (uni)')) {
    return 'Assessment Profile: University In-Course Test / Continuous Assessment. Tertiary-level academic depth, critical principles, analytical derivations, and advanced practical applications.';
  } else if (t.includes('university') || t.includes('semester')) {
    return 'Assessment Profile: University Semester Final Examination. Comprehensive undergraduate rigor, multi-step critical synthesis, and academic precision.';
  }
  return 'Assessment Profile: Standardized Academic Assessment. Balanced testing of knowledge, comprehension, and practical problem-solving.';
}

// 1. Analyze Material & Generate Exam Focus Blueprint
app.post('/api/ai/analyze-material', async (req, res) => {
  try {
    const { academicLevel, subject, examType, materialType, materialText, imageBase64, imageMimeType, topic } = req.body;
    const levelGuide = getLevelGuideline(academicLevel);
    const examGuide = getExamTypeGuideline(examType);

    const systemInstruction = `You are EXAMIVO, a world-class educational AI examination architect.
Your mission is to perform an in-depth syllabus and material analysis for a student preparing for an assessment.
${levelGuide}
${examGuide}
Academic Level: ${academicLevel || 'Standard'}
Subject: ${subject || 'General'}
Exam Type: ${examType || 'Standard Examination'}

Analyze the provided study material (or topic) and output a structured JSON blueprint representing the "EXAM FOCUS".
Identify:
1. High-priority exam topics (topics with the highest probability of appearing in this exam format).
2. "Also Revise" topics (secondary or foundational areas).
3. Exact summary reason explaining why these areas are prioritized based on the exam format and material.
4. Key concepts, formulas, definitions, and common student pitfalls.

DO NOT claim to predict exact future questions; use language like "Prioritized based on the selected examination format and your supplied material."`;

    const promptText = `Analyze this study material for ${academicLevel}, Subject: ${subject}, Exam: ${examType}.
Material Type: ${materialType || 'topic'}
${topic ? `Topic: ${topic}` : ''}
${materialText ? `Content:\n${materialText}` : ''}

Respond ONLY with valid JSON matching this schema:
{
  "highPriority": [
    { "title": "Topic name", "importance": "Why it is critical for ${examType}", "subtopics": ["subtopic 1", "subtopic 2"] }
  ],
  "alsoRevise": [
    { "title": "Topic name", "importance": "Brief reason" }
  ],
  "summaryReason": "Detailed explanation of why these areas were prioritized based on ${examType} syllabus patterns and supplied material.",
  "keyConcepts": ["Concept 1", "Formula/Rule 2", "Definition 3"],
  "commonPitfalls": ["Common mistake students make 1", "Common mistake 2"]
}`;

    const parts = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType || 'image/jpeg',
          data: imageBase64,
        },
      });
    }
    parts.push({ text: promptText });

    const response = await callGeminiWithRetry({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error analyzing material:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to analyze material' });
  }
});

// 2. Question Generation Engine
app.post('/api/ai/generate-exam', async (req, res) => {
  try {
    const {
      academicLevel,
      subject,
      examType,
      questionCount = 10,
      difficulty = 'Medium',
      materialText,
      imageBase64,
      imageMimeType,
      topic,
      examFocus,
    } = req.body;

    const count = Math.min(Math.max(parseInt(questionCount, 10) || 10, 3), 30);
    const levelGuide = getLevelGuideline(academicLevel);
    const examGuide = getExamTypeGuideline(examType);

    const systemInstruction = `You are EXAMIVO's core Question Generation Engine.
Your purpose is to generate original, curriculum-accurate, assessment-standard questions.
${levelGuide}
${examGuide}
Academic Level: ${academicLevel}
Subject: ${subject}
Exam Type: ${examType}
Requested Difficulty: ${difficulty}
Count: ${count} questions.

CRITICAL RULES:
1. Every question must be original, accurate, pedagogically sound, and directly relevant to ${academicLevel} and ${examType} standard (e.g. WAEC/JAMB/NECO/University format).
2. Avoid meaningless variations. Diversify cognitive levels (recall, comprehension, application, calculation/scenario).
3. If source material or image is supplied, ground questions firmly in that material while testing real understanding.
4. For multiple choice, ensure all 4 options (A, B, C, D) are plausible; do NOT use silly distractors.
5. Provide a deep, step-by-step, educational explanation for why the correct answer is right and why others are wrong.
6. Provide an "examTip" highlighting what examiners look for.
7. Return clean structured JSON only.`;

    const promptText = `Generate ${count} questions for ${academicLevel} ${subject} (${examType} standard).
Difficulty: ${difficulty}.
${topic ? `Topic: ${topic}\n` : ''}
${materialText ? `Study Material Content:\n${materialText.slice(0, 10000)}\n` : ''}
${examFocus ? `Exam Focus Blueprint:\n${JSON.stringify(examFocus)}\n` : ''}

Output format:
{
  "examTitle": "${subject} ${examType} Practice",
  "subject": "${subject}",
  "academicLevel": "${academicLevel}",
  "examType": "${examType}",
  "questions": [
    {
      "id": 1,
      "question": "Clear, precise question text",
      "type": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Detailed step-by-step explanation showing complete working and concept explanation.",
      "topic": "Specific Topic",
      "difficulty": "medium",
      "cognitiveSkill": "application",
      "sourceConcept": "Concept being tested",
      "examRelevance": "high",
      "examTip": "Key tip for avoiding exam traps on this type of question."
    }
  ]
}`;

    const parts = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType || 'image/jpeg',
          data: imageBase64,
        },
      });
    }
    parts.push({ text: promptText });

    const response = await callGeminiWithRetry({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('AI returned an invalid question structure');
    }

    parsed.questions = parsed.questions.map((q, idx) => ({
      ...q,
      id: q.id || idx + 1,
      correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
    }));

    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error generating exam:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to generate questions' });
  }
});

// 3. Performance & Weak Area Diagnostics
app.post('/api/ai/analyze-performance', async (req, res) => {
  try {
    const { examMetadata, questions, userAnswers, timeSpentSeconds } = req.body;
    const totalQuestions = questions.length;
    let correctCount = 0;
    const itemAnalysis = [];

    questions.forEach((q, idx) => {
      const uAnswer = userAnswers[idx];
      const isCorrect = uAnswer === q.correctAnswer;
      if (isCorrect) correctCount++;
      itemAnalysis.push({
        id: q.id || idx + 1,
        topic: q.topic || 'General',
        isCorrect,
        userAnswer: uAnswer !== undefined ? q.options?.[uAnswer] || uAnswer : 'Unanswered',
        correctAnswer: q.options?.[q.correctAnswer] || q.correctAnswer,
        cognitiveSkill: q.cognitiveSkill || 'general',
      });
    });

    const scorePercentage = Math.round((correctCount / totalQuestions) * 100);

    const systemInstruction = `You are EXAMIVO's Performance Diagnostics & Weak-Area Intelligence Engine.
Analyze the student's exam attempt performance.
Identify specifically what cognitive hurdles, misconceptions, or formula gaps caused wrong answers.
Categorize findings into:
- Strong Areas (concepts mastered)
- Areas to Practice (borderline or partial mastery)
- Weak Areas (concepts with clear misconceptions requiring urgent targeted follow-up).
Explain clearly *why* the student struggled based on their wrong choices.`;

    const promptText = `Exam Performance Data:
Subject: ${examMetadata?.subject || 'Subject'}
Academic Level: ${examMetadata?.academicLevel || 'Level'}
Exam Type: ${examMetadata?.examType || 'Exam'}
Total Questions: ${totalQuestions}
Correct: ${correctCount}
Score: ${scorePercentage}%
Time Spent: ${timeSpentSeconds || 0} seconds

Question Results:
${JSON.stringify(itemAnalysis, null, 2)}

Provide structured JSON:
{
  "scorePercentage": ${scorePercentage},
  "correctCount": ${correctCount},
  "totalCount": ${totalQuestions},
  "performanceVerdict": "Insightful overall assessment of student exam-readiness",
  "strongAreas": [
    { "topic": "Topic Name", "status": "Mastered", "description": "Why the student did well here" }
  ],
  "areasToPractice": [
    { "topic": "Topic Name", "status": "Needs Review", "description": "Recommended focus" }
  ],
  "weakAreas": [
    {
      "topic": "Topic Name",
      "status": "Critical",
      "reason": "Specific conceptual reason why errors occurred",
      "recommendedAction": "Immediate study action"
    }
  ],
  "nextStepAdvice": "Encouraging, actionable next preparation strategy"
}`;

    const response = await callGeminiWithRetry({
      model: GEMINI_MODEL,
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      success: true,
      data: {
        ...parsed,
        scorePercentage,
        correctCount,
        totalCount: totalQuestions,
      },
    });
  } catch (error) {
    console.error('Error analyzing performance:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to analyze performance' });
  }
});

// 4. Targeted Weak Practice Generator
app.post('/api/ai/generate-weak-practice', async (req, res) => {
  try {
    const { academicLevel, subject, examType, weakAreas, previousQuestions } = req.body;
    const weakTopics = (weakAreas || []).map((w) => typeof w === 'string' ? w : w.topic).join(', ');
    const levelGuide = getLevelGuideline(academicLevel);

    const systemInstruction = `You are EXAMIVO's Adaptive Remediation Engine.
Generate 5 targeted practice questions specifically designed to heal the student's identified weaknesses.
Weak topics to target: ${weakTopics || 'Recent missed topics'}.
${levelGuide}
Academic Level: ${academicLevel}
Subject: ${subject}
Exam Type: ${examType}

Every question must address common traps, reinforce the missing concept, and provide rich clarifying explanations.`;

    const promptText = `Generate 5 targeted remediation questions for:
Academic Level: ${academicLevel}
Subject: ${subject}
Exam Type: ${examType}
Weak Areas: ${weakTopics}
${previousQuestions ? `Previously missed question context: ${JSON.stringify(previousQuestions.slice(0, 5))}` : ''}

Output valid JSON:
{
  "examTitle": "Targeted Remediation: ${weakTopics || subject}",
  "subject": "${subject}",
  "academicLevel": "${academicLevel}",
  "examType": "${examType}",
  "questions": [
    {
      "id": 1,
      "question": "Question text addressing the weakness",
      "type": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Crystal-clear concept explanation that cures the student's specific confusion.",
      "topic": "${weakTopics || 'Remediation'}",
      "difficulty": "medium",
      "cognitiveSkill": "application",
      "sourceConcept": "Remediation Concept",
      "examRelevance": "critical",
      "examTip": "How to avoid this error in the actual exam."
    }
  ]
}`;

    const response = await callGeminiWithRetry({
      model: GEMINI_MODEL,
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error generating weak practice:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to generate remediation' });
  }
});

// 5. Revision Notes Generator
app.post('/api/ai/generate-study-notes', async (req, res) => {
  try {
    const { academicLevel, subject, examType, missedQuestions, weakAreas } = req.body;
    const levelGuide = getLevelGuideline(academicLevel);

    const systemInstruction = `You are EXAMIVO's Revision Master.
Create a high-impact, easy-to-digest study revision guide called "Study My Mistakes".
${levelGuide}
Academic Level: ${academicLevel}
Subject: ${subject}
Exam Type: ${examType}

Structure the notes for quick absorption:
- Core Concept Simplified
- Key Formulas / Rules to remember
- Why students get this wrong (The Exam Trap)
- Step-by-Step Worked Example
- Quick Memory Trigger / Mnemonic`;

    const promptText = `Missed Questions / Weak Areas to revise:
${JSON.stringify({ missedQuestions: (missedQuestions || []).slice(0, 6), weakAreas }, null, 2)}

Respond with JSON:
{
  "title": "Exam Revision Guide: ${subject}",
  "summary": "Key insights to turn your recent mistakes into exam points.",
  "cards": [
    {
      "topic": "Topic Name",
      "coreConcept": "Clear, concise definition and mental model",
      "keyFormulasOrRules": ["Rule 1", "Formula 2"],
      "theExamTrap": "The exact trap the examiner sets and how to spot it",
      "workedExample": "Step-by-step example problem with clean solution",
      "memoryTrigger": "Catchy tip or mnemonic"
    }
  ],
  "quickSelfCheckQuestions": [
    {
      "prompt": "Brief recall question",
      "answer": "Answer explanation"
    }
  ]
}`;

    const response = await callGeminiWithRetry({
      model: GEMINI_MODEL,
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error generating study notes:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to generate study notes' });
  }
});

// Fallback to index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EXAMIVO server running on http://0.0.0.0:${PORT}`);
});
