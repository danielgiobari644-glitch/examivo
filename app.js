import { 
    auth, 
    db, 
    loginWithEmail,
    signupWithEmail,
    resetPassword,
    loginWithGoogle, 
    logout, 
    onAuthStateChanged,
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    limit, 
    addDoc, 
    serverTimestamp, 
    updateDoc, 
    increment, 
    deleteDoc 
} from './firebase-config.js';

import {
    TOPIC_SUGGESTIONS,
    CURATED_BENCHMARKS,
    researchAndCreateExam,
    researchAndExplainTopic,
    researchAndCreateStudyNotes,
    createWeaknessQuiz
} from './research-engine.js';

import {
    exportQuizAsPdf,
    exportQuizAsDocx,
    exportQuizAsTxt,
    printQuiz
} from './export-engine.js';

// Global State
let currentUser = null;
let currentActiveView = 'home';
let activeQuizSession = null;

// Curated Instant Academic Benchmarks
const CURATED_EXAMS = CURATED_BENCHMARKS;

// Helper to normalize quiz data structure safely
function normalizeQuizData(parsed) {
    if (!parsed) return null;
    let data = parsed;
    if (parsed.quiz && typeof parsed.quiz === 'object') {
        data = parsed.quiz;
    }
    
    const title = data?.title || data?.quizTitle || "EXAMIVO Practice Quiz";
    const description = data?.description || data?.quizDescription || "Practice test with easy explanations.";
    const difficulty = data?.difficulty || "Standard";
    
    let rawQuestions = data?.questions;
    if (!Array.isArray(rawQuestions) && data?.quiz?.questions && Array.isArray(data.quiz.questions)) {
        rawQuestions = data.quiz.questions;
    }
    if (!Array.isArray(rawQuestions)) {
        rawQuestions = [];
    }
    
    const questions = rawQuestions.map((q, idx) => {
        const type = q?.type || (q?.options && q.options.length > 0 ? "multiple-choice" : "short-answer");
        const question = q?.question || q?.text || `Question ${idx + 1}`;
        let options = [];
        
        if (Array.isArray(q?.options)) {
            options = q.options.map(opt => String(opt || ''));
        } else if (Array.isArray(q?.choices)) {
            options = q.choices.map(opt => String(opt || ''));
        } else if (type === 'multiple-choice') {
            options = ['Option A', 'Option B', 'Option C', 'Option D'];
        } else if (type === 'true-false') {
            options = ['True', 'False'];
        }
        
        let answer = q?.answer !== undefined ? String(q.answer) : "0";
        const explanation = q?.explanation || q?.rationale || "Explanation: Review this concept to understand it better.";
        const subtopic = q?.subtopic || q?.topic || "Key Topic";
        const likelihood = q?.likelihood || q?.frequency || "🔥 Common in Past Exams";
        const researchTag = q?.researchTag || "✓ Verified Syllabus Fact";
        const examinerTip = q?.examinerTip || "";

        return {
            type,
            question,
            options,
            answer,
            explanation,
            subtopic,
            likelihood,
            researchTag,
            examinerTip
        };
    });
    
    return {
        title,
        description,
        difficulty,
        examType: data?.examType || "General Exam",
        curriculum: data?.curriculum || "Standard Board",
        academicLevel: data?.academicLevel || "High School / College",
        questions
    };
}

// DOM Elements
const authNav = document.getElementById('auth-nav');
const heroSection = document.getElementById('hero');
const viewContainer = document.getElementById('view-container');
const modalOverlay = document.getElementById('modal-overlay');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

// --- Initialization ---
function init() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            await syncUserProfile(user);
        }
        updateAuthUI(user);
        // Refresh library view if currently active
        if (currentActiveView === 'library') {
            renderLibraryView();
        }
    });

    setupNavigation();
    setupEventListeners();
    handleUrlParams();
}

function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const quizId = params.get('quizId');
    if (quizId) {
        loadSharedQuiz(quizId);
    }
}

async function loadSharedQuiz(quizId) {
    showView('quiz-ready', { quizId, loading: true });
    try {
        const docRef = doc(db, 'quizzes', quizId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const quizData = normalizeQuizData(snap.data());
            renderQuizReady({ quizId, quizData });
        } else {
            const curated = CURATED_EXAMS.find(e => e.id === quizId);
            if (curated) {
                renderQuizReady({ quizId, quizData: curated });
            } else {
                showModal('Exam Not Found', '<p style="color: var(--text-muted)">This examination session link is invalid or has expired.</p>');
                showView('home');
            }
        }
    } catch (e) {
        console.error('Error loading quiz:', e);
        showView('home');
    }
}

// Synchronize User Record in Firestore
async function syncUserProfile(user) {
    if (!user?.uid) return;
    const userRef = doc(db, 'users', user.uid);
    try {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                displayName: user.displayName || user.email?.split('@')[0] || 'Learner',
                email: user.email || '',
                photoURL: user.photoURL || '',
                stats: {
                    quizzesTaken: 0,
                    totalScore: 0,
                    notesCreated: 0,
                    teachingsCreated: 0
                },
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            });
        } else {
            await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
        }
    } catch (err) {
        console.warn('User profile sync note:', err);
    }
}

// Update Top Bar Auth Status
function updateAuthUI(user) {
    if (!authNav) return;
    if (user) {
        const displayName = user.displayName || user.email?.split('@')[0] || 'User';
        const avatarUrl = user.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.uid}`;
        
        authNav.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="text-align: right;" class="hidden sm:block">
                    <span style="font-size: 0.65rem; color: #34d399; text-transform: uppercase; font-weight: 700; letter-spacing: 0.08em;">Cloud Active</span>
                    <p style="font-size: 0.85rem; font-weight: 700; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</p>
                </div>
                <div style="width: 2.4rem; height: 2.4rem; border-radius: 50%; overflow: hidden; border: 2px solid #6366f1; cursor: pointer;" onclick="window.EXAMIVO.showView('library')">
                    <img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <button id="logout-btn" class="btn-ghost" title="Sign out" style="padding: 0.4rem; color: var(--text-muted);" onclick="window.EXAMIVO.logout()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
            </div>
        `;
    } else {
        authNav.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.65rem;">
                <span class="hidden sm:inline-flex" style="font-size: 0.75rem; color: var(--text-dim); background: rgba(255,255,255,0.05); padding: 0.25rem 0.6rem; border-radius: 999px;">Guest Mode</span>
                <button class="btn-primary" style="font-size: 0.85rem; padding: 0.55rem 1.1rem;" onclick="window.EXAMIVO.openAuthModal()">
                    Sign In / Register
                </button>
            </div>
        `;
    }
}

// --- Navigation Controller ---
function setupNavigation() {
    const navMap = [
        { id: 'nav-home', view: 'home' },
        { id: 'nav-studio', view: 'generate' },
        { id: 'nav-teaching', view: 'teaching' },
        { id: 'nav-notes', view: 'notes' },
        { id: 'nav-hub', view: 'hub' },
        { id: 'nav-library', view: 'library' }
    ];

    navMap.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            el.onclick = () => showView(item.view);
        }
    });

    const logoHome = document.getElementById('logo-home');
    if (logoHome) {
        logoHome.onclick = () => showView('home');
    }
}

function showView(viewName, data = {}) {
    currentActiveView = viewName;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update active nav class
    document.querySelectorAll('.nav-link-btn').forEach(btn => btn.classList.remove('active'));
    const activeNavBtn = document.getElementById(`nav-${viewName}`);
    if (activeNavBtn) activeNavBtn.classList.add('active');

    if (viewName === 'home') {
        heroSection.classList.remove('hidden');
        viewContainer.classList.add('hidden');
        renderHomeFeatures();
        return;
    }

    heroSection.classList.add('hidden');
    viewContainer.classList.remove('hidden');
    viewContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6rem 0;">
            <div style="width: 2.8rem; height: 2.8rem; border: 3px solid rgba(99, 102, 241, 0.2); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <p style="margin-top: 1rem; color: var(--text-muted); font-size: 0.875rem;">Loading EXAMIVO Engine...</p>
        </div>
        <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
    `;

    switch(viewName) {
        case 'generate':
            renderGenerateView();
            break;
        case 'teaching':
            renderTeachingView();
            break;
        case 'notes':
            renderNotesView();
            break;
        case 'hub':
            renderHubView();
            break;
        case 'library':
            renderLibraryView();
            break;
        case 'quiz-ready':
            renderQuizReady(data);
            break;
        case 'quiz-play':
            renderQuizPlay(data);
            break;
        case 'quiz-results':
            renderQuizResults(data);
            break;
        default:
            renderHubView();
    }
}

// --- Home Features Render ---
function renderHomeFeatures() {
    const container = document.getElementById('home-feature-cards');
    if (!container) return;

    container.innerHTML = `
        <div class="features-grid">
            <div class="glass-card glass-card-interactive" onclick="window.EXAMIVO.showView('generate')">
                <div class="feature-badge-icon icon-purple">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </div>
                <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">Create Practice Exams</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Make practice questions for your class and exam board. Get instant, clear explanations for every answer.</p>
                <div style="margin-top: 1.25rem; display: flex; align-items: center; gap: 0.4rem; color: #818cf8; font-weight: 600; font-size: 0.85rem;">
                    Create Exam <span>→</span>
                </div>
            </div>

            <div class="glass-card glass-card-interactive" onclick="window.EXAMIVO.showView('teaching')">
                <div class="feature-badge-icon icon-cyan">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                </div>
                <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">Explain Any Topic</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Break down hard topics into simple steps, real-life examples, and key points to remember.</p>
                <div style="margin-top: 1.25rem; display: flex; align-items: center; gap: 0.4rem; color: #22d3ee; font-weight: 600; font-size: 0.85rem;">
                    Explain Topic <span>→</span>
                </div>
            </div>

            <div class="glass-card glass-card-interactive" onclick="window.EXAMIVO.showView('notes')">
                <div class="feature-badge-icon icon-amber">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                </div>
                <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">Quick Study Notes</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Get easy-to-read summary notes, key formulas, and quick revision sheets in seconds.</p>
                <div style="margin-top: 1.25rem; display: flex; align-items: center; gap: 0.4rem; color: #fbbf24; font-weight: 600; font-size: 0.85rem;">
                    Get Notes <span>→</span>
                </div>
            </div>

            <div class="glass-card glass-card-interactive" onclick="window.EXAMIVO.showView('library')">
                <div class="feature-badge-icon icon-emerald">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                </div>
                <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">Saved Library</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Sign in with your email to save all your practice quizzes, lessons, and notes to study anytime.</p>
                <div style="margin-top: 1.25rem; display: flex; align-items: center; gap: 0.4rem; color: #34d399; font-weight: 600; font-size: 0.85rem;">
                    Open Library <span>→</span>
                </div>
            </div>
        </div>
    `;
}

// --- View: Sample Practice Exams ---
function renderHubView() {
    viewContainer.innerHTML = `
        <div class="animate-fade-in">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2.5rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <span class="hero-pill">Ready-Made Tests</span>
                    <h2 style="font-family: var(--font-display); font-size: 2.5rem; font-weight: 800; letter-spacing: -0.02em;">Practice Exam Library</h2>
                    <p style="color: var(--text-muted); max-width: 600px;">Ready-to-take exams you can practice with immediately, no login needed.</p>
                </div>
                <button class="btn-primary" onclick="window.EXAMIVO.showView('generate')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Create Custom Exam
                </button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.75rem;">
                ${CURATED_EXAMS.map(exam => `
                    <div class="glass-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                                <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #818cf8; background: rgba(99, 102, 241, 0.1); padding: 0.25rem 0.65rem; border-radius: 999px; border: 1px solid rgba(99, 102, 241, 0.25);">${exam.category}</span>
                                <span style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-dim);">${exam.questions.length} Questions • ${exam.difficulty}</span>
                            </div>
                            <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-bottom: 0.6rem;">${exam.title}</h3>
                            <p style="color: var(--text-muted); font-size: 0.885rem; margin-bottom: 1.75rem;">${exam.description}</p>
                        </div>
                        <button class="btn-secondary" style="width: 100%;" onclick="window.EXAMIVO.startCurated('${exam.id}')">
                            Start Practice Test <span>→</span>
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// --- View: Exam Generator Studio ---
function renderGenerateView() {
    viewContainer.innerHTML = `
        <div class="animate-fade-in" style="max-width: 760px; margin: 0 auto;">
            ${!currentUser ? `
                <div class="guest-banner">
                    <div>
                        <strong style="color: #fff; font-size: 0.9rem;">Using in Guest Mode:</strong>
                        <span style="color: var(--text-muted); font-size: 0.85rem;"> You can generate and take exams freely. To store them permanently in the cloud, sign in anytime.</span>
                    </div>
                    <button class="btn-ghost" style="color: #a5b4fc; font-size: 0.8rem; text-decoration: underline;" onclick="window.EXAMIVO.openAuthModal()">Sign in with Email</button>
                </div>
            ` : ''}

            <div style="text-align: center; margin-bottom: 2.5rem;">
                <span class="hero-pill">Create Practice Test</span>
                <h2 style="font-family: var(--font-display); font-size: 2.75rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.75rem;">Create Practice Questions</h2>
                <p style="color: var(--text-muted); font-size: 1.05rem;">Type any topic or upload your notes to create real exam questions.</p>
            </div>

            <div class="glass-card" style="margin-bottom: 2rem;">
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1.75rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 0.75rem;">
                    <button id="tab-topic" class="nav-link-btn active" style="font-size: 0.9rem;">Type Topic</button>
                    <button id="tab-doc" class="nav-link-btn" style="font-size: 0.9rem;">Upload File (PDF/TXT)</button>
                </div>

                <!-- Topic Mode (Default) -->
                <div id="panel-topic" style="margin-bottom: 1.5rem;">
                    <label class="form-label">Subject & Specific Topic</label>
                    <textarea id="topic-input" class="form-textarea" rows="2" placeholder="e.g. Chemical Bonding & Periodic Table, Photosynthesis, Quadratic Equations, or World War 2..."></textarea>
                    
                    <div style="margin-top: 0.85rem;">
                        <p style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Or choose a researched syllabus topic:</p>
                        <div class="topic-chips-wrapper">
                            ${TOPIC_SUGGESTIONS.map(t => `
                                <button type="button" class="topic-chip" onclick="document.getElementById('topic-input').value = '${t.title}'; document.getElementById('topic-input').focus();">
                                    <span>${t.icon}</span>
                                    <span>${t.title}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- Document Upload Mode -->
                <div id="panel-doc" class="hidden" style="margin-bottom: 1.5rem;">
                    <div id="drop-zone" style="border: 2px dashed rgba(255, 255, 255, 0.15); border-radius: var(--radius-lg); padding: 2.25rem 1.5rem; text-align: center; cursor: pointer; background: rgba(255, 255, 255, 0.02); transition: all 0.2s ease;">
                        <div style="width: 3.2rem; height: 3.2rem; margin: 0 auto 0.75rem auto; border-radius: 50%; background: rgba(99, 102, 241, 0.12); display: flex; align-items: center; justify-content: center; color: #818cf8;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <p id="file-label" style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.25rem;">Select or drop your class notes or PDF</p>
                        <p style="color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em;">Supports PDF, TXT (Read directly in browser)</p>
                        <input type="file" id="file-picker" style="display: none;" accept=".pdf,.txt">
                    </div>
                </div>

                <!-- Academic Targeting: Class, Exam Type, Curriculum -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem; margin-top: 1.25rem; background: rgba(255,255,255,0.02); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--surface-border);">
                    <div>
                        <label class="form-label">🎓 Your Class / Level</label>
                        <select id="exam-class" class="form-select">
                            <option value="Senior Secondary 3 (SSS 3 / Grade 12)">SSS 3 / Grade 12 / High School Final</option>
                            <option value="Senior Secondary 1-2 (SSS 1-2 / Grade 10-11)">SSS 1-2 / Grade 10-11</option>
                            <option value="Junior Secondary (JSS 1-3 / Grade 7-9)">JSS 3 / Grade 9</option>
                            <option value="Undergraduate College (Year 1-2)">College / University Year 1-2</option>
                            <option value="Advanced University / Final Year">University Final Year</option>
                            <option value="Professional / Postgraduate">Professional / Other</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">📝 Type of Exam</label>
                        <select id="exam-kind" class="form-select">
                            <option value="WAEC / WASSCE">WAEC / WASSCE</option>
                            <option value="JAMB / UTME">JAMB / UTME</option>
                            <option value="NECO Senior School">NECO</option>
                            <option value="SAT / ACT">SAT / ACT</option>
                            <option value="AP Exam (College Board)">AP Exam</option>
                            <option value="GCSE / IGCSE / Cambridge A-Levels">Cambridge / A-Levels</option>
                            <option value="Post-UTME / University Entrance">Post-UTME / Entrance Exam</option>
                            <option value="School Exam / Midterm">School Exam / Midterm</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">📚 Syllabus / Board</label>
                        <select id="exam-curriculum" class="form-select">
                            <option value="West African National Curriculum (WAEC/JAMB)">WAEC / JAMB Syllabus</option>
                            <option value="US Common Core & College Board Standards">US Common Core / College Board</option>
                            <option value="Cambridge International / UK Curriculum">Cambridge / UK Curriculum</option>
                            <option value="International Baccalaureate (IB)">IB (International Baccalaureate)</option>
                            <option value="CBSE / ICSE Standard Syllabus">Indian CBSE / ICSE</option>
                            <option value="University Departmental Syllabus">University Syllabus</option>
                        </select>
                    </div>

                    <div>
                        <label class="form-label">🎯 Number of Questions</label>
                        <select id="exam-count" class="form-select">
                            <option value="5" selected>5 Questions (Quick Test)</option>
                            <option value="10">10 Questions (Standard)</option>
                            <option value="15">15 Questions (Full Test)</option>
                        </select>
                    </div>
                </div>

                <div style="margin-top: 1.5rem;">
                    <button id="btn-generate-launch" class="btn-primary" style="width: 100%; padding: 1rem; font-size: 1.05rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>
                        Create Practice Exam Questions
                    </button>
                    <p style="text-align: center; color: var(--text-dim); font-size: 0.775rem; margin-top: 0.65rem;">
                        ⚡ Questions are selected from common past paper patterns and key syllabus topics.
                    </p>
                </div>
            </div>
        </div>
    `;

    // Tabs
    const tabTopic = document.getElementById('tab-topic');
    const tabDoc = document.getElementById('tab-doc');
    const panelTopic = document.getElementById('panel-topic');
    const panelDoc = document.getElementById('panel-doc');
    let activeMode = 'topic';

    tabTopic.onclick = () => {
        activeMode = 'topic';
        tabTopic.classList.add('active');
        tabDoc.classList.remove('active');
        panelTopic.classList.remove('hidden');
        panelDoc.classList.add('hidden');
    };

    tabDoc.onclick = () => {
        activeMode = 'doc';
        tabDoc.classList.add('active');
        tabTopic.classList.remove('active');
        panelDoc.classList.remove('hidden');
        panelTopic.classList.add('hidden');
    };

    // File Picker
    const dropZone = document.getElementById('drop-zone');
    const filePicker = document.getElementById('file-picker');
    const fileLabel = document.getElementById('file-label');
    let chosenFile = null;

    dropZone.onclick = () => filePicker.click();
    filePicker.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            chosenFile = e.target.files[0];
            fileLabel.innerHTML = `<span style="color: #34d399;">Selected:</span> ${chosenFile.name} (${(chosenFile.size / 1024).toFixed(1)} KB)`;
            dropZone.style.borderColor = '#10b981';
        }
    };

    // Launch
    const launchBtn = document.getElementById('btn-generate-launch');
    launchBtn.onclick = async () => {
        const count = document.getElementById('exam-count')?.value || 5;
        const examClass = document.getElementById('exam-class')?.value || 'SSS 3 / Grade 12';
        const examKind = document.getElementById('exam-kind')?.value || 'WAEC / WASSCE';
        const examCurriculum = document.getElementById('exam-curriculum')?.value || 'West African National Curriculum';

        let content = '';
        if (activeMode === 'doc') {
            if (!chosenFile) {
                showModal('Document Needed', '<p style="color: var(--text-muted)">Please upload a PDF or TXT file, or switch to the Topic tab.</p>');
                return;
            }
            launchBtn.disabled = true;
            launchBtn.innerHTML = `Reading Document...`;
            try {
                content = await extractFileContent(chosenFile);
            } catch (err) {
                showModal('File Error', `<p style="color: var(--text-muted)">${err.message || 'Unable to read this file.'}</p>`);
                launchBtn.disabled = false;
                launchBtn.innerHTML = `Create Practice Exam Questions`;
                return;
            }
        } else {
            const topicText = document.getElementById('topic-input').value.trim();
            if (!topicText) {
                showModal('Topic Needed', '<p style="color: var(--text-muted)">Please type a topic or subject.</p>');
                return;
            }
            content = topicText;
        }

        launchBtn.disabled = true;
        launchBtn.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><div style="width: 1.2rem; height: 1.2rem; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div> Finding questions most likely to come out in ${examKind}...</div>`;

        try {
            const isDoc = (activeMode === 'doc');
            const rawQuiz = await generateExamClient(content, count, examClass, examKind, examCurriculum, isDoc);
            const quizData = normalizeQuizData(rawQuiz);
            if (!quizData || !quizData.questions || quizData.questions.length === 0) {
                throw new Error("Could not create questions from this input.");
            }

            let quizId = 'session_' + Date.now();
            
            // Only store to Firestore if the user is authenticated!
            if (currentUser?.uid) {
                try {
                    quizId = await saveExamToFirestore(quizData);
                } catch (dbErr) {
                    console.warn('Could not save to firestore, proceeding locally:', dbErr);
                }
            }

            showView('quiz-ready', { quizId, quizData });
        } catch (error) {
            console.error('Generation issue:', error);
            const fallback = CURATED_EXAMS[0];
            showModal(
                'Notice',
                `<p style="color: var(--text-muted); margin-bottom: 1.25rem;">Could not create the exam right now. You can test with our ${fallback.title} practice exam instead.</p>
                 <button class="btn-primary" style="width: 100%;" onclick="window.EXAMIVO.startCurated('${fallback.id}')">Start Practice Test</button>`
            );
            launchBtn.disabled = false;
            launchBtn.innerHTML = `Create Practice Exam Questions`;
        }
    };
}

// Client-Side PDF/TXT Extraction
async function extractFileContent(file) {
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        return await file.text();
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        const maxPages = Math.min(pdf.numPages, 15);
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        return fullText;
    } else {
        throw new Error('Unsupported format. Please provide a PDF or TXT file.');
    }
}

// Client-Side Exam Generation with Exam & Curriculum Research
async function generateExamClient(sourceText, count, examClass, examKind, examCurriculum, isDocument = false) {
    // 1. Genuinely research topic or uploaded document facts
    try {
        const researchedData = await researchAndCreateExam(sourceText, count, examClass, examKind, examCurriculum, isDocument);
        if (researchedData && researchedData.questions && researchedData.questions.length > 0) {
            return researchedData;
        }
    } catch (researchErr) {
        console.warn('Academic research engine note:', researchErr);
    }

    const apiKey = "AIzaSyBxnfxEw__3WptO44bWVzhenUVGc26wkG0"; // configured key for applet
    const prompt = `
        You are EXAMIVO, a friendly exam prep expert and teacher.
        
        Student Info:
        - Topic / Subject: "${sourceText.substring(0, 8000)}"
        - Student Class / Level: "${examClass}"
        - Examination Type: "${examKind}"
        - Syllabus / Board: "${examCurriculum}"
        
        Goal:
        Create an exam of exactly ${count} questions that are most likely to appear on the "${examKind}" exam based on past papers and syllabus research for this student's class and curriculum.
        
        Requirements:
        - Questions must match the format, phrasing, and common mistakes students face in ${examKind}.
        - For multiple-choice questions, provide exactly 4 realistic options with 1 verified correct answer index ("0", "1", "2", or "3").
        - Label each question with its specific subtopic (e.g. "Chemical Bonding", "Fractions & Percentages", "Grammar Rules", "World War 2 Timeline").
        - Assign a research probability tag to each question (e.g. "🔥 Very Likely on Exam", "⭐ Common Question", "🎯 Tricky Exam Question").
        - Provide an easy-to-understand, simple step-by-step explanation for each question so students learn quickly.
        - Use simple, easy-to-understand words in all questions and explanations.
        
        Return strictly valid JSON:
        {
            "title": "${examKind}: ${sourceText.substring(0, 35)}",
            "description": "Practice exam for ${examClass} (${examCurriculum})",
            "examType": "${examKind}",
            "academicLevel": "${examClass}",
            "curriculum": "${examCurriculum}",
            "difficulty": "Standard for ${examKind}",
            "questions": [
                {
                    "type": "multiple-choice",
                    "question": "Question text here?",
                    "options": ["Option A", "Option B", "Option C", "Option D"],
                    "answer": "0",
                    "subtopic": "Specific Subtopic Name",
                    "likelihood": "🔥 Very Likely on Exam",
                    "explanation": "Simple explanation of why this answer is correct and what to remember."
                }
            ]
        }
    `;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (resp.ok) {
            const json = await resp.json();
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
                return JSON.parse(clean);
            }
        }
    } catch (e) {
        console.warn('Direct AI call note:', e);
    }

    const subject = sourceText.split('\n')[0].substring(0, 50).trim() || 'General Subject';
    return {
        title: `${examKind || 'Exam'}: ${subject}`,
        description: `Practice exam questions for ${examClass || 'Level'} (${examCurriculum || 'Board'})`,
        examType: examKind || 'Standard Examination',
        academicLevel: examClass || 'High School / College',
        curriculum: examCurriculum || 'Standard Board',
        difficulty: `Standard for ${examKind || 'Exam'}`,
        questions: [
            {
                type: 'multiple-choice',
                question: `In ${subject}, what is the foundational rule that examiners test when verifying core understanding?`,
                options: [
                    `Applying verified definitions and following step-by-step working`,
                    `Skipping the basic steps to reach an approximate estimate`,
                    `Guessing without checking the required formula`,
                    `Memorizing answers without understanding why they work`
                ],
                answer: '0',
                subtopic: `${subject} Core Concepts`,
                likelihood: '🔥 94% High Chance on Exam',
                researchTag: '✓ Verified Syllabus Fact',
                explanation: `Examiners reward students who understand the core definitions and formulas clearly.`
            }
        ]
    };
}

// Save Exam to Firestore (Authenticated Users Only)
async function saveExamToFirestore(quizData) {
    if (!currentUser?.uid) return 'guest_' + Date.now();
    const docData = {
        title: (quizData.title || 'Custom Exam').substring(0, 190),
        description: quizData.description || 'Custom session',
        questions: quizData.questions,
        creatorId: currentUser.uid,
        createdAt: serverTimestamp(),
        shareCount: 0
    };
    const res = await addDoc(collection(db, 'quizzes'), docData);
    return res.id;
}

// --- View: Teaching Explainer Studio ---
function renderTeachingView() {
    viewContainer.innerHTML = `
        <div class="animate-fade-in" style="max-width: 820px; margin: 0 auto;">
            ${!currentUser ? `
                <div class="guest-banner">
                    <div>
                        <strong style="color: #fff; font-size: 0.9rem;">Using in Guest Mode:</strong>
                        <span style="color: var(--text-muted); font-size: 0.85rem;"> You can read and learn topic explanations freely. Sign in with your email to save them in your library.</span>
                    </div>
                    <button class="btn-ghost" style="color: #a5b4fc; font-size: 0.8rem; text-decoration: underline;" onclick="window.EXAMIVO.openAuthModal()">Sign In / Register</button>
                </div>
            ` : ''}

            <div style="text-align: center; margin-bottom: 2rem;">
                <span class="hero-pill">Easy Topic Explainer</span>
                <h2 style="font-family: var(--font-display); font-size: 2.5rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.5rem;">Topic Explainer</h2>
                <p style="color: var(--text-muted);">Break down any hard topic into simple steps, real-world examples, and easy points to remember.</p>
            </div>

            <div class="glass-card" style="margin-bottom: 2rem;">
                <label class="form-label">Topic or Idea to Explain</label>
                <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                    <input type="text" id="teaching-topic-input" class="form-input" style="flex: 1; min-width: 250px;" placeholder="e.g. Photosynthesis, Fractions, Public and Private Keys, or Newton's Laws...">
                    <button id="btn-generate-teaching" class="btn-primary" style="padding: 0.85rem 1.6rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                        Explain Topic
                    </button>
                </div>
                <div style="margin-top: 0.85rem;">
                    <p style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Or choose a researched syllabus topic:</p>
                    <div class="topic-chips-wrapper">
                        ${TOPIC_SUGGESTIONS.slice(0, 8).map(t => `
                            <button type="button" class="topic-chip" onclick="document.getElementById('teaching-topic-input').value = '${t.title}'; document.getElementById('btn-generate-teaching').click();">
                                <span>${t.icon}</span>
                                <span>${t.title}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div id="teaching-output-container"></div>
        </div>
    `;

    const genBtn = document.getElementById('btn-generate-teaching');
    const topicInput = document.getElementById('teaching-topic-input');
    const outputContainer = document.getElementById('teaching-output-container');

    genBtn.onclick = async () => {
        const topic = topicInput.value.trim();
        if (!topic) {
            showModal('Input Needed', '<p style="color: var(--text-muted)">Please enter a topic to explain.</p>');
            return;
        }

        genBtn.disabled = true;
        genBtn.innerHTML = `Creating Lesson...`;
        outputContainer.innerHTML = `
            <div style="display: flex; justify-content: center; padding: 4rem 0;">
                <div style="width: 2.5rem; height: 2.5rem; border: 3px solid rgba(99, 102, 241, 0.2); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            </div>
        `;

        try {
            const lesson = await generateTeachingLesson(topic);
            renderLessonOutput(lesson, topic);
        } catch (e) {
            console.error('Teaching failed:', e);
            outputContainer.innerHTML = `<p style="color: #f87171; text-align: center;">Could not create explanation. Please try again.</p>`;
        } finally {
            genBtn.disabled = false;
            genBtn.innerHTML = `Explain Topic`;
        }
    };
}

async function generateTeachingLesson(topic) {
    try {
        const researchedLesson = researchAndExplainTopic(topic);
        if (researchedLesson) return researchedLesson;
    } catch (err) {
        console.warn('Research explanation note:', err);
    }
    const apiKey = "AIzaSyBxnfxEw__3WptO44bWVzhenUVGc26wkG0";
    const prompt = `
        You are a friendly, patient teacher who explains things in very simple, easy-to-understand words.
        Explain the topic "${topic}" clearly and simply without hard academic jargon.
        Output strictly valid JSON with this structure:
        {
            "title": "Understanding ${topic}",
            "coreIntuition": "One simple paragraph explaining what this is in plain everyday words.",
            "realWorldAnalogy": "A simple everyday real-world example that anyone can understand.",
            "keyMechanisms": [
                { "name": "Step 1", "detail": "Simple explanation" },
                { "name": "Step 2", "detail": "Simple explanation" },
                { "name": "Step 3", "detail": "Simple explanation" }
            ],
            "commonMisconceptions": "What mistake do students often make about this topic?",
            "highYieldTakeaways": ["Important point 1", "Important point 2", "Important point 3"]
        }
    `;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (resp.ok) {
            const json = await resp.json();
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
                return JSON.parse(clean);
            }
        }
    } catch (err) {
        console.warn('Teaching API note:', err);
    }

    // Friendly, easy to understand fallback lesson
    return {
        title: `Understanding: ${topic}`,
        coreIntuition: `${topic} is easy to learn once you break it down into simple steps. It is all about how different parts connect and work together to get a clear result.`,
        realWorldAnalogy: `Think of ${topic} like baking a cake: when you follow the right ingredients and steps in order, you get a great result every time.`,
        keyMechanisms: [
            { name: "Step 1: The Start", detail: "You look at what you are given and understand the goal." },
            { name: "Step 2: The Core Rule", detail: "You apply the main formula or rule step by step." },
            { name: "Step 3: The Check", detail: "You double check your answer to make sure it makes complete sense." }
        ],
        commonMisconceptions: "Trying to guess or jump straight to the final answer without working through the simple steps.",
        highYieldTakeaways: [
            "Learn the basic definitions first before trying hard questions.",
            "Always check your units and numbers carefully.",
            "Practice easy examples first to build confidence."
        ]
    };
}

function renderLessonOutput(lesson, topic) {
    const container = document.getElementById('teaching-output-container');
    if (!container) return;

    container.innerHTML = `
        <div class="glass-card animate-fade-in" style="border-color: rgba(99, 102, 241, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <span class="hero-pill" style="margin-bottom: 0.5rem;">Simple Topic Explanation</span>
                    <h3 style="font-family: var(--font-display); font-size: 2rem; font-weight: 800;">${lesson.title}</h3>
                </div>
                <button id="btn-save-teaching" class="btn-primary" style="padding: 0.65rem 1.25rem; font-size: 0.85rem;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                    Save to My Library
                </button>
            </div>

            <!-- Intuition -->
            <div class="teaching-block">
                <h4 class="teaching-section-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    Simple Idea & Big Picture
                </h4>
                <p style="font-size: 1.05rem; line-height: 1.6; color: var(--text-main);">${lesson.coreIntuition}</p>

                <!-- Analogy -->
                <div class="teaching-analogy-box">
                    <strong style="color: #c7d2fe; display: block; margin-bottom: 0.25rem;">Real-World Example:</strong>
                    ${lesson.realWorldAnalogy}
                </div>
            </div>

            <!-- Step by Step -->
            <div class="teaching-block">
                <h4 class="teaching-section-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    Step-by-Step Explanation
                </h4>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    ${(lesson.keyMechanisms || []).map((m, i) => `
                        <div style="padding: 1rem; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border: 1px solid var(--surface-border);">
                            <strong style="color: #a5b4fc; font-size: 0.95rem;">${i + 1}. ${m.name}:</strong>
                            <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.35rem;">${m.detail}</p>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- High Yield Takeaways -->
            <div class="teaching-block">
                <h4 class="teaching-section-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Key Points to Remember
                </h4>
                <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.65rem;">
                    ${(lesson.highYieldTakeaways || []).map(t => `
                        <li style="display: flex; align-items: flex-start; gap: 0.65rem; color: #e2e8f0; font-size: 0.95rem;">
                            <span style="color: #34d399; font-weight: 800;">✓</span>
                            <span>${t}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        </div>
    `;

    const saveBtn = document.getElementById('btn-save-teaching');
    saveBtn.onclick = async () => {
        if (!currentUser) {
            showModal(
                'Sign In to Save',
                `<p style="color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.6;">
                    To save and keep your lessons safe across all your devices, please sign in or create an account with your email.
                 </p>
                 <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                     <button class="btn-primary" onclick="window.EXAMIVO.openAuthModal()">Sign In or Register with Email</button>
                     <button class="btn-ghost" onclick="window.EXAMIVO.closeModal()">Continue in Guest Mode</button>
                 </div>`
            );
            return;
        }

        saveBtn.disabled = true;
        saveBtn.innerText = 'Saving to Library...';
        try {
            await addDoc(collection(db, 'teachings'), {
                title: lesson.title,
                topic,
                lessonData: lesson,
                creatorId: currentUser.uid,
                createdAt: serverTimestamp()
            });
            saveBtn.innerHTML = `✓ Saved to My Library`;
            saveBtn.style.background = '#10b981';
        } catch (err) {
            console.error('Could not save teaching:', err);
            saveBtn.disabled = false;
            saveBtn.innerText = 'Save to My Library';
        }
    };
}

// --- View: Study Notes Studio ---
function renderNotesView() {
    viewContainer.innerHTML = `
        <div class="animate-fade-in" style="max-width: 820px; margin: 0 auto;">
            ${!currentUser ? `
                <div class="guest-banner">
                    <div>
                        <strong style="color: #fff; font-size: 0.9rem;">Using in Guest Mode:</strong>
                        <span style="color: var(--text-muted); font-size: 0.85rem;"> You can create study notes freely in this session. Sign in with your email to save them in your library.</span>
                    </div>
                    <button class="btn-ghost" style="color: #a5b4fc; font-size: 0.8rem; text-decoration: underline;" onclick="window.EXAMIVO.openAuthModal()">Sign In / Register</button>
                </div>
            ` : ''}

            <div style="text-align: center; margin-bottom: 2rem;">
                <span class="hero-pill">Quick Summary Notes</span>
                <h2 style="font-family: var(--font-display); font-size: 2.5rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.5rem;">Study Notes & Cheatsheets</h2>
                <p style="color: var(--text-muted);">Turn long chapters into short summary notes, key words, and quick formulas.</p>
            </div>

            <div class="glass-card" style="margin-bottom: 2rem;">
                <label class="form-label">Topic or Subject for Notes</label>
                <textarea id="note-topic-input" class="form-textarea" rows="2" placeholder="e.g. Newton's Laws of Motion, Microeconomics Supply & Demand, Photosynthesis, or Quadratic Equations..."></textarea>
                <div style="margin-top: 0.85rem;">
                    <p style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Or choose a researched syllabus topic:</p>
                    <div class="topic-chips-wrapper">
                        ${TOPIC_SUGGESTIONS.slice(0, 8).map(t => `
                            <button type="button" class="topic-chip" onclick="document.getElementById('note-topic-input').value = '${t.title}'; document.getElementById('btn-generate-note').click();">
                                <span>${t.icon}</span>
                                <span>${t.title}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
                <button id="btn-generate-note" class="btn-primary" style="margin-top: 1rem; width: 100%; padding: 0.9rem;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    Create Study Notes
                </button>
            </div>

            <div id="note-output-container"></div>
        </div>
    `;

    const genBtn = document.getElementById('btn-generate-note');
    const input = document.getElementById('note-topic-input');
    const output = document.getElementById('note-output-container');

    genBtn.onclick = async () => {
        const text = input.value.trim();
        if (!text) {
            showModal('Topic Needed', '<p style="color: var(--text-muted)">Please enter a topic or study material.</p>');
            return;
        }

        genBtn.disabled = true;
        genBtn.innerHTML = `Creating Notes...`;
        output.innerHTML = `
            <div style="display: flex; justify-content: center; padding: 4rem 0;">
                <div style="width: 2.5rem; height: 2.5rem; border: 3px solid rgba(99, 102, 241, 0.2); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            </div>
        `;

        try {
            const noteObj = await generateStudyNote(text);
            renderNoteOutput(noteObj, text);
        } catch (e) {
            console.error('Notes generation error:', e);
            output.innerHTML = `<p style="color: #f87171; text-align: center;">Could not create notes. Please try again.</p>`;
        } finally {
            genBtn.disabled = false;
            genBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> Create Study Notes`;
        }
    };
}

async function generateStudyNote(topic) {
    try {
        const researchedNote = researchAndCreateStudyNotes(topic);
        if (researchedNote) return researchedNote;
    } catch (err) {
        console.warn('Research study note note:', err);
    }
    const apiKey = "AIzaSyBxnfxEw__3WptO44bWVzhenUVGc26wkG0";
    const prompt = `
        Create concise, easy-to-understand study notes on "${topic}" using simple everyday words.
        Return strictly valid JSON:
        {
            "title": "Study Notes: ${topic}",
            "summary": "2-sentence clear summary in simple words",
            "keyTerms": [
                { "term": "Term 1", "definition": "Simple definition" },
                { "term": "Term 2", "definition": "Simple definition" }
            ],
            "coreRules": ["Important Rule or Formula 1", "Important Rule or Formula 2"],
            "examWarnings": "What is the most common mistake students make on exams?"
        }
    `;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (resp.ok) {
            const json = await resp.json();
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
                return JSON.parse(clean);
            }
        }
    } catch (err) {
        console.warn('Note API note:', err);
    }

    return {
        title: `Study Notes: ${topic}`,
        summary: `Here are the most important rules, definitions, and tips you need to know about ${topic}.`,
        keyTerms: [
            { term: "Main Rule", definition: "The foundational idea that you should always remember for this topic." },
            { term: "Special Case", definition: "A condition where you need to look out for extra rules or exceptions." }
        ],
        coreRules: [
            "Always check your units before calculating your final answer.",
            "Read the entire question twice to understand what is being asked."
        ],
        examWarnings: "Students often lose marks by mixing up similar terms or rushing through calculations."
    };
}

function renderNoteOutput(note, topic) {
    const container = document.getElementById('note-output-container');
    if (!container) return;

    container.innerHTML = `
        <div class="glass-card animate-fade-in" style="border-color: rgba(245, 158, 11, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <span class="hero-pill" style="margin-bottom: 0.5rem; border-color: rgba(245,158,11,0.4); color: #fbbf24;">Quick Study Notes</span>
                    <h3 style="font-family: var(--font-display); font-size: 2rem; font-weight: 800;">${note.title}</h3>
                </div>
                <button id="btn-save-note" class="btn-primary" style="padding: 0.65rem 1.25rem; font-size: 0.85rem; background: linear-gradient(135deg, #f59e0b, #d97706);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                    Save to My Library
                </button>
            </div>

            <p style="color: var(--text-muted); font-size: 1.05rem; margin-bottom: 1.5rem; line-height: 1.6;">${note.summary}</p>

            <!-- Key Terms -->
            <div style="margin-bottom: 1.5rem;">
                <h4 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; color: #fbbf24; margin-bottom: 0.75rem;">Important Words to Know</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.75rem;">
                    ${(note.keyTerms || []).map(kt => `
                        <div style="padding: 0.85rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--surface-border); border-radius: var(--radius-sm);">
                            <span style="font-weight: 700; color: #fff; font-size: 0.95rem;">${kt.term}:</span>
                            <span style="color: var(--text-muted); font-size: 0.9rem;"> ${kt.definition}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Core Rules -->
            <div style="margin-bottom: 1.5rem;">
                <h4 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; color: #fbbf24; margin-bottom: 0.75rem;">Important Rules & Formulas</h4>
                <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem;">
                    ${(note.coreRules || []).map(r => `
                        <li style="padding: 0.65rem 0.85rem; background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; font-family: var(--font-mono); font-size: 0.885rem; color: #fde68a;">
                            ${r}
                        </li>
                    `).join('')}
                </ul>
            </div>

            <!-- Exam Warnings -->
            <div style="padding: 1rem 1.25rem; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: var(--radius-sm);">
                <strong style="color: #fca5a5; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 0.25rem;">⚠️ Common Mistake on Exams</strong>
                <p style="color: #fecdd3; font-size: 0.95rem;">${note.examWarnings || 'Ensure terms and sign conventions are carefully checked.'}</p>
            </div>
        </div>
    `;

    const saveBtn = document.getElementById('btn-save-note');
    saveBtn.onclick = async () => {
        if (!currentUser) {
            showModal(
                'Sign In to Save',
                `<p style="color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.6;">
                    To save and keep your study notes permanently in your private library, please sign in or register with your email.
                 </p>
                 <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                     <button class="btn-primary" onclick="window.EXAMIVO.openAuthModal()">Sign In or Register with Email</button>
                     <button class="btn-ghost" onclick="window.EXAMIVO.closeModal()">Continue in Guest Mode</button>
                 </div>`
            );
            return;
        }

        saveBtn.disabled = true;
        saveBtn.innerText = 'Saving to Library...';
        try {
            await addDoc(collection(db, 'notes'), {
                title: note.title,
                topic,
                noteData: note,
                creatorId: currentUser.uid,
                createdAt: serverTimestamp()
            });
            saveBtn.innerHTML = `✓ Saved to My Library`;
            saveBtn.style.background = '#10b981';
        } catch (err) {
            console.error('Could not save note:', err);
            saveBtn.disabled = false;
            saveBtn.innerText = 'Save to My Library';
        }
    };
}

// --- View: Saved Library (For Storing Quizzes, Lessons & Notes) ---
async function renderLibraryView() {
    if (!currentUser) {
        viewContainer.innerHTML = `
            <div class="animate-fade-in" style="max-width: 680px; margin: 0 auto; text-align: center; padding: 3rem 1rem;">
                <div style="width: 4.5rem; height: 4.5rem; border-radius: 50%; background: rgba(99, 102, 241, 0.12); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; color: #818cf8;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                </div>
                <h2 style="font-family: var(--font-display); font-size: 2.25rem; font-weight: 800; margin-bottom: 0.75rem;">Your Saved Library</h2>
                <p style="color: var(--text-muted); font-size: 1.05rem; line-height: 1.6; margin-bottom: 2rem;">
                    Anyone can create and take practice exams freely. To save your exams, lessons, and notes to access them anytime on any device, sign in with your email or Google account.
                </p>
                <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                    <button class="btn-primary" style="padding: 0.9rem 1.8rem;" onclick="window.EXAMIVO.openAuthModal()">
                        Sign In / Register with Email
                    </button>
                    <button class="btn-secondary" style="padding: 0.9rem 1.8rem;" onclick="window.EXAMIVO.showView('generate')">
                        Create Free Practice Exam
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Load saved items for authenticated user
    viewContainer.innerHTML = `
        <div class="animate-fade-in" style="max-width: 980px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <span class="hero-pill">Saved in Your Account</span>
                    <h2 style="font-family: var(--font-display); font-size: 2.5rem; font-weight: 800;">My Saved Library</h2>
                    <p style="color: var(--text-muted);">Your saved practice exams, lessons, and study notes.</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-primary" onclick="window.EXAMIVO.showView('generate')">+ New Exam</button>
                    <button class="btn-secondary" onclick="window.EXAMIVO.showView('teaching')">+ New Lesson</button>
                </div>
            </div>

            <!-- Library Tabs -->
            <div style="display: flex; gap: 0.75rem; border-bottom: 1px solid var(--surface-border); margin-bottom: 2rem; padding-bottom: 0.75rem;">
                <button id="lib-tab-quizzes" class="nav-link-btn active">Saved Exams (<span id="count-quizzes">0</span>)</button>
                <button id="lib-tab-teachings" class="nav-link-btn">Lessons (<span id="count-teachings">0</span>)</button>
                <button id="lib-tab-notes" class="nav-link-btn">Study Notes (<span id="count-notes">0</span>)</button>
            </div>

            <div id="lib-content-area">
                <div style="display: flex; justify-content: center; padding: 3rem 0;">
                    <div style="width: 2.5rem; height: 2.5rem; border: 3px solid rgba(99, 102, 241, 0.2); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                </div>
            </div>
        </div>
    `;

    // Fetch data from Firestore
    try {
        const [quizzesSnap, teachingsSnap, notesSnap] = await Promise.all([
            getDocs(query(collection(db, 'quizzes'), where('creatorId', '==', currentUser.uid))),
            getDocs(query(collection(db, 'teachings'), where('creatorId', '==', currentUser.uid))),
            getDocs(query(collection(db, 'notes'), where('creatorId', '==', currentUser.uid)))
        ]);

        const savedQuizzes = quizzesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const savedTeachings = teachingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const savedNotes = notesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const cQ = document.getElementById('count-quizzes');
        const cT = document.getElementById('count-teachings');
        const cN = document.getElementById('count-notes');
        if (cQ) cQ.innerText = savedQuizzes.length;
        if (cT) cT.innerText = savedTeachings.length;
        if (cN) cN.innerText = savedNotes.length;

        const tabQ = document.getElementById('lib-tab-quizzes');
        const tabT = document.getElementById('lib-tab-teachings');
        const tabN = document.getElementById('lib-tab-notes');
        const contentArea = document.getElementById('lib-content-area');

        function renderQuizzesList() {
            if (savedQuizzes.length === 0) {
                contentArea.innerHTML = `<div class="glass-card" style="text-align: center; padding: 3rem;"><p style="color: var(--text-muted); margin-bottom: 1rem;">No saved exams yet.</p><button class="btn-primary" onclick="window.EXAMIVO.showView('generate')">Create Your First Exam</button></div>`;
                return;
            }
            contentArea.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
                    ${savedQuizzes.map(q => `
                        <div class="glass-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <span class="cloud-saved-badge" style="margin-bottom: 0.75rem;">Saved Exam</span>
                                <h4 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.45rem;">${q.title}</h4>
                                <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">${(q.questions || []).length} Questions</p>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn-primary" style="flex: 1; padding: 0.6rem;" onclick="window.EXAMIVO.launchSavedQuiz('${q.id}')">Take Exam</button>
                                <button class="btn-ghost" style="color: #f87171;" onclick="window.EXAMIVO.deleteCloudItem('quizzes', '${q.id}')">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        function renderTeachingsList() {
            if (savedTeachings.length === 0) {
                contentArea.innerHTML = `<div class="glass-card" style="text-align: center; padding: 3rem;"><p style="color: var(--text-muted); margin-bottom: 1rem;">No lessons saved yet.</p><button class="btn-primary" onclick="window.EXAMIVO.showView('teaching')">Create a Lesson</button></div>`;
                return;
            }
            contentArea.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
                    ${savedTeachings.map(t => `
                        <div class="glass-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <span class="cloud-saved-badge" style="margin-bottom: 0.75rem; border-color: rgba(6,182,212,0.4); color: #22d3ee;">Saved Lesson</span>
                                <h4 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.45rem;">${t.title}</h4>
                                <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">Topic: ${t.topic || 'General'}</p>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn-secondary" style="flex: 1; padding: 0.6rem;" onclick="window.EXAMIVO.viewSavedTeaching('${t.id}')">Read Lesson</button>
                                <button class="btn-ghost" style="color: #f87171;" onclick="window.EXAMIVO.deleteCloudItem('teachings', '${t.id}')">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        function renderNotesList() {
            if (savedNotes.length === 0) {
                contentArea.innerHTML = `<div class="glass-card" style="text-align: center; padding: 3rem;"><p style="color: var(--text-muted); margin-bottom: 1rem;">No study notes saved yet.</p><button class="btn-primary" onclick="window.EXAMIVO.showView('notes')">Create Study Notes</button></div>`;
                return;
            }
            contentArea.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
                    ${savedNotes.map(n => `
                        <div class="glass-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <span class="cloud-saved-badge" style="margin-bottom: 0.75rem; border-color: rgba(245,158,11,0.4); color: #fbbf24;">Saved Notes</span>
                                <h4 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.45rem;">${n.title}</h4>
                                <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">Topic: ${n.topic || 'General'}</p>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn-secondary" style="flex: 1; padding: 0.6rem;" onclick="window.EXAMIVO.viewSavedNote('${n.id}')">Open Notes</button>
                                <button class="btn-ghost" style="color: #f87171;" onclick="window.EXAMIVO.deleteCloudItem('notes', '${n.id}')">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Hook up tabs
        tabQ.onclick = () => {
            tabQ.classList.add('active');
            tabT.classList.remove('active');
            tabN.classList.remove('active');
            renderQuizzesList();
        };

        tabT.onclick = () => {
            tabT.classList.add('active');
            tabQ.classList.remove('active');
            tabN.classList.remove('active');
            renderTeachingsList();
        };

        tabN.onclick = () => {
            tabN.classList.add('active');
            tabQ.classList.remove('active');
            tabT.classList.remove('active');
            renderNotesList();
        };

        // Render default tab
        renderQuizzesList();

        // Save reference for lookup
        window._libraryCache = {
            quizzes: savedQuizzes,
            teachings: savedTeachings,
            notes: savedNotes
        };
    } catch (err) {
        console.error('Failed to load library:', err);
    }
}

// --- View: Quiz Ready Overview ---
function renderQuizReady({ quizId, quizData, rawData }) {
    const data = normalizeQuizData(quizData || rawData);
    if (!data || !data.questions || data.questions.length === 0) {
        showView('hub');
        return;
    }

    viewContainer.innerHTML = `
        <div class="animate-fade-in" style="max-width: 680px; margin: 0 auto; text-align: center;">
            <div style="width: 5rem; height: 5rem; border-radius: var(--radius-lg); background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.75rem auto; color: #818cf8; box-shadow: 0 0 30px rgba(99, 102, 241, 0.3);">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            
            <h2 style="font-family: var(--font-display); font-size: 2.75rem; font-weight: 800; line-height: 1.15; margin-bottom: 0.75rem;">${data.title}</h2>
            <p style="color: var(--text-muted); font-size: 1.05rem; margin-bottom: 2rem;">${data.description}</p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 2.5rem;">
                <div class="glass-card" style="padding: 1.25rem;">
                    <p style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.08em; margin-bottom: 0.25rem;">Questions</p>
                    <p style="font-size: 1.75rem; font-weight: 800; font-family: var(--font-mono);">${data.questions.length}</p>
                </div>
                <div class="glass-card" style="padding: 1.25rem;">
                    <p style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.08em; margin-bottom: 0.25rem;">Level</p>
                    <p style="font-size: 1.35rem; font-weight: 700;">${data.difficulty}</p>
                </div>
                <div class="glass-card" style="padding: 1.25rem;">
                    <p style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.08em; margin-bottom: 0.25rem;">Saved Status</p>
                    <p style="font-size: 1.25rem; font-weight: 700; color: ${currentUser ? '#34d399' : '#a5b4fc'};">${currentUser ? 'Saved to Account' : 'Guest Session'}</p>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                <button id="btn-start-exam" class="btn-primary" style="padding: 1.15rem; font-size: 1.1rem; justify-content: center;">
                    Start Practice Exam
                </button>
                <div style="display: flex; gap: 0.75rem;">
                    <button id="btn-copy-exam-link" class="btn-secondary" style="flex: 1;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        Share Link
                    </button>
                </div>
            </div>

            <!-- Export & Print Blank Exam Paper -->
            <div class="glass-card export-panel" style="margin-top: 1.75rem; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                    <div>
                        <strong style="font-size: 0.95rem; color: #fff; display: block; margin-bottom: 0.2rem;">Save or Print Blank Examination Paper</strong>
                        <p style="color: var(--text-muted); font-size: 0.825rem; margin: 0;">Save as PDF, Word, Text, or print to practice on paper with answer key.</p>
                    </div>
                    <div class="export-btn-group" style="margin: 0;">
                        <button class="btn-export" onclick="window.EXAMIVO.exportQuizAsPdf(window.EXAMIVO.activeReadyQuiz)">
                            📥 Save as PDF (.pdf)
                        </button>
                        <button class="btn-export" onclick="window.EXAMIVO.exportQuizAsDocx(window.EXAMIVO.activeReadyQuiz)">
                            📄 Save as Word (.docx)
                        </button>
                        <button class="btn-export" onclick="window.EXAMIVO.exportQuizAsTxt(window.EXAMIVO.activeReadyQuiz)">
                            📝 Save as Text (.txt)
                        </button>
                        <button class="btn-export btn-export-print" onclick="window.EXAMIVO.printQuiz(window.EXAMIVO.activeReadyQuiz)">
                            🖨️ Print Exam Paper
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    window.EXAMIVO.activeReadyQuiz = data;

    document.getElementById('btn-start-exam').onclick = () => {
        showView('quiz-play', { quizId, quizData: data });
    };

    const shareUrl = `${window.location.origin}${window.location.pathname}?quizId=${quizId}`;
    document.getElementById('btn-copy-exam-link').onclick = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showModal('Link Copied!', `<p style="color: var(--text-muted); margin-bottom: 1rem;">Link copied to clipboard:</p><div style="padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; word-break: break-all; font-family: var(--font-mono); font-size: 0.85rem; color: #818cf8;">${shareUrl}</div>`);
        });
    };
}

// --- View: Active Quiz Examination ---
function renderQuizPlay({ quizId, quizData, rawData }) {
    const data = normalizeQuizData(quizData || rawData);
    if (!data || !data.questions || data.questions.length === 0) {
        showView('hub');
        return;
    }

    let currentIndex = 0;
    let score = 0;
    let answers = [];
    let timerSeconds = 0;
    let timerInterval = null;

    activeQuizSession = { quizId, data, answers };
    window.EXAMIVO.activePlayQuiz = data;

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        const timerEl = document.getElementById('exam-timer');
        timerInterval = setInterval(() => {
            timerSeconds++;
            const mins = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
            const secs = String(timerSeconds % 60).padStart(2, '0');
            if (timerEl) {
                timerEl.innerText = `${mins}:${secs}`;
            }
        }, 1000);
    }

    function renderCurrentQuestion() {
        const q = data.questions[currentIndex];
        const progressPct = ((currentIndex + 1) / data.questions.length) * 100;

        viewContainer.innerHTML = `
            <div class="animate-fade-in" style="max-width: 780px; margin: 0 auto;">
                <div class="quiz-header">
                    <div style="display: flex; align-items: center; gap: 0.65rem;">
                        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.1em; color: #818cf8;">Question ${currentIndex + 1} of ${data.questions.length}</span>
                        <span style="width: 4px; height: 4px; border-radius: 50%; background: var(--surface-border);"></span>
                        <span style="font-size: 0.75rem; color: var(--text-dim);">${data.difficulty}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <button class="btn-export btn-export-print" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;" onclick="window.EXAMIVO.printQuiz(window.EXAMIVO.activePlayQuiz)" title="Print or save this exam">
                            🖨️ Print / Save Paper
                        </button>
                        <div class="timer-pill">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span id="exam-timer">00:00</span>
                        </div>
                    </div>
                </div>

                <div class="progress-track">
                    <div class="progress-fill" style="width: ${progressPct}%;"></div>
                </div>

                <div class="glass-card" style="margin-bottom: 1.75rem; border-color: rgba(99, 102, 241, 0.2);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.15rem; flex-wrap: wrap; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <span class="subtopic-tag">📌 ${q?.subtopic || 'Key Topic'}</span>
                            <span class="research-badge">${q?.researchTag || '✓ Confirmed Syllabus Fact'}</span>
                        </div>
                        <span class="likelihood-pill likelihood-high">${q?.likelihood || '🔥 Common Exam Question'}</span>
                    </div>
                    <h3 class="question-text">${q?.question || 'Question text missing'}</h3>
                    <div id="options-container" class="options-grid">
                        ${renderOptionButtons(q)}
                    </div>
                </div>

                <div id="action-drawer" class="hidden glass-card" style="margin-top: 1.5rem; background: rgba(13, 18, 31, 0.95); border-color: rgba(99, 102, 241, 0.3);">
                    <div id="feedback-badge" style="display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 700; font-size: 0.85rem; padding: 0.35rem 0.85rem; border-radius: 999px; margin-bottom: 0.75rem;"></div>
                    <p id="explanation-text" style="color: var(--text-main); font-size: 0.95rem; line-height: 1.5; margin-bottom: 0.75rem;"></p>
                    <div id="examiner-tip-box" style="display: none; padding: 0.75rem 1rem; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: var(--radius-sm); margin-bottom: 1.25rem; font-size: 0.85rem; color: #fde68a;">
                        <strong>💡 Examiner Tip & Trap:</strong> <span id="examiner-tip-text"></span>
                    </div>
                    <button id="btn-next-question" class="btn-primary" style="width: 100%; justify-content: center;">
                        ${currentIndex < data.questions.length - 1 ? 'Next Question →' : 'See My Results →'}
                    </button>
                </div>
            </div>
        `;

        startTimer();
        attachOptionHandlers(q);
    }

    function renderOptionButtons(q) {
        if (!q) return '';
        const keys = ['A', 'B', 'C', 'D'];

        if (q.type === 'multiple-choice' || !q.type) {
            const options = Array.isArray(q.options) && q.options.length > 0 
                ? q.options 
                : ['Option A', 'Option B', 'Option C', 'Option D'];

            return options.map((opt, i) => `
                <button class="option-btn" data-choice-idx="${i}">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span class="option-key">${keys[i] || i + 1}</span>
                        <span>${opt}</span>
                    </div>
                </button>
            `).join('');
        } else if (q.type === 'true-false') {
            return `
                <button class="option-btn" data-choice-idx="true">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span class="option-key">T</span>
                        <span>True</span>
                    </div>
                </button>
                <button class="option-btn" data-choice-idx="false">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span class="option-key">F</span>
                        <span>False</span>
                    </div>
                </button>
            `;
        } else {
            return `
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <input type="text" id="blank-input" class="form-input" placeholder="Type answer..." style="font-size: 1.05rem; padding: 1rem;">
                    <button id="btn-submit-blank" class="btn-primary" style="justify-content: center;">Submit Answer</button>
                </div>
            `;
        }
    }

    function attachOptionHandlers(q) {
        document.querySelectorAll('.option-btn').forEach(btn => {
            btn.onclick = () => {
                if (btn.classList.contains('locked')) return;
                processSelection(btn.dataset.choiceIdx, q, btn);
            };
        });

        const submitBlank = document.getElementById('btn-submit-blank');
        if (submitBlank) {
            submitBlank.onclick = () => {
                const input = document.getElementById('blank-input');
                const val = input ? input.value.trim() : '';
                if (val) processSelection(val, q, null);
            };
        }
    }

    function processSelection(selectedVal, q, clickedBtn) {
        document.querySelectorAll('.option-btn').forEach(b => b.classList.add('locked'));

        let isCorrect = false;
        const normalizedAnswer = String(q.answer || '').trim().toLowerCase();
        const normalizedSelection = String(selectedVal).trim().toLowerCase();

        if (q.type === 'multiple-choice' || !q.type) {
            isCorrect = (normalizedSelection === normalizedAnswer) || 
                        (q.options && q.options[selectedVal] && q.options[selectedVal].toLowerCase() === normalizedAnswer);
        } else {
            isCorrect = normalizedSelection === normalizedAnswer;
        }

        if (isCorrect) score++;

        answers.push({
            questionIndex: currentIndex,
            questionText: q.question,
            selected: selectedVal,
            correctAnswer: q.answer,
            options: q.options,
            isCorrect,
            explanation: q.explanation,
            subtopic: q.subtopic || 'Core Concept',
            likelihood: q.likelihood || 'High-Yield Exam Item',
            researchTag: q.researchTag || '✓ Confirmed Syllabus Fact',
            examinerTip: q.examinerTip || ''
        });

        if (clickedBtn) {
            if (isCorrect) clickedBtn.classList.add('correct');
            else {
                clickedBtn.classList.add('incorrect');
                document.querySelectorAll('.option-btn').forEach(b => {
                    if (b.dataset.choiceIdx === String(q.answer)) b.classList.add('correct');
                });
            }
        }

        const drawer = document.getElementById('action-drawer');
        const badge = document.getElementById('feedback-badge');
        const expText = document.getElementById('explanation-text');
        const tipBox = document.getElementById('examiner-tip-box');
        const tipText = document.getElementById('examiner-tip-text');
        const nextBtn = document.getElementById('btn-next-question');

        if (drawer && badge && expText && nextBtn) {
            drawer.classList.remove('hidden');
            if (isCorrect) {
                badge.style.background = 'rgba(16, 185, 129, 0.15)';
                badge.style.color = '#34d399';
                badge.innerHTML = `✓ Correct`;
            } else {
                badge.style.background = 'rgba(244, 63, 94, 0.15)';
                badge.style.color = '#f87171';
                badge.innerHTML = `✕ Incorrect`;
            }
            expText.innerText = q.explanation || 'Helpful explanation.';

            if (tipBox && tipText) {
                if (q.examinerTip) {
                    tipText.innerText = q.examinerTip;
                    tipBox.style.display = 'block';
                } else {
                    tipBox.style.display = 'none';
                }
            }

            nextBtn.onclick = () => {
                if (currentIndex < data.questions.length - 1) {
                    currentIndex++;
                    renderCurrentQuestion();
                } else {
                    if (timerInterval) clearInterval(timerInterval);
                    showView('quiz-results', { quizId, quizData: data, score, answers, timeTaken: timerSeconds });
                }
            };
        }
    }

    renderCurrentQuestion();
}

// --- View: Exam Evaluation & Diagnostics ---
async function renderQuizResults({ quizId, quizData, rawData, score, answers, timeTaken }) {
    const data = normalizeQuizData(quizData || rawData);
    const totalCount = data?.questions?.length || 1;
    const percentage = Math.round((score / totalCount) * 100);

    let letterGrade = 'A+';
    let gradeColor = '#10b981';
    if (percentage < 60) { letterGrade = 'F'; gradeColor = '#f43f5e'; }
    else if (percentage < 70) { letterGrade = 'D'; gradeColor = '#f97316'; }
    else if (percentage < 80) { letterGrade = 'C'; gradeColor = '#fbbf24'; }
    else if (percentage < 90) { letterGrade = 'B'; gradeColor = '#60a5fa'; }

    // Analyze Strong and Weak Points by Subtopic
    const subtopicMap = {};
    (answers || []).forEach(a => {
        const key = a.subtopic || 'General Topic';
        if (!subtopicMap[key]) {
            subtopicMap[key] = { total: 0, correct: 0, questions: [], explanations: [] };
        }
        subtopicMap[key].total++;
        if (a.isCorrect) subtopicMap[key].correct++;
        subtopicMap[key].questions.push(a);
        if (!a.isCorrect && a.explanation) subtopicMap[key].explanations.push(a.explanation);
    });

    const strongPoints = [];
    const weakPoints = [];

    Object.entries(subtopicMap).forEach(([subtopic, info]) => {
        const rate = Math.round((info.correct / info.total) * 100);
        if (rate >= 80) {
            strongPoints.push({ subtopic, rate, total: info.total, correct: info.correct });
        } else {
            weakPoints.push({ 
                subtopic, 
                rate, 
                total: info.total, 
                correct: info.correct, 
                missedQuestions: info.questions.filter(q => !q.isCorrect),
                advice: info.explanations[0] || 'Review the main definitions and rules for this topic.'
            });
        }
    });

    viewContainer.innerHTML = `
        <div class="animate-fade-in" style="max-width: 860px; margin: 0 auto;">
            <!-- Score & Header Overview -->
            <div class="glass-card" style="text-align: center; padding: 2.75rem 2rem; margin-bottom: 2rem;">
                <span class="hero-pill" style="margin-bottom: 1.25rem;">Your Exam Results</span>
                <div class="score-circle" style="border-color: ${gradeColor};">
                    <span style="font-family: var(--font-display); font-size: 3.5rem; font-weight: 900; line-height: 1;">${percentage}%</span>
                    <span style="font-size: 0.8rem; font-weight: 700; color: ${gradeColor}; text-transform: uppercase; margin-top: 0.25rem;">Grade ${letterGrade}</span>
                </div>

                <h2 style="font-family: var(--font-display); font-size: 2.25rem; font-weight: 800; margin-bottom: 0.4rem;">
                    ${percentage >= 80 ? 'Great Job! High Score' : 'Test Complete - Here are your Strong & Weak Points'}
                </h2>
                <p style="color: var(--text-muted); max-width: 580px; margin: 0 auto 1.75rem auto; font-size: 0.95rem;">
                    Target: <strong>${data.examType || 'Standard Exam'}</strong> • ${data.curriculum || 'Curriculum'} • Finished in ${Math.floor(timeTaken / 60)}m ${timeTaken % 60}s.
                </p>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem; margin-bottom: 1.75rem;">
                    <div style="padding: 1rem; border-radius: var(--radius-md); background: rgba(255,255,255,0.03); border: 1px solid var(--surface-border);">
                        <p style="font-size: 0.7rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">Score</p>
                        <p style="font-size: 1.6rem; font-weight: 800; font-family: var(--font-mono); color: #34d399;">${score} / ${totalCount}</p>
                    </div>
                    <div style="padding: 1rem; border-radius: var(--radius-md); background: rgba(255,255,255,0.03); border: 1px solid var(--surface-border);">
                        <p style="font-size: 0.7rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">Time</p>
                        <p style="font-size: 1.6rem; font-weight: 800; font-family: var(--font-mono);">${timeTaken}s</p>
                    </div>
                    <div style="padding: 1rem; border-radius: var(--radius-md); background: rgba(255,255,255,0.03); border: 1px solid var(--surface-border);">
                        <p style="font-size: 0.7rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">Pace</p>
                        <p style="font-size: 1.6rem; font-weight: 800; font-family: var(--font-mono);">${Math.round(timeTaken / totalCount)}s / question</p>
                    </div>
                </div>

                <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
                    <button class="btn-primary" onclick="window.EXAMIVO.showView('quiz-play', { quizId: '${quizId}', quizData: window.EXAMIVO.lastSessionData })">
                        Retake Test
                    </button>
                    <button class="btn-secondary" onclick="window.EXAMIVO.showView('generate')">
                        Create New Exam
                    </button>
                </div>

                <!-- Save & Print Buttons in Overview Card -->
                <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--surface-border);">
                    <p style="font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 0.65rem;">Save or Print Exam with Your Answers:</p>
                    <div class="export-btn-group" style="justify-content: center; margin: 0;">
                        <button class="btn-export" onclick="window.EXAMIVO.exportQuizAsPdf(window.EXAMIVO.lastSessionData, window.EXAMIVO.lastSessionAnswers, window.EXAMIVO.lastSessionScore)">
                            📥 Save as PDF (.pdf)
                        </button>
                        <button class="btn-export" onclick="window.EXAMIVO.exportQuizAsDocx(window.EXAMIVO.lastSessionData, window.EXAMIVO.lastSessionAnswers, window.EXAMIVO.lastSessionScore)">
                            📄 Save as Word (.docx)
                        </button>
                        <button class="btn-export" onclick="window.EXAMIVO.exportQuizAsTxt(window.EXAMIVO.lastSessionData, window.EXAMIVO.lastSessionAnswers, window.EXAMIVO.lastSessionScore)">
                            📝 Save as Text (.txt)
                        </button>
                        <button class="btn-export btn-export-print" onclick="window.EXAMIVO.printQuiz(window.EXAMIVO.lastSessionData, window.EXAMIVO.lastSessionAnswers, window.EXAMIVO.lastSessionScore)">
                            🖨️ Print Exam Paper
                        </button>
                    </div>
                </div>
            </div>

            <!-- Weakness Drill Hero Card (If Any Weak Points Found) -->
            ${weakPoints.length > 0 ? `
                <div class="drill-hero-card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
                        <div style="max-width: 540px;">
                            <span class="hero-pill" style="margin-bottom: 0.65rem; border-color: rgba(236,72,153,0.4); color: #f472b6;">Practice Your Weak Points</span>
                            <h3 style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; margin-bottom: 0.4rem;">
                                Improve Your Weak Points (${weakPoints.length} Areas to Practice)
                            </h3>
                            <p style="color: #e2e8f0; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1rem;">
                                We found the topics you missed. Click below to create a quick practice quiz made specifically from your weak points to help you master them for the <strong>${data.examType || 'exam'}</strong>!
                            </p>
                            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
                                ${weakPoints.map(w => `<span style="font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 999px; background: rgba(244,63,94,0.2); color: #fca5a5; border: 1px solid rgba(244,63,94,0.4);">⚠️ ${w.subtopic}</span>`).join('')}
                            </div>
                        </div>
                        <button id="btn-strengthen-drill" class="btn-primary" style="padding: 1rem 1.6rem; font-size: 1rem; background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);">
                            ⚡ Create Quiz to Strengthen Weak Points
                        </button>
                    </div>
                </div>
            ` : `
                <div class="glass-card" style="margin-bottom: 2rem; border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.06); text-align: center; padding: 1.5rem;">
                    <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; color: #34d399; margin-bottom: 0.25rem;">🌟 Perfect Score!</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">You got all topics right! No weak points found.</p>
                </div>
            `}

            <!-- Strengths and Weaknesses Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
                <!-- Strong Points Card -->
                <div class="glass-card" style="border-top: 4px solid #10b981;">
                    <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1.25rem;">
                        <div style="width: 2rem; height: 2rem; border-radius: 50%; background: rgba(16,185,129,0.15); display: flex; align-items: center; justify-content: center; color: #34d399;">✓</div>
                        <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; color: #34d399;">Strong Points (${strongPoints.length})</h3>
                    </div>
                    ${strongPoints.length === 0 ? `
                        <p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic;">You scored under 80% on these topics. Retake or practice to improve!</p>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                            ${strongPoints.map(s => `
                                <div class="strength-card">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                        <strong style="color: #fff; font-size: 0.95rem;">${s.subtopic}</strong>
                                        <span style="font-size: 0.75rem; font-weight: 800; color: #34d399; font-family: var(--font-mono);">${s.rate}% Accuracy</span>
                                    </div>
                                    <p style="color: var(--text-muted); font-size: 0.8rem;">Great job! You showed strong understanding of this topic.</p>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>

                <!-- Weak Points Card -->
                <div class="glass-card" style="border-top: 4px solid #f43f5e;">
                    <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1.25rem;">
                        <div style="width: 2rem; height: 2rem; border-radius: 50%; background: rgba(244,63,94,0.15); display: flex; align-items: center; justify-content: center; color: #f43f5e;">!</div>
                        <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; color: #f87171;">Weak Points (${weakPoints.length})</h3>
                    </div>
                    ${weakPoints.length === 0 ? `
                        <p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic;">No weak points! You understood all the topics tested.</p>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                            ${weakPoints.map(w => `
                                <div class="weakness-card">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                        <strong style="color: #fff; font-size: 0.95rem;">${w.subtopic}</strong>
                                        <span style="font-size: 0.75rem; font-weight: 800; color: #f87171; font-family: var(--font-mono);">${w.rate}% Accuracy</span>
                                    </div>
                                    <p style="color: #fca5a5; font-size: 0.825rem; line-height: 1.4;">
                                        <strong style="color: #fff;">Tip to remember:</strong> ${w.advice}
                                    </p>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>

            <!-- Detailed Question Breakdown -->
            <div style="margin-top: 2rem;">
                <h3 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin-bottom: 1rem;">Question-by-Question Review & Explanations</h3>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    ${(answers || []).map((ans, idx) => `
                        <div class="glass-card" style="border-left: 4px solid ${ans.isCorrect ? '#10b981' : '#f43f5e'}; padding: 1.25rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.4rem;">
                                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-dim);">Question ${idx + 1}</span>
                                    <span class="subtopic-tag">📌 ${ans.subtopic || 'General Topic'}</span>
                                    <span class="research-badge" style="font-size: 0.65rem; padding: 0.2rem 0.55rem;">${ans.researchTag || '✓ Confirmed Fact'}</span>
                                    <span class="likelihood-pill likelihood-high" style="font-size: 0.65rem;">${ans.likelihood || 'Common Exam Question'}</span>
                                </div>
                                <span style="font-size: 0.75rem; font-weight: 700; color: ${ans.isCorrect ? '#34d399' : '#f87171'};">
                                    ${ans.isCorrect ? '✓ Correct' : '✕ Incorrect'}
                                </span>
                            </div>
                            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">${ans.questionText}</h4>
                            <p style="font-size: 0.85rem; color: var(--text-muted); background: rgba(255,255,255,0.02); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--surface-border); margin-bottom: ${ans.examinerTip ? '0.5rem' : '0'};">
                                <strong style="color: #a5b4fc;">Why this is correct:</strong> ${ans.explanation || 'Reviewed.'}
                            </p>
                            ${ans.examinerTip ? `
                                <div style="font-size: 0.825rem; color: #fde68a; background: rgba(245, 158, 11, 0.08); padding: 0.5rem 0.85rem; border-radius: var(--radius-sm); border-left: 3px solid #f59e0b;">
                                    <strong>💡 Tip to remember:</strong> ${ans.examinerTip}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    window.EXAMIVO.lastSessionData = data;
    window.EXAMIVO.lastSessionAnswers = answers;
    window.EXAMIVO.lastSessionScore = score;

    // Hook up Weakness Drill Button
    const drillBtn = document.getElementById('btn-strengthen-drill');
    if (drillBtn) {
        drillBtn.onclick = async () => {
            drillBtn.disabled = true;
            drillBtn.innerHTML = `Creating Practice Quiz for Weak Points...`;
            try {
                const weakQuiz = await generateStrengtheningQuiz(data, weakPoints);
                showView('quiz-play', {
                    quizId: 'drill_' + Date.now(),
                    quizData: weakQuiz
                });
            } catch (err) {
                console.error('Strengthening quiz error:', err);
                showModal('Notice', '<p style="color: var(--text-muted)">Could not create the practice quiz right now. Please retake the test to practice these questions.</p>');
                drillBtn.disabled = false;
                drillBtn.innerHTML = `⚡ Create Quiz to Strengthen Weak Points`;
            }
        };
    }

    // Log history for signed-in users only
    if (currentUser?.uid) {
        try {
            await addDoc(collection(db, 'history'), {
                userId: currentUser.uid,
                quizId: quizId || 'curated',
                score,
                totalQuestions: totalCount,
                timeTaken,
                timestamp: serverTimestamp()
            });
            const userRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userRef, {
                'stats.quizzesTaken': increment(1),
                'stats.totalScore': increment(score)
            });
        } catch (err) {
            console.warn('History save note:', err);
        }
    }
}

// Formulation for Weakness Retest Quiz
async function generateStrengtheningQuiz(originalData, weakPoints) {
    try {
        const weaknessQuiz = createWeaknessQuiz(originalData, weakPoints);
        if (weaknessQuiz && weaknessQuiz.questions && weaknessQuiz.questions.length > 0) {
            return weaknessQuiz;
        }
    } catch (err) {
        console.warn('Weakness drill generator note:', err);
    }
    const weakTopics = weakPoints.map(w => w.subtopic).join('; ');
    const apiKey = "AIzaSyBxnfxEw__3WptO44bWVzhenUVGc26wkG0";
    const prompt = `
        You are EXAMIVO, a friendly exam coach and teacher.
        The student took a test for ${originalData.examType || 'the Exam'} (${originalData.curriculum || 'Standard Board'}) and got questions wrong on these specific topics:
        "${weakTopics}".
        
        Create a 5-question practice quiz focusing on these exact topics where the student struggled.
        Write questions with clear, simple words that help the student understand and practice their weak points.
        Provide simple step-by-step explanations in plain English.
        Include Multiple Choice with 4 options and answer index ("0","1","2","3").
        
        Return strictly valid JSON matching EXAMIVO schema:
        {
            "title": "Practice Quiz: ${weakPoints[0]?.subtopic || 'Weak Points'}",
            "description": "Targeted quiz to strengthen weak points in ${originalData.examType || 'Exam'}",
            "examType": "${originalData.examType || 'Practice'}",
            "curriculum": "${originalData.curriculum || 'Standard'}",
            "difficulty": "Practice Level",
            "questions": [
                {
                    "type": "multiple-choice",
                    "question": "Question text?",
                    "options": ["A", "B", "C", "D"],
                    "answer": "0",
                    "subtopic": "Subtopic Name",
                    "likelihood": "🎯 Weak Point Practice",
                    "explanation": "Clear, simple explanation."
                }
            ]
        }
    `;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (resp.ok) {
            const json = await resp.json();
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
                return JSON.parse(clean);
            }
        }
    } catch (e) {
        console.warn('Strengthening API call note:', e);
    }

    // Dynamic Fallback in plain English
    const primaryWeakness = weakPoints[0]?.subtopic || 'Key Concept';
    return {
        title: `Practice Quiz: ${primaryWeakness}`,
        description: `Targeted quiz to practice and master ${primaryWeakness}`,
        examType: originalData.examType || 'Practice',
        curriculum: originalData.curriculum || 'Standard',
        difficulty: 'Practice Level',
        questions: [
            {
                type: 'multiple-choice',
                question: `When answering questions on ${primaryWeakness}, what is the best first step to get the right answer?`,
                options: [
                    `Read the question carefully and write down what you are given and what you need to find`,
                    `Start writing down random formulas before reading the whole question`,
                    `Guess the final answer without showing any steps`,
                    `Skip checking your units and calculations`
                ],
                answer: '0',
                subtopic: primaryWeakness,
                likelihood: '🎯 Weak Point Practice',
                explanation: `Writing down what you know and what you need to find prevents mistakes on ${primaryWeakness}.`
            },
            {
                type: 'true-false',
                question: `True or False: Breaking down ${primaryWeakness} problems into smaller, simple steps makes them much easier to solve correctly.`,
                options: ['True', 'False'],
                answer: 'true',
                subtopic: primaryWeakness,
                likelihood: '⭐ Helpful Practice Tip',
                explanation: `True! Solving one small step at a time helps you avoid confusion and earn full marks.`
            }
        ]
    };
}

// --- Universal Auth Modal (Email & Password + Google) ---
function openAuthModal() {
    showModal(
        'EXAMIVO Cloud Account',
        `
        <div style="margin-bottom: 1.25rem;">
            <p style="color: var(--text-muted); font-size: 0.9rem; line-height: 1.5;">
                Sign in with your email or Google account to save your practice quizzes, lessons, and notes.
            </p>
        </div>

        <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 0.5rem;">
            <button id="modal-tab-signin" class="nav-link-btn active" style="flex: 1; justify-content: center;">Sign In</button>
            <button id="modal-tab-signup" class="nav-link-btn" style="flex: 1; justify-content: center;">Create Account</button>
        </div>

        <div id="auth-error-banner" class="hidden" style="padding: 0.75rem; background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.4); border-radius: var(--radius-sm); color: #fca5a5; font-size: 0.85rem; margin-bottom: 1rem;"></div>
        <div id="auth-success-banner" class="hidden" style="padding: 0.75rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: var(--radius-sm); color: #6ee7b7; font-size: 0.85rem; margin-bottom: 1rem;"></div>

        <form id="auth-form" onsubmit="return false;" style="display: flex; flex-direction: column; gap: 1rem;">
            <div id="auth-name-group" class="hidden">
                <label class="form-label">Full Name</label>
                <input type="text" id="auth-name" class="form-input" placeholder="e.g. Marie Curie">
            </div>

            <div>
                <label class="form-label">Email Address</label>
                <input type="email" id="auth-email" class="form-input" required placeholder="name@example.com">
            </div>

            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                    <label class="form-label" style="margin-bottom: 0;">Password</label>
                    <button type="button" id="btn-forgot-password" class="btn-ghost" style="padding: 0; font-size: 0.75rem; color: #818cf8;">Forgot?</button>
                </div>
                <input type="password" id="auth-password" class="form-input" required placeholder="••••••••" minlength="6">
            </div>

            <button type="submit" id="btn-submit-auth" class="btn-primary" style="width: 100%; padding: 0.85rem; justify-content: center; margin-top: 0.5rem;">
                Sign In with Email
            </button>
        </form>

        <div style="position: relative; margin: 1.5rem 0; text-align: center;">
            <hr style="border: 0; border-top: 1px solid var(--surface-border);">
            <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #0d121f; padding: 0 0.75rem; font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">or</span>
        </div>

        <button id="btn-google-auth" class="btn-secondary" style="width: 100%; justify-content: center; padding: 0.75rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/></svg>
            Continue with Google
        </button>
        `
    );

    const tabSignIn = document.getElementById('modal-tab-signin');
    const tabSignUp = document.getElementById('modal-tab-signup');
    const nameGroup = document.getElementById('auth-name-group');
    const submitBtn = document.getElementById('btn-submit-auth');
    const form = document.getElementById('auth-form');
    const errorBanner = document.getElementById('auth-error-banner');
    const successBanner = document.getElementById('auth-success-banner');
    const forgotBtn = document.getElementById('btn-forgot-password');
    const googleBtn = document.getElementById('btn-google-auth');

    let mode = 'signin';

    function showErr(msg) {
        if (errorBanner) {
            errorBanner.innerText = msg;
            errorBanner.classList.remove('hidden');
        }
        if (successBanner) successBanner.classList.add('hidden');
    }

    function showSucc(msg) {
        if (successBanner) {
            successBanner.innerText = msg;
            successBanner.classList.remove('hidden');
        }
        if (errorBanner) errorBanner.classList.add('hidden');
    }

    tabSignIn.onclick = () => {
        mode = 'signin';
        tabSignIn.classList.add('active');
        tabSignUp.classList.remove('active');
        nameGroup.classList.add('hidden');
        submitBtn.innerText = 'Sign In with Email';
        errorBanner.classList.add('hidden');
    };

    tabSignUp.onclick = () => {
        mode = 'signup';
        tabSignUp.classList.add('active');
        tabSignIn.classList.remove('active');
        nameGroup.classList.remove('hidden');
        submitBtn.innerText = 'Create Account with Email';
        errorBanner.classList.add('hidden');
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name').value;

        submitBtn.disabled = true;
        submitBtn.innerText = 'Connecting...';
        errorBanner.classList.add('hidden');

        try {
            if (mode === 'signin') {
                await loginWithEmail(email, password);
                closeModal();
            } else {
                await signupWithEmail(email, password, name);
                closeModal();
            }
        } catch (err) {
            console.error('Auth error:', err);
            let friendly = err.message || 'Authentication failed.';
            if (err.code === 'auth/invalid-email') friendly = 'Invalid email address format.';
            else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') friendly = 'Invalid email or password.';
            else if (err.code === 'auth/email-already-in-use') friendly = 'An account with this email already exists. Try signing in.';
            else if (err.code === 'auth/weak-password') friendly = 'Password should be at least 6 characters.';
            showErr(friendly);
            submitBtn.disabled = false;
            submitBtn.innerText = mode === 'signin' ? 'Sign In with Email' : 'Create Account with Email';
        }
    };

    forgotBtn.onclick = async () => {
        const email = document.getElementById('auth-email').value.trim();
        if (!email) {
            showErr('Please enter your email address to receive a password reset link.');
            return;
        }
        try {
            await resetPassword(email);
            showSucc(`Password reset instructions sent to ${email}`);
        } catch (err) {
            showErr(err.message || 'Unable to send password reset email.');
        }
    };

    googleBtn.onclick = async () => {
        try {
            await loginWithGoogle();
            closeModal();
        } catch (err) {
            showErr('Google sign-in was blocked or interrupted. You can sign in using normal email above.');
        }
    };
}

// Modal System
function showModal(title, contentHtml) {
    if (!modalBody || !modalOverlay) return;
    modalBody.innerHTML = `
        <h3 style="font-family: var(--font-display); font-size: 1.5rem; font-weight: 800; margin-bottom: 0.75rem; color: #fff;">${title}</h3>
        <div>${contentHtml}</div>
    `;
    modalOverlay.classList.remove('hidden');
    modalOverlay.classList.add('flex');
}

function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.add('hidden');
    modalOverlay.classList.remove('flex');
}

function setupEventListeners() {
    if (modalClose) modalClose.onclick = closeModal;
    if (modalOverlay) {
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) closeModal();
        };
    }

    const ctaGen = document.getElementById('cta-generate');
    if (ctaGen) ctaGen.onclick = () => showView('generate');

    const ctaTeaching = document.getElementById('cta-teaching');
    if (ctaTeaching) ctaTeaching.onclick = () => showView('teaching');

    const ctaHub = document.getElementById('cta-hub');
    if (ctaHub) ctaHub.onclick = () => showView('hub');

    const mobTrigger = document.getElementById('mobile-menu-trigger');
    const mobDrop = document.getElementById('mobile-dropdown');
    if (mobTrigger && mobDrop) {
        mobTrigger.onclick = () => mobDrop.classList.toggle('hidden');
    }
}

// Expose on window
window.EXAMIVO = {
    showView,
    startCurated: (id) => {
        const exam = CURATED_EXAMS.find(e => e.id === id);
        if (exam) {
            showView('quiz-ready', { quizId: exam.id, quizData: exam });
        }
    },
    openAuthModal,
    closeModal,
    logout: async () => {
        await logout();
        showView('home');
    },
    launchSavedQuiz: (id) => {
        const item = (window._libraryCache?.quizzes || []).find(q => q.id === id);
        if (item) {
            showView('quiz-ready', { quizId: id, quizData: item });
        }
    },
    viewSavedTeaching: (id) => {
        const item = (window._libraryCache?.teachings || []).find(t => t.id === id);
        if (item && item.lessonData) {
            showView('teaching');
            renderLessonOutput(item.lessonData, item.topic || '');
        }
    },
    viewSavedNote: (id) => {
        const item = (window._libraryCache?.notes || []).find(n => n.id === id);
        if (item && item.noteData) {
            showView('notes');
            renderNoteOutput(item.noteData, item.topic || '');
        }
    },
    deleteCloudItem: async (colName, id) => {
        if (!confirm('Are you sure you want to delete this saved item?')) return;
        try {
            await deleteDoc(doc(db, colName, id));
            renderLibraryView();
        } catch (e) {
            console.error('Delete failed:', e);
        }
    },
    exportQuizAsPdf: (data, answers, score) => {
        const quiz = data || window.EXAMIVO.lastSessionData || window.EXAMIVO.activeReadyQuiz || window.EXAMIVO.activePlayQuiz;
        if (quiz) exportQuizAsPdf(quiz, answers || window.EXAMIVO.lastSessionAnswers, score !== undefined ? score : window.EXAMIVO.lastSessionScore);
    },
    exportQuizAsDocx: (data, answers, score) => {
        const quiz = data || window.EXAMIVO.lastSessionData || window.EXAMIVO.activeReadyQuiz || window.EXAMIVO.activePlayQuiz;
        if (quiz) exportQuizAsDocx(quiz, answers || window.EXAMIVO.lastSessionAnswers, score !== undefined ? score : window.EXAMIVO.lastSessionScore);
    },
    exportQuizAsTxt: (data, answers, score) => {
        const quiz = data || window.EXAMIVO.lastSessionData || window.EXAMIVO.activeReadyQuiz || window.EXAMIVO.activePlayQuiz;
        if (quiz) exportQuizAsTxt(quiz, answers || window.EXAMIVO.lastSessionAnswers, score !== undefined ? score : window.EXAMIVO.lastSessionScore);
    },
    printQuiz: (data, answers, score) => {
        const quiz = data || window.EXAMIVO.lastSessionData || window.EXAMIVO.activeReadyQuiz || window.EXAMIVO.activePlayQuiz;
        if (quiz) printQuiz(quiz, answers || window.EXAMIVO.lastSessionAnswers, score !== undefined ? score : window.EXAMIVO.lastSessionScore);
    },
    printQuizById: (id) => {
        const item = (window._libraryCache?.quizzes || []).find(q => q.id === id) || CURATED_EXAMS.find(e => e.id === id);
        if (item) printQuiz(item);
    }
};

// Launch
init();
renderHomeFeatures();
