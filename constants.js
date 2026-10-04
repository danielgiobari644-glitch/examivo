/* ============================================================
   EXAMIVO — Constants: classes, subjects, exams, difficulties
   Class-adaptive language is a core feature: every class level
   carries a profile used by the AI backend (see functions/profiles.js).
   ============================================================ */

export const CLASS_GROUPS = [
  {
    group: 'Primary',
    hint: 'Foundations',
    levels: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'],
  },
  {
    group: 'Junior Secondary',
    hint: 'JSS',
    levels: ['JSS1', 'JSS2', 'JSS3'],
  },
  {
    group: 'Senior Secondary',
    hint: 'SS',
    levels: ['SS1', 'SS2', 'SS3'],
  },
  {
    group: 'Tertiary & Other',
    hint: 'Beyond secondary',
    levels: ['University', 'Other'],
  },
];

export const ALL_CLASSES = CLASS_GROUPS.flatMap((g) => g.levels);

export const SUBJECTS = [
  'Mathematics',
  'English Language',
  'Biology',
  'Chemistry',
  'Physics',
  'Basic Science',
  'Basic Technology',
  'Economics',
  'Government',
  'Civic Education',
  'Geography',
  'Literature',
  'Agricultural Science',
  'Computer Science',
  'Christian Religious Studies',
  'Islamic Religious Studies',
  'Accounting',
  'Commerce',
  'Further Mathematics',
  'Other',
];

export const EXAM_TYPES = [
  { id: 'waec', label: 'WAEC', desc: 'West African Examinations Council' },
  { id: 'neco', label: 'NECO', desc: 'National Examinations Council' },
  { id: 'jamb', label: 'JAMB / UTME', desc: 'Admissions & Matriculation Board' },
  { id: 'common_entrance', label: 'Common Entrance', desc: 'Primary school placement' },
  { id: 'school_exam', label: 'School Examination', desc: 'Term / terminal exams' },
  { id: 'class_test', label: 'Class Test', desc: 'Short topic tests' },
  { id: 'quiz', label: 'Quiz', desc: 'Quick knowledge checks' },
  { id: 'mock', label: 'Mock Examination', desc: 'Full exam simulation' },
  { id: 'custom', label: 'Custom Examination', desc: 'Your own format' },
];

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Exam Level', 'Mixed'];

export const QUESTION_COUNTS = [5, 10, 15, 20, 30];

export const EXAM_MODES = [
  {
    id: 'exam',
    label: 'Exam Mode',
    desc: 'Answers stay hidden until you submit. The closest experience to the real thing.',
  },
  {
    id: 'practice',
    label: 'Practice Mode',
    desc: 'Immediate feedback after each question, with explanations as you go.',
  },
];

export const QUESTION_TYPE_LABELS = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
  fill_blank: 'Fill in the Blank',
  short_answer: 'Short Answer',
  theory: 'Theory',
  essay: 'Essay',
  calculation: 'Calculation',
  scenario: 'Scenario',
  matching: 'Matching',
};

export const STORAGE_KEYS = {
  theme: 'examivo.theme',
  guestAttempts: 'examivo.guest.attempts',
  guestWeakAreas: 'examivo.guest.weakAreas',
  guestStudySessions: 'examivo.guest.studySessions',
  guestProfile: 'examivo.guest.profile',
  setupSession: 'examivo.setup.session',
  currentAttempt: 'examivo.current.attempt',
  lastAttempt: 'examivo.last.attempt',
};

/* Document / image limits (no Firebase Storage — files are processed in-browser
   or streamed as base64 through the secure backend, then discarded). */
export const LIMITS = {
  maxDocBytes: 20 * 1024 * 1024,
  maxImageBytes: 12 * 1024 * 1024,
  maxPasteChars: 60000,
  maxImageDim: 1400,
};

export const DOC_ACCEPT = '.pdf,.doc,.docx,.txt';
export const IMG_ACCEPT = '.jpg,.jpeg,.png,.webp';

export function examTypeLabel(id) {
  const found = EXAM_TYPES.find((e) => e.id === id);
  return found ? found.label : 'Examination';
}
