/**
 * EXAMIVO — Authentication Controller (Firebase Authentication)
 * Supports Google Sign-In & Email/Password without blocking initial guest exploration.
 * Syncs user profile to Firestore and upgrades guest session data upon sign-in.
 */

import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  trackEvent
} from "./firebase.js";
import { openModal, closeModal, showToast } from "./ui.js";

let currentUser = null;
const authListeners = new Set();
let isRegisterMode = false;
let pendingPostAuthCallback = null;

/**
 * Translate Firebase Auth error codes into human-readable messages (Section 51)
 */
function getHumanAuthError(error) {
  const code = error && error.code ? String(error.code) : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "The email or password you entered didn't match our records. Please check and try again.";
  }
  if (code.includes("email-already-in-use")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (code.includes("weak-password")) {
    return "Please choose a stronger password with at least 6 characters.";
  }
  if (code.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (code.includes("popup-closed-by-user")) {
    return "Sign-in window was closed before completion.";
  }
  if (code.includes("network-request-failed")) {
    return "Please check your internet connection and try again.";
  }
  return "EXAMIVO couldn't complete sign-in right now. Please try again.";
}

/**
 * Sync authenticated user document & academic profile in Firestore
 */
async function syncUserToFirestore(user, displayNameOverride = "") {
  if (!user || !user.uid) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const profileRef = doc(db, "profiles", user.uid);

    const name = displayNameOverride || user.displayName || (user.email ? user.email.split("@")[0] : "Student");

    await setDoc(
      userRef,
      {
        userId: user.uid,
        email: user.email || "",
        displayName: name,
        photoURL: user.photoURL || "",
        lastSeenAt: serverTimestamp()
      },
      { merge: true }
    );

    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        userId: user.uid,
        displayName: name,
        preferredClass: "SS3",
        preferredExam: "WAEC",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (_) {
    // Non-fatal if Firestore rules or offline cache delay initial sync
  }
}

/**
 * Initialize Authentication listeners & bind Auth Modal controls
 */
export function initAuth(onUserChangedCallback = null) {
  if (onUserChangedCallback) {
    authListeners.add(onUserChangedCallback);
  }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user || null;
    updateAuthHeaderUI(currentUser);

    if (currentUser) {
      await syncUserToFirestore(currentUser);
      if (typeof pendingPostAuthCallback === "function") {
        const cb = pendingPostAuthCallback;
        pendingPostAuthCallback = null;
        cb(currentUser);
      }
    }

    authListeners.forEach((fn) => {
      try {
        fn(currentUser);
      } catch (_) {}
    });
  });

  bindAuthModalEvents();
}

export function getCurrentUser() {
  return currentUser || auth.currentUser;
}

export function onUserChange(fn) {
  authListeners.add(fn);
  if (currentUser !== undefined) {
    fn(currentUser);
  }
  return () => authListeners.delete(fn);
}

/**
 * Prompt user to sign in or create an account when they want saved exams,
 * history, progress tracking, cross-device access, or saved study sessions.
 */
export function promptAuthForFeature(reasonText = "Create an account or sign in to save your exams, track progress, and access your preparation across devices.", onAuthenticated = null) {
  const user = getCurrentUser();
  if (user) {
    if (typeof onAuthenticated === "function") onAuthenticated(user);
    return;
  }

  pendingPostAuthCallback = onAuthenticated;
  const subEl = document.getElementById("auth-modal-subtitle");
  if (subEl && reasonText) {
    subEl.textContent = reasonText;
  }
  openModal("auth-modal");
}

function updateAuthHeaderUI(user) {
  const authSlot = document.getElementById("nav-auth-slot");
  if (!authSlot) return;

  if (user) {
    const label = user.displayName || (user.email ? user.email.split("@")[0] : "Account");
    authSlot.innerHTML = `
      <div style="display:inline-flex; align-items:center; gap:0.5rem;">
        <span class="badge badge-neutral" title="${user.email || ""}" style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${label}
        </span>
        <button type="button" class="btn btn-ghost btn-sm" id="nav-signout-btn">Sign Out</button>
      </div>
    `;
    const outBtn = document.getElementById("nav-signout-btn");
    if (outBtn) {
      outBtn.addEventListener("click", async () => {
        try {
          await signOut(auth);
          showToast("Signed out.", "info");
        } catch (_) {
          showToast("Couldn't sign out right now.", "danger");
        }
      });
    }
  } else {
    authSlot.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" id="nav-signin-btn">Sign In</button>
    `;
    const inBtn = document.getElementById("nav-signin-btn");
    if (inBtn) {
      inBtn.addEventListener("click", () => {
        promptAuthForFeature("Sign in to sync your exams, weak-area diagnostics, and study sessions across devices.");
      });
    }
  }
}

function bindAuthModalEvents() {
  const googleBtn = document.getElementById("google-signin-btn");
  const emailForm = document.getElementById("email-auth-form");
  const toggleBtn = document.getElementById("auth-toggle-mode-btn");
  const errorBox = document.getElementById("auth-error-msg");

  const showError = (msg) => {
    if (!errorBox) return;
    if (!msg) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    } else {
      errorBox.style.display = "block";
      errorBox.textContent = msg;
    }
  };

  if (toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.dataset.bound = "true";
    toggleBtn.addEventListener("click", () => {
      isRegisterMode = !isRegisterMode;
      showError("");
      const nameGroup = document.getElementById("auth-name-group");
      const submitBtn = document.getElementById("email-auth-submit");
      const promptSpan = document.getElementById("auth-toggle-prompt");
      const titleEl = document.getElementById("auth-modal-title");

      if (isRegisterMode) {
        if (nameGroup) nameGroup.style.display = "flex";
        if (submitBtn) submitBtn.textContent = "Create Account";
        if (promptSpan) promptSpan.textContent = "Already have an account?";
        toggleBtn.textContent = "Sign In";
        if (titleEl) titleEl.textContent = "Create Your EXAMIVO Account";
      } else {
        if (nameGroup) nameGroup.style.display = "none";
        if (submitBtn) submitBtn.textContent = "Sign In";
        if (promptSpan) promptSpan.textContent = "Need an EXAMIVO account?";
        toggleBtn.textContent = "Create Account";
        if (titleEl) titleEl.textContent = "Save Your Preparation";
      }
    });
  }

  if (googleBtn && !googleBtn.dataset.bound) {
    googleBtn.dataset.bound = "true";
    googleBtn.addEventListener("click", async () => {
      showError("");
      googleBtn.disabled = true;
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        await syncUserToFirestore(cred.user);
        trackEvent("auth_completed", { method: "google" });
        closeModal("auth-modal");
        showToast("Signed in with Google.", "success");
      } catch (err) {
        showError(getHumanAuthError(err));
      } finally {
        googleBtn.disabled = false;
      }
    });
  }

  if (emailForm && !emailForm.dataset.bound) {
    emailForm.dataset.bound = "true";
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showError("");
      const email = document.getElementById("auth-email-input")?.value.trim();
      const password = document.getElementById("auth-password-input")?.value;
      const fullName = document.getElementById("auth-name-input")?.value.trim();
      const submitBtn = document.getElementById("email-auth-submit");

      if (!email || !password) {
        showError("Please enter your email and password.");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      try {
        if (isRegisterMode) {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          if (fullName) {
            await updateProfile(cred.user, { displayName: fullName });
          }
          await syncUserToFirestore(cred.user, fullName);
          trackEvent("auth_completed", { method: "email_register" });
          showToast("Account created and signed in.", "success");
        } else {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          await syncUserToFirestore(cred.user);
          trackEvent("auth_completed", { method: "email_signin" });
          showToast("Signed in.", "success");
        }
        closeModal("auth-modal");
      } catch (err) {
        showError(getHumanAuthError(err));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}
