// EXAMIVO — Core Application Logic (Pure Vanilla JavaScript)
import {
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy
} from './firebase-config.js';

// Global State
export const state = {
  currentUser: null,
  theme: localStorage.getItem('examivo-theme') || 'dark',
};

// Theme Management
export function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('examivo-theme', theme);
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function initTheme() {
  applyTheme(state.theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      showToast(`Switched to ${nextTheme} mode`, 'info');
    });
  }
}

// Toast Notifications with SVG Icons
export function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="20" height="20" fill="none" stroke="var(--success)" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="20" height="20" fill="none" stroke="var(--danger)" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>`;
  } else if (type === 'warning') {
    iconSvg = `<svg width="20" height="20" fill="none" stroke="var(--warning)" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>`;
  } else {
    iconSvg = `<svg width="20" height="20" fill="none" stroke="var(--accent-cyan)" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>`;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div style="flex-shrink:0; display:flex; align-items:center;">${iconSvg}</div>
    <div style="font-weight:600; flex:1; font-size:0.9rem;">${escapeHTML(message)}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Fullscreen AI Loading Overlay with Multi-Layered Orbital Visual
export function showAILoading(title = 'EXAMIVO IS THINKING', stages = []) {
  let overlay = document.getElementById('aiLoadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'aiLoadingOverlay';
    overlay.className = 'ai-loading-overlay';
    overlay.innerHTML = `
      <div class="ai-loading-card">
        <div class="ai-core-visual lg">
          <div class="ai-aura"></div>
          <div class="ai-orbital-ring r1"></div>
          <div class="ai-orbital-ring r2"></div>
          <div class="ai-orbital-ring r3"></div>
          <div class="ai-nucleus"></div>
        </div>
        <div class="ai-loading-title" id="aiLoadingTitle">${escapeHTML(title)}</div>
        <div class="ai-loading-subtitle" id="aiLoadingSubtitle">Analyzing curriculum parameters & cognitive patterns</div>
        <div class="ai-pipeline-stages" id="aiPipelineStages"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const titleEl = document.getElementById('aiLoadingTitle');
  if (titleEl) titleEl.textContent = title;

  const stagesContainer = document.getElementById('aiPipelineStages');
  stagesContainer.innerHTML = '';
  stages.forEach((stage, idx) => {
    const item = document.createElement('div');
    item.className = `ai-stage-item ${idx === 0 ? 'active' : ''}`;
    item.id = `aiStage_${idx}`;
    item.innerHTML = `
      <div class="ai-stage-icon">
        <span class="indicator-icon" style="font-size:0.95rem; font-weight:700;">${idx === 0 ? '●' : '○'}</span>
      </div>
      <div>${escapeHTML(stage)}</div>
    `;
    stagesContainer.appendChild(item);
  });

  overlay.classList.add('active');
}

export function updateAIStage(activeIdx) {
  const container = document.getElementById('aiPipelineStages');
  if (!container) return;
  const items = container.querySelectorAll('.ai-stage-item');
  items.forEach((item, idx) => {
    item.classList.remove('active', 'completed');
    const icon = item.querySelector('.indicator-icon');
    if (idx < activeIdx) {
      item.classList.add('completed');
      if (icon) icon.innerHTML = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>`;
    } else if (idx === activeIdx) {
      item.classList.add('active');
      if (icon) icon.textContent = '●';
    } else {
      if (icon) icon.textContent = '○';
    }
  });
}

export function hideAILoading() {
  const overlay = document.getElementById('aiLoadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

// Mobile Slide-Out Navigation Drawer
export function initMobileNav() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  if (!menuBtn) return;

  // 1. Create or get backdrop
  let backdrop = document.getElementById('mobileNavBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'mobileNavBackdrop';
    backdrop.className = 'mobile-nav-backdrop';
    document.body.appendChild(backdrop);
  }

  // 2. Create or get drawer
  let drawer = document.getElementById('mobileNavDrawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'mobileNavDrawer';
    drawer.className = 'mobile-nav-drawer';

    const currentPath = window.location.pathname;

    drawer.innerHTML = `
      <div class="mobile-drawer-header">
        <a href="/index.html" class="brand-link" style="font-size:1.15rem;">
          <div class="brand-mark" style="width:1.85rem; height:1.85rem;">
            <img src="/icon.svg" alt="EXAMIVO" />
          </div>
          <span class="brand-text">EXAMIVO</span>
        </a>
        <button class="mobile-drawer-close-btn" id="mobileDrawerCloseBtn" aria-label="Close Navigation">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- User Profile Card -->
      <div class="mobile-user-card" id="mobileUserCard">
        <div class="mobile-user-info">
          <div class="mobile-user-avatar" id="mobileUserAvatar">G</div>
          <div>
            <div class="mobile-user-text" id="mobileUserEmail">Guest Learner</div>
            <div style="font-size:0.75rem; color:var(--text-muted);" id="mobileUserRole">Ready to prepare</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" id="mobileAuthActionBtn" style="padding:0.35rem 0.75rem; font-size:0.8rem;">Sign In</button>
      </div>

      <!-- Primary Action CTA -->
      <a href="/setup.html" class="btn btn-primary w-full" style="justify-content:center; box-shadow:0 4px 16px var(--primary-glow);">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>
        </svg>
        Start Practice Exam
      </a>

      <!-- Main Navigation Links -->
      <div class="mobile-section-label">NAVIGATION</div>
      <div class="mobile-nav-links">
        <a href="/index.html" class="mobile-nav-link ${currentPath === '/' || currentPath === '/index.html' ? 'active' : ''}">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>
          Home
        </a>
        <a href="/app.html" class="mobile-nav-link ${currentPath.includes('app') ? 'active' : ''}">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>
          Dashboard
        </a>
        <a href="/setup.html" class="mobile-nav-link ${currentPath.includes('setup') ? 'active' : ''}">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          New Practice & Tests
        </a>
        <a href="/history.html" class="mobile-nav-link ${currentPath.includes('history') ? 'active' : ''}">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Exam History
        </a>
        <a href="/study.html" class="mobile-nav-link ${currentPath.includes('study') ? 'active' : ''}">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
          Study My Mistakes
        </a>
      </div>

      <!-- Quick Test Categories -->
      <div class="mobile-section-label">ASSESSMENT FORMATS</div>
      <div class="mobile-quick-chips">
        <a href="/setup.html?exam=Continuous+Assessment+1+(CA+1)" class="mobile-test-chip">
          <span style="color:var(--accent-cyan);">●</span> C.A. Test 1
        </a>
        <a href="/setup.html?exam=Continuous+Assessment+2+(CA+2)" class="mobile-test-chip">
          <span style="color:var(--accent-cyan);">●</span> C.A. Test 2
        </a>
        <a href="/setup.html?exam=Mid-Term+Examination" class="mobile-test-chip">
          <span style="color:var(--warning);">●</span> Mid-Term
        </a>
        <a href="/setup.html?exam=Weekly+Concept+Quiz" class="mobile-test-chip">
          <span style="color:var(--accent-purple);">●</span> Weekly Quiz
        </a>
        <a href="/setup.html?exam=End-of-Term+Examination" class="mobile-test-chip">
          <span style="color:var(--success);">●</span> End of Term
        </a>
        <a href="/setup.html?exam=WAEC" class="mobile-test-chip">
          <span style="color:var(--primary-light);">●</span> WAEC / NECO
        </a>
        <a href="/setup.html?exam=JAMB+/+UTME" class="mobile-test-chip">
          <span style="color:var(--accent-amber);">●</span> JAMB / UTME
        </a>
        <a href="/setup.html?exam=University+In-Course+Test" class="mobile-test-chip">
          <span style="color:var(--accent-cyan);">●</span> University C.A.
        </a>
      </div>

      <!-- Theme Controls -->
      <div style="margin-top:auto; padding-top:1rem; border-top:1px solid var(--border);">
        <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.35rem;">THEME PREFERENCE</div>
        <div class="mobile-theme-pills">
          <button class="mobile-theme-pill ${state.theme === 'dark' ? 'active' : ''}" data-t="dark">Dark</button>
          <button class="mobile-theme-pill ${state.theme === 'light' ? 'active' : ''}" data-t="light">Light</button>
          <button class="mobile-theme-pill ${state.theme === 'system' ? 'active' : ''}" data-t="system">Auto</button>
        </div>
      </div>
    `;

    document.body.appendChild(drawer);

    // Theme selector listeners
    drawer.querySelectorAll('.mobile-theme-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const t = pill.getAttribute('data-t');
        applyTheme(t);
        drawer.querySelectorAll('.mobile-theme-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        showToast(`Switched to ${t} theme`, 'info');
      });
    });

    // Close button inside drawer
    document.getElementById('mobileDrawerCloseBtn')?.addEventListener('click', closeDrawer);

    // Mobile auth button
    document.getElementById('mobileAuthActionBtn')?.addEventListener('click', () => {
      closeDrawer();
      if (state.currentUser) {
        if (confirm(`Signed in as ${state.currentUser.email || 'User'}. Sign out?`)) {
          signOut(auth).then(() => showToast('Signed out', 'info'));
        }
      } else {
        openAuthModal();
      }
    });

    // Close on navigation link or chip click
    drawer.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        closeDrawer();
      });
    });
  }

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.innerHTML = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.innerHTML = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>`;
  }

  menuBtn.onclick = () => {
    const isOpen = drawer.classList.contains('open');
    if (isOpen) closeDrawer();
    else openDrawer();
  };

  backdrop.onclick = closeDrawer;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // Sync initial user state to drawer
  updateAuthUI(state.currentUser);
}

// Local Storage & Firestore Storage Sync
export const StorageManager = {
  getExams() {
    try {
      return JSON.parse(localStorage.getItem('examivo_exams') || '[]');
    } catch {
      return [];
    }
  },
  saveExam(exam) {
    const exams = this.getExams();
    const updated = [exam, ...exams.filter((e) => e.id !== exam.id)];
    localStorage.setItem('examivo_exams', JSON.stringify(updated.slice(0, 50)));

    if (state.currentUser && db) {
      try {
        setDoc(doc(db, 'users', state.currentUser.uid, 'exams', exam.id), exam);
      } catch (e) {
        console.warn('Firestore sync note:', e);
      }
    }
  },
  getWeakAreas() {
    try {
      return JSON.parse(localStorage.getItem('examivo_weak_areas') || '[]');
    } catch {
      return [];
    }
  },
  saveWeakAreas(weakAreas) {
    localStorage.setItem('examivo_weak_areas', JSON.stringify(weakAreas));
  },
  getStats() {
    const exams = this.getExams();
    if (!exams.length) {
      return { averageScore: 0, completedCount: 0, strongestSubject: 'None yet', weakTopicsCount: 0 };
    }
    const completed = exams.filter((e) => e.scorePercentage !== undefined);
    const sum = completed.reduce((acc, curr) => acc + (curr.scorePercentage || 0), 0);
    const avg = completed.length ? Math.round(sum / completed.length) : 0;

    const subjects = {};
    completed.forEach((e) => {
      const s = e.subject || 'General';
      subjects[s] = (subjects[s] || 0) + (e.scorePercentage || 0);
    });
    let best = 'General';
    let max = -1;
    for (const [k, v] of Object.entries(subjects)) {
      if (v > max) {
        max = v;
        best = k;
      }
    }

    const weakAreas = this.getWeakAreas();
    return {
      averageScore: avg,
      completedCount: completed.length,
      strongestSubject: completed.length ? best : 'None yet',
      weakTopicsCount: weakAreas.length,
    };
  },
};

// API Services
export const AIService = {
  async analyzeMaterial(payload) {
    const res = await fetch('/api/ai/analyze-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to analyze material');
    return json.data;
  },
  async generateExam(payload) {
    const res = await fetch('/api/ai/generate-exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to generate questions');
    return json.data;
  },
  async analyzePerformance(payload) {
    const res = await fetch('/api/ai/analyze-performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to analyze performance');
    return json.data;
  },
  async generateWeakPractice(payload) {
    const res = await fetch('/api/ai/generate-weak-practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to generate weak practice');
    return json.data;
  },
  async generateStudyNotes(payload) {
    const res = await fetch('/api/ai/generate-study-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to generate revision notes');
    return json.data;
  },
};

// Auth Modal
export function initAuth() {
  if (auth) {
    onAuthStateChanged(auth, (user) => {
      state.currentUser = user;
      updateAuthUI(user);
    });
  }

  const openAuthBtn = document.getElementById('openAuthBtn');
  if (openAuthBtn) {
    openAuthBtn.addEventListener('click', () => {
      if (state.currentUser) {
        if (confirm(`Signed in as ${state.currentUser.email || 'User'}. Do you want to sign out?`)) {
          signOut(auth).then(() => showToast('Signed out successfully', 'info'));
        }
      } else {
        openAuthModal();
      }
    });
  }
}

function updateAuthUI(user) {
  const btn = document.getElementById('openAuthBtn');
  if (btn) {
    if (user) {
      btn.textContent = user.displayName || user.email?.split('@')[0] || 'Account';
      btn.classList.add('btn-secondary');
      btn.classList.remove('btn-primary');
    } else {
      btn.textContent = 'Sign In';
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');
    }
  }

  // Update mobile drawer card
  const drawerAvatar = document.getElementById('mobileUserAvatar');
  const drawerEmail = document.getElementById('mobileUserEmail');
  const drawerRole = document.getElementById('mobileUserRole');
  const drawerAuthBtn = document.getElementById('mobileAuthActionBtn');

  if (drawerEmail) {
    if (user) {
      const name = user.displayName || user.email?.split('@')[0] || 'User';
      drawerEmail.textContent = user.email || name;
      if (drawerAvatar) drawerAvatar.textContent = name.charAt(0).toUpperCase();
      if (drawerRole) drawerRole.textContent = 'Registered Student';
      if (drawerAuthBtn) drawerAuthBtn.textContent = 'Sign Out';
    } else {
      drawerEmail.textContent = 'Guest Learner';
      if (drawerAvatar) drawerAvatar.textContent = 'G';
      if (drawerRole) drawerRole.textContent = 'Ready to prepare';
      if (drawerAuthBtn) drawerAuthBtn.textContent = 'Sign In';
    }
  }
}

export function openAuthModal() {
  let modal = document.getElementById('authModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title">Sign in to EXAMIVO</div>
          <button class="modal-close-btn" id="closeAuthModalBtn">&times;</button>
        </div>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:1.5rem;">
          Sync your practice exams, track your score trajectory, and keep your targeted weak-area remediation across all devices.
        </p>
        <button id="googleAuthBtn" class="btn btn-secondary w-full" style="margin-bottom:1.25rem;">
          Continue with Google
        </button>
        <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem;">— OR USE EMAIL —</div>
        <form id="emailAuthForm">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="authEmail" class="form-input" required placeholder="you@domain.com" />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="authPassword" class="form-input" required placeholder="••••••••" />
          </div>
          <div style="display:flex; gap:0.75rem; margin-top:1.5rem;">
            <button type="submit" id="signInEmailBtn" class="btn btn-primary" style="flex:1;">Sign In</button>
            <button type="button" id="signUpEmailBtn" class="btn btn-secondary" style="flex:1;">Register</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeAuthModalBtn').onclick = () => modal.classList.remove('active');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };

    document.getElementById('googleAuthBtn').onclick = async () => {
      try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        showToast('Signed in with Google!', 'success');
        modal.classList.remove('active');
      } catch (err) {
        showToast(err.message || 'Google sign in failed', 'error');
      }
    };

    document.getElementById('emailAuthForm').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmail').value;
      const pwd = document.getElementById('authPassword').value;
      try {
        await signInWithEmailAndPassword(auth, email, pwd);
        showToast('Signed in successfully!', 'success');
        modal.classList.remove('active');
      } catch (err) {
        showToast(err.message || 'Authentication failed', 'error');
      }
    };

    document.getElementById('signUpEmailBtn').onclick = async () => {
      const email = document.getElementById('authEmail').value;
      const pwd = document.getElementById('authPassword').value;
      if (!email || !pwd) {
        showToast('Please enter email and password to register', 'warning');
        return;
      }
      try {
        await createUserWithEmailAndPassword(auth, email, pwd);
        showToast('Account created successfully!', 'success');
        modal.classList.remove('active');
      } catch (err) {
        showToast(err.message || 'Registration failed', 'error');
      }
    };
  }
  modal.classList.add('active');
}

// PWA Support
export function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }
}

// Utility: Escape HTML
export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Auto-run core features
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuth();
  initMobileNav();
  initPWA();
});
