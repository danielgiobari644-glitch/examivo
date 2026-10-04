# EXAMIVO

**Prepare for the exam, not just the subject.**
Your study material. Your exam. Your AI preparation.

EXAMIVO is an AI-powered exam preparation platform. It turns a student's study material — PDF,
document, image, photo of notes, screenshot, pasted text or just a topic — into a targeted,
exam-format-aware practice experience: analysis → exam focus → original questions → grading →
weak-area engine → follow-up practice.

---

## 1. Technology (as specified)

- Pure HTML · Pure CSS · Vanilla JavaScript (ES modules, no build step, no frameworks)
- Firebase modular SDK (Auth + Firestore + Analytics, loaded from the gstatic CDN)
- Firebase Cloud Functions (v2) as the **only** place AI credentials exist
- Firebase Hosting + Firestore security rules
- PWA: `manifest.json` + `service-worker.js` (installable, offline-aware)
- No React/Next/Vue/Tailwind/Bootstrap. No Firebase Storage — documents are extracted
  in-browser and images are streamed as base64 through the secure backend, then discarded.

## 2. File structure

```
examivo/
├── index.html            Landing page (public, real page — not the login screen)
├── app.html              Dashboard (welcome, progress, recent practice, weak areas)
├── setup.html            Progressive guided setup (class → subject → exam → material → focus)
├── exam.html             Exam runtime (generation loading, exam/practice modes, timer)
├── results.html          Score reveal, performance bands, question review, weak-area engine
├── history.html          Exam history
├── study.html            Study My Mistakes (revision notes, examples, practice, retest)
├── manifest.json         PWA manifest
├── service-worker.js     PWA service worker (static cache, never caches Firebase/API)
├── firebase.json         Hosting + Firestore + Functions config
├── .firebaserc           Project: examivo
├── firestore.rules       Owner-only private data; admin-only config; no open rules
├── firestore.indexes.json
├── css/                  global (design system) · landing · app · setup · exam · results · animations
├── js/
│   ├── firebase.js       Firebase init (modular SDK) + analytics helper
│   ├── constants.js      Classes, subjects, exam types, limits, storage keys
│   ├── utils.js          DOM helpers, file processing (PDF/DOCX/image), handoff
│   ├── ui.js             Theme (dark/light/system), toasts, modals, AI core + AI states,
│   │                     staged AI loading overlays, empty states, offline banner
│   ├── storage.js        Store facade: Firestore for accounts, localStorage for guests,
│   │                     guest→account migration
│   ├── ai.js             Cloud Function calls + client-side question validation + grading
│   ├── auth.js           Google + email/password, friendly auth errors, account prompts
│   ├── app-shell.js      Shared app header/nav/auth widget
│   ├── landing.js  app.js  setup.js  exams.js  questions.js  results.js  study.js  history.js
├── functions/
│   ├── index.js          analyzeMaterial · generateQuestions · gradeAnswers · studyMistakes
│   ├── ai.js             Provider-agnostic AI adapter (OpenAI-compatible endpoints)
│   ├── profiles.js       Class-adaptive language profiles + exam format profiles
│   └── package.json
└── assets/               logo, PWA icons, favicon
```

## 3. Run locally

Any static server works (ES modules need http://, not file://):

```bash
cd examivo
npx serve .            # or: python3 -m http.server 8080
```

## 4. Connect Firebase (one-time, ~5 minutes)

The Firebase web config in `js/firebase.js` is already set to the EXAMIVO project.

1. **Authentication** — Firebase console → Authentication → Sign-in method → enable
   **Google** and **Email/Password**. Add your local/preview domain under
   Authentication → Settings → Authorized domains.
2. **Firestore** — Firebase console → Firestore Database → Create database
   (production mode). The security rules in `firestore.rules` are deployed in step 4.
3. **Upgrade to Blaze** — Cloud Functions require the pay-as-you-go plan
   (the AI functions have a generous free tier on most AI providers).
4. **Deploy backend + rules + hosting:**

```bash
npm i -g firebase-tools
firebase login
cd examivo
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
firebase deploy --only hosting
```

## 5. Connect the AI backend (one secret, that's it)

The backend speaks to **any OpenAI-compatible chat API** (OpenAI, Z.ai GLM, DeepSeek, Groq,
OpenRouter, a self-hosted gateway…). Configure with Firebase secrets:

```bash
cd examivo
firebase functions:secrets:set AI_API_KEY        # paste the provider's API key

# optional overrides (defaults shown):
firebase functions:secrets:set AI_BASE_URL       # default: https://api.openai.com/v1
firebase functions:secrets:set AI_MODEL          # default: gpt-4o-mini
firebase functions:secrets:set AI_VISION_MODEL   # default: AI_MODEL (needed for photo-of-notes analysis)

firebase deploy --only functions
```

Without a key, the app still runs — material analysis will return a clear
"backend isn't configured" message (never a raw stack trace).

## 6. Architecture & security model

```
Browser (pure HTML/CSS/JS)
   ↓  httpsCallable
Firebase Cloud Functions (secrets live here only)
   ↓  HTTPS
AI provider (OpenAI-compatible)
   ↓
validated JSON → Browser
```

- **No AI key ever reaches the frontend.** The Firebase web config is public by design.
- **Server-side validation:** every generated question passes a strict schema validator
  (type, options, correct-answer bounds, duplicates, explanation presence) with automatic
  retries before anything reaches the student. The client validates again.
- **Firestore rules:** every user-scoped path (`users/{uid}/attempts|exams|weakAreas|…`)
  is owner-only. `subjects`, `examProfiles`, `classProfiles` are public read / admin write
  (admin = custom claim `admin: true`). No `allow read, write: if true` anywhere.
- **No Firebase Storage:** PDF/DOCX/TXT are parsed in the browser (pdf.js / mammoth, lazy
  loaded), images are downscaled to ≤1400 px and sent as base64 to the function, used once,
  then discarded.

## 7. Honest loading, honest scores

- AI loading screens show **real stage progression** — a stage only completes when its actual
  work completes (local extraction, the real function call, real client validation).
  No fake percentages.
- Scores are computed from actual answers. Open-ended questions (short answer / theory /
  essay) are graded by the backend marking engine; if grading is unavailable they are
  excluded from the automatic score and clearly marked for self-review against the model
  answer — never faked.
- Weak areas are derived per-topic from the student's real answers, with evidence
  ("2/3 questions on this concept weren't solid") and a plain-language explanation of how.

## 8. Product notes

- **Try before account:** everything works as a guest (localStorage). Creating an account
  (Google or email) migrates guest history into Firestore automatically.
- **Class-adaptive language:** Primary (simple concrete English) → JSS (clear academic) →
  SS (senior-secondary precision) → University (full terminology). Implemented in
  `functions/profiles.js` and enforced in every prompt.
- **Exam-format awareness:** WAEC/NECO/JAMB/Common Entrance/School/Mock/Quiz/… each carry a
  question-type mix, style guide and marking conventions that steer generation.
- **Accessibility:** semantic HTML, keyboard navigation, visible focus, ARIA labels,
  `prefers-reduced-motion` support, accessible contrast in both themes.

## 9. Troubleshooting — CORS errors & “functions/internal internal”

A healthy v2 callable function answers browser CORS preflights automatically. So when the
console shows an error like this, the request **never reached a healthy function** — the
missing `Access-Control-Allow-Origin` header is a symptom, not the disease:

```
Access to fetch at 'https://us-central1-<project>.cloudfunctions.net/analyzeMaterial' … has
been blocked by CORS policy: Response to preflight request doesn't pass access control check
[EXAMIVO] AI call failed: functions/internal internal
```

EXAMIVO detects exactly this signature (`js/ai.js`), probes the `health` endpoint live, and
shows a message naming the real problem. To fix it by hand, work through this checklist in order:

1. **Blaze plan** — Cloud Functions can only be deployed on the pay-as-you-go (Blaze) plan.
   On the free Spark plan the deploy fails and the function URLs don't exist → every call
   404s → the browser reports it as a CORS error.
2. **Secret set BEFORE deploy** — run `firebase functions:secrets:set AI_API_KEY` first.
   A deploy where a referenced secret is missing fails for every function that uses it.
3. **Deploy actually succeeded** — run `firebase deploy --only functions` inside the
   `examivo/` folder and read the output: all five functions (`health`, `analyzeMaterial`,
   `generateQuestions`, `gradeAnswers`, `studyMistakes`) should end with a ✔ / "Deployed!".
4. **Same project & region as the frontend** — the browser calls
   `https://us-central1-<projectId>.cloudfunctions.net/<fn>` using `projectId` from
   `js/firebase.js`. The region is fixed to `us-central1` in `functions/index.js`
   (`setGlobalOptions`). A mismatch = 404 = CORS error.
5. **One-click check** — open `https://us-central1-<your-project-id>.cloudfunctions.net/health`
   in a browser. You should see `{"ok":true,...}`. If you don't, the functions are not
   deployed or not reachable — go back to step 3.
6. **Cold-start crashes** — if `health` responds but the AI calls don't, look for startup
   errors with `firebase functions:log` (e.g. a bad Node version or missing module).

After changing anything under `functions/`, always redeploy (`npm run deploy` inside
`examivo/functions/`) — frontend-only changes need no redeploy.
