/**
 * EXAMIVO — Unified UI Engine, AI Intelligence Core & Interaction Primitives
 * Implements renderAIStatus(state), Theme Switcher, Toasts, Modals & Smooth Transitions
 */

import { escapeHtml } from "./utils.js";

export const AI_STATES = {
  idle: {
    label: "Intelligence Ready",
    detail: "Standing by for study material or examination blueprint"
  },
  reading: {
    label: "Reading Material",
    detail: "Extracting structure, definitions, formulas, and visual notes"
  },
  thinking: {
    label: "EXAMIVO is Thinking",
    detail: "Synthesizing curriculum level and examination requirements"
  },
  analyzing: {
    label: "Analyzing Patterns",
    detail: "Prioritizing high-yield concepts and examination focus areas"
  },
  generating: {
    label: "Building Questions",
    detail: "Crafting original, class-calibrated examination questions"
  },
  checking: {
    label: "Checking Quality",
    detail: "Validating accuracy, distractors, and marking explanations"
  },
  complete: {
    label: "Analysis Complete",
    detail: "Examination blueprint verified and ready"
  },
  error: {
    label: "Action Interrupted",
    detail: "EXAMIVO encountered an issue completing that request"
  }
};

/**
 * Reusable EXAMIVO AI Visual Identity Component
 * Renders an abstract AI intelligence core (luminous nucleus, subtle orbital rings,
 * thin vector lines, signal nodes, and soft radial glow).
 *
 * @param {string} state - One of: idle | reading | thinking | analyzing | generating | checking | complete | error
 * @param {HTMLElement|string} [target] - DOM element or selector to render into (returns HTML string if omitted)
 * @param {Object} [options] - { size: 'xs'|'sm'|'md'|'lg'|'xl', showLabel: boolean, customLabel: string }
 */
export function renderAIStatus(state = "idle", target = null, options = {}) {
  const validState = AI_STATES[state] ? state : "idle";
  const stateMeta = AI_STATES[validState];
  const size = options.size || "md";
  const showLabel = options.showLabel !== undefined ? options.showLabel : true;
  const labelText = options.customLabel || stateMeta.label;

  const coreSvgMarkup = `
    <div class="ai-core-wrap" data-ai-widget="true">
      <div class="ai-core size-${escapeHtml(size)}" data-state="${escapeHtml(validState)}" role="status" aria-label="EXAMIVO AI status: ${escapeHtml(labelText)}">
        <div class="ai-core-halo"></div>
        <svg class="ai-core-svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <radialGradient id="aiCoreGrad_${escapeHtml(size)}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#A5B4FC" stop-opacity="0.95"/>
              <stop offset="48%" stop-color="#6366F1" stop-opacity="0.55"/>
              <stop offset="100%" stop-color="#090B10" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="aiRingA_${escapeHtml(size)}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#6366F1" stop-opacity="0.9"/>
              <stop offset="50%" stop-color="#38BDF8" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="#6366F1" stop-opacity="0.08"/>
            </linearGradient>
            <linearGradient id="aiRingB_${escapeHtml(size)}" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.85"/>
              <stop offset="60%" stop-color="#818CF8" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="#38BDF8" stop-opacity="0.05"/>
            </linearGradient>
          </defs>

          <!-- Outer Precision Telemetry Ring -->
          <g class="core-outer-ring">
            <circle cx="60" cy="60" r="50" stroke="url(#aiRingA_${escapeHtml(size)})" stroke-width="1.2" stroke-dasharray="16 7 4 7"/>
            <circle cx="60" cy="10" r="2.4" fill="#818CF8" class="core-node"/>
            <circle cx="60" cy="110" r="2.2" fill="#38BDF8" class="core-node"/>
          </g>

          <!-- Orbital Ellipse A -->
          <g class="core-orbit-a">
            <ellipse cx="60" cy="60" rx="41" ry="22" transform="rotate(-28 60 60)" stroke="url(#aiRingB_${escapeHtml(size)})" stroke-width="1.35"/>
            <circle cx="24" cy="41" r="3" fill="#38BDF8" class="core-node"/>
            <circle cx="96" cy="79" r="2.6" fill="#A5B4FC" class="core-node"/>
          </g>

          <!-- Orbital Ellipse B -->
          <g class="core-orbit-b">
            <ellipse cx="60" cy="60" rx="41" ry="22" transform="rotate(32 60 60)" stroke="url(#aiRingA_${escapeHtml(size)})" stroke-width="1.35"/>
            <circle cx="93" cy="39" r="2.8" fill="#818CF8" class="core-node"/>
            <circle cx="27" cy="81" r="2.3" fill="#38BDF8" class="core-node"/>
          </g>

          <!-- Thin Axis Signal Lines -->
          <line x1="60" y1="16" x2="60" y2="32" stroke="#818CF8" stroke-opacity="0.38" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="60" y1="88" x2="60" y2="104" stroke="#818CF8" stroke-opacity="0.38" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="16" y1="60" x2="32" y2="60" stroke="#38BDF8" stroke-opacity="0.38" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="88" y1="60" x2="104" y2="60" stroke="#38BDF8" stroke-opacity="0.38" stroke-width="1.1" stroke-linecap="round"/>

          <!-- Inner Containment Ring -->
          <circle cx="60" cy="60" r="24" stroke="#818CF8" stroke-opacity="0.32" stroke-width="1"/>

          <!-- Luminous Intelligence Nucleus -->
          <g class="core-nucleus">
            <circle cx="60" cy="60" r="22" fill="url(#aiCoreGrad_${escapeHtml(size)})"/>
            <circle cx="60" cy="60" r="10.5" fill="#6366F1"/>
            <circle cx="60" cy="60" r="5.2" fill="#EEF2FF"/>
          </g>
        </svg>
      </div>
      ${
        showLabel
          ? `<div class="ai-core-status-pill" data-state="${escapeHtml(validState)}">
               <span class="ai-core-status-dot"></span>
               <span class="ai-core-status-text">${escapeHtml(labelText)}</span>
             </div>`
          : ""
      }
    </div>
  `;

  if (!target) {
    return coreSvgMarkup;
  }

  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) return coreSvgMarkup;

  // If element already contains an ai-core, smoothly update its state attribute instead of recreating DOM
  const existingCore = el.querySelector(".ai-core");
  if (existingCore) {
    const prevState = existingCore.getAttribute("data-state");
    existingCore.setAttribute("data-state", validState);
    existingCore.setAttribute("aria-label", `EXAMIVO AI status: ${labelText}`);
    if (prevState !== validState) {
      existingCore.classList.add("stage-shift");
      setTimeout(() => existingCore.classList.remove("stage-shift"), 280);
    }
    const textEl = el.querySelector(".ai-core-status-text");
    if (textEl) textEl.textContent = labelText;
    const pillEl = el.querySelector(".ai-core-status-pill");
    if (pillEl) pillEl.setAttribute("data-state", validState);
    return coreSvgMarkup;
  }

  el.innerHTML = coreSvgMarkup;
  return coreSvgMarkup;
}

// Expose globally as required by specification Section 11
if (typeof window !== "undefined") {
  window.renderAIStatus = renderAIStatus;
}

/* ==========================================================================
   THEME MANAGER (Dark Default | Light | System)
   ========================================================================== */

const THEME_STORAGE_KEY = "examivo_theme";

export function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) || "dark";
  applyTheme(saved);

  // Listen for OS theme changes when in 'system' mode
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      const currentPref = localStorage.getItem(THEME_STORAGE_KEY) || "dark";
      if (currentPref === "system") {
        applyTheme("system");
      }
    });
  }

  // Bind theme switcher buttons if present
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const choice = btn.getAttribute("data-theme-choice");
      setTheme(choice);
    });
  });

  updateThemeButtonsUI(saved);
}

export function setTheme(mode) {
  const validMode = ["dark", "light", "system"].includes(mode) ? mode : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, validMode);
  applyTheme(validMode);
  updateThemeButtonsUI(validMode);
}

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "light") {
    root.setAttribute("data-theme", "light");
  } else if (mode === "system") {
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    if (prefersLight) {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  } else {
    root.removeAttribute("data-theme");
  }
}

function updateThemeButtonsUI(mode) {
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    const choice = btn.getAttribute("data-theme-choice");
    btn.classList.toggle("active", choice === mode);
    btn.setAttribute("aria-pressed", choice === mode ? "true" : "false");
  });
}

/* ==========================================================================
   TOAST NOTIFICATION SYSTEM
   ========================================================================== */

function ensureToastRegion() {
  let region = document.getElementById("examivo-toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "examivo-toast-region";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  return region;
}

/**
 * Display an elegant toast notification
 * @param {string} message - Human-readable message ("Exam saved.", "Answer recorded.", etc.)
 * @param {'info'|'success'|'warning'|'danger'} [type='info']
 * @param {number} [duration=3600]
 */
export function showToast(message, type = "info", duration = 3600) {
  const region = ensureToastRegion();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");

  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" class="modal-close" aria-label="Dismiss notification">✕</button>
  `;

  const closeBtn = toast.querySelector("button");
  const removeToast = () => {
    toast.classList.remove("visible");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  };

  closeBtn.addEventListener("click", removeToast);
  region.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
}

/* ==========================================================================
   MODAL SYSTEM (Accessible, Escape & Backdrop Support)
   ========================================================================== */

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const firstInput = modal.querySelector("input, button:not(.modal-close), select, textarea");
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 80);
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

export function initModals() {
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("open");
        backdrop.setAttribute("aria-hidden", "true");
      }
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-close-modal");
      if (targetId) {
        closeModal(targetId);
      } else {
        const parentModal = btn.closest(".modal-backdrop");
        if (parentModal) {
          parentModal.classList.remove("open");
          parentModal.setAttribute("aria-hidden", "true");
        }
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-backdrop.open").forEach((m) => {
        m.classList.remove("open");
        m.setAttribute("aria-hidden", "true");
      });
    }
  });
}

/* ==========================================================================
   SMOOTH PAGE TRANSITIONS
   ========================================================================== */

export function navigateTo(url) {
  const shell = document.querySelector(".page-shell") || document.body;
  shell.classList.add("page-transition-exit");
  setTimeout(() => {
    window.location.href = url;
  }, 170);
}

export function initSmoothLinks() {
  const shell = document.querySelector(".page-shell");
  if (shell) {
    shell.classList.add("page-transition-enter");
  }

  document.querySelectorAll("a[data-smooth-nav]").forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || e.metaKey || e.ctrlKey) {
        return;
      }
      e.preventDefault();
      navigateTo(href);
    });
  });
}

/* ==========================================================================
   PWA SERVICE WORKER & NETWORK CONNECTIVITY MONITOR
   ========================================================================== */

export function initPWAAndNetwork() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        // Non-blocking if SW registration fails in restricted iframe
      });
    });
  }

  const updateNetStatus = (notify = false) => {
    const isOnline = navigator.onLine;
    document.querySelectorAll(".net-pill").forEach((pill) => {
      pill.classList.toggle("hidden", isOnline);
    });
    if (notify) {
      if (isOnline) {
        showToast("Connection restored.", "success");
      } else {
        showToast("You are offline. Saved history remains available; AI generation requires an internet connection.", "warning", 5000);
      }
    }
  };

  window.addEventListener("online", () => updateNetStatus(true));
  window.addEventListener("offline", () => updateNetStatus(true));
  updateNetStatus(false);
}

/* ==========================================================================
   SHARED AUTHENTICATION MODAL INJECTION
   ========================================================================== */

export function ensureAuthModal() {
  if (document.getElementById("auth-modal")) return;

  const modalHtml = `
    <div class="modal-backdrop" id="auth-modal" aria-hidden="true" role="dialog" aria-labelledby="auth-modal-title">
      <div class="modal-dialog">
        <div class="modal-header">
          <div>
            <h2 class="modal-title" id="auth-modal-title">Save Your Preparation</h2>
            <p class="modal-subtitle" id="auth-modal-subtitle">Sign in to sync your exams, weak-area diagnostics, and progress across all devices.</p>
          </div>
          <button type="button" class="modal-close" data-close-modal="auth-modal" aria-label="Close modal">✕</button>
        </div>

        <div style="display:flex; flex-direction:column; gap:1rem;">
          <button type="button" class="btn btn-secondary" id="google-signin-btn" style="width:100%; justify-content:center; padding:0.8rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"/>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"/>
              <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 12.3s.6 3.3 1.6 5.3l3.7-2.8z"/>
              <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 19.9 7.4 23 12 23z"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          <div style="display:flex; align-items:center; gap:0.75rem; color:var(--text-muted); font-size:0.78rem;">
            <div style="flex:1; height:1px; background:var(--border);"></div>
            <span>OR EMAIL</span>
            <div style="flex:1; height:1px; background:var(--border);"></div>
          </div>

          <form id="email-auth-form" style="display:flex; flex-direction:column; gap:0.85rem;">
            <div class="form-group" id="auth-name-group" style="display:none;">
              <label class="form-label" for="auth-name-input">Full Name</label>
              <input type="text" id="auth-name-input" class="form-input" placeholder="e.g. Chidi Okafor" autocomplete="name"/>
            </div>
            <div class="form-group">
              <label class="form-label" for="auth-email-input">Email Address</label>
              <input type="email" id="auth-email-input" class="form-input" placeholder="student@example.com" required autocomplete="email"/>
            </div>
            <div class="form-group">
              <label class="form-label" for="auth-password-input">Password</label>
              <input type="password" id="auth-password-input" class="form-input" placeholder="At least 6 characters" required minlength="6" autocomplete="current-password"/>
            </div>
            <div id="auth-error-msg" style="display:none; font-size:0.83rem; color:var(--danger); padding:0.55rem 0.75rem; background:var(--danger-soft); border-radius:var(--radius-xs);"></div>
            <button type="submit" class="btn btn-primary" id="email-auth-submit" style="width:100%;">Sign In</button>
          </form>

          <div style="text-align:center; font-size:0.85rem; color:var(--text-secondary);">
            <span id="auth-toggle-prompt">Need an EXAMIVO account?</span>
            <button type="button" id="auth-toggle-mode-btn" style="color:var(--primary); font-weight:700; margin-left:0.35rem;">Create Account</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

/**
 * Initialize common shell behaviors across all pages
 */
export function initCommonUI() {
  initTheme();
  ensureAuthModal();
  initModals();
  initSmoothLinks();
  initPWAAndNetwork();

  // Render mini AI core in navigation brand if present
  const brandCores = document.querySelectorAll(".brand-core-mini");
  brandCores.forEach((el) => {
    renderAIStatus("idle", el, { size: "xs", showLabel: false });
  });
}
