/* ============================================================
   EXAMIVO — Setup wizard
   Progressive guided setup: class → subject → examination →
   material → AI analysis → exam focus. Each AI loading stage is
   driven by REAL work, never a fake percentage.
   ============================================================ */

import { $, el, escapeHtml, HumanError, formatBytes, materialFromFile, Handoff, queryFlag } from './utils.js';
import { CLASS_GROUPS, SUBJECTS, EXAM_TYPES, DIFFICULTIES, QUESTION_COUNTS, EXAM_MODES, DOC_ACCEPT, IMG_ACCEPT, LIMITS, examTypeLabel } from './constants.js';
import { createThemeToggle, createAILoading, toast, createAICore, setAIState, ICONS } from './ui.js';
import { analyzeMaterial } from './ai.js';
import { Store, isGuest } from './storage.js';
import { trackEvent } from './firebase.js';

createThemeToggle(document.querySelector('[data-theme-toggle]'));

/* ---------------- Session state ---------------- */
const state = {
  classLevel: null,
  subject: null,
  customSubject: '',
  examType: null,
  material: null, // { type: 'text'|'image'|'topic'|'weakareas', ... }
  count: 10,
  difficulty: 'Exam Level',
  mode: 'exam',
  timed: false,
  durationMin: 30,
  weakConcepts: [],
};

const STEPS = ['class', 'subject', 'exam', 'material', 'focus'];
let currentStep = 0;
let direction = 'forward';
const root = $('#step-root');
const backBtn = $('[data-back]');
const railBar = document.querySelector('.progress-rail .bar');
const rail = document.querySelector('.progress-rail');

/* ---------------- Weak-area quick flow ---------------- */
const focusFlag = queryFlag('focus');
if (focusFlag === 'weakareas') {
  try {
    const [areas, attempts] = await Promise.all([Store.listWeakAreas(), Store.listAttempts()]);
    const concepts = areas.filter((a) => a.status === 'needs_practice').map((a) => a.concept);
    const last = attempts[0];
    if (last) {
      state.classLevel = state.classLevel || last.config?.classLevel;
      state.subject = state.subject || last.config?.subject;
      state.examType = state.examType || last.config?.examType;
    }
    const fallback = (last?.weakAreas || []).map((w) => w.concept || w.topic).filter(Boolean);
    state.weakConcepts = concepts.length ? concepts : fallback;
    state.material = { type: 'weakareas', concepts: state.weakConcepts };
  } catch { /* proceed as normal setup */ }
}

/* ---------------- Step engine ---------------- */

function setStep(index) {
  direction = index >= currentStep ? 'forward' : 'back';
  currentStep = index;
  rail.style.display = STEPS[index] === 'focus' ? 'none' : 'block';
  const pct = Math.round(((index + 1) / STEPS.length) * 100);
  railBar.style.width = `${pct}%`;
  rail.setAttribute('aria-valuenow', String(pct));
  backBtn.hidden = index === 0 || STEPS[index] === 'focus';
  render();
}

function render() {
  const step = STEPS[currentStep];
  root.className = direction === 'forward' ? 'step-slide-in-forward' : 'step-slide-in-back';
  root.innerHTML = '';
  ({ class: renderClassStep, subject: renderSubjectStep, exam: renderExamStep, material: renderMaterialStep, focus: renderFocusStep })[step]();
}

function next() {
  if (currentStep < STEPS.length - 1) setStep(currentStep + 1);
}
function back() {
  if (currentStep > 0) setStep(currentStep - 1);
}
backBtn.addEventListener('click', back);

/* ---------------- Step 1 — Class ---------------- */

function renderClassStep() {
  const groups = CLASS_GROUPS.map((group) =>
    el(
      'div',
      { class: 'class-group' },
      el('div', { class: 'cg-label' }, el('span', { text: group.group }), el('span', { style: 'opacity:.5', text: `· ${group.hint}` })),
      el(
        'div',
        { class: 'class-grid', role: 'listbox', 'aria-label': group.group },
        group.levels.map((level) =>
          el('button', {
            class: `class-card${state.classLevel === level ? ' selected' : ''}`,
            role: 'option',
            'aria-selected': String(state.classLevel === level),
            text: level,
            onclick: (e) => {
              state.classLevel = level;
              e.currentTarget.parentElement.querySelectorAll('.class-card').forEach((c) => c.classList.remove('selected'));
              e.currentTarget.classList.add('selected', 'select-pop');
              trackEvent('class_selected', { class_level: level });
              setTimeout(next, 340);
            },
          })
        )
      )
    )
  );

  root.appendChild(
    el(
      'div',
      { class: 'step' },
      el(
        'div',
        { class: 'step-heading' },
        el('span', { class: 'step-kicker', text: 'Step 1 of 4' }),
        el('h1', { text: 'What are you preparing for?' }),
        el('p', { text: 'EXAMIVO adapts its vocabulary, depth and question style to your class.' })
      ),
      el('div', { class: 'class-groups' }, groups)
    )
  );
}

/* ---------------- Step 2 — Subject ---------------- */

function renderSubjectStep() {
  const otherInput = el('input', {
    class: 'input subject-other-input',
    id: 'subject-other',
    type: 'text',
    placeholder: 'Type your subject — e.g. Marketing, Yoruba, Statistics',
    value: state.customSubject,
    'aria-label': 'Custom subject',
  });

  const grid = el(
    'div',
    { class: 'subject-grid', role: 'listbox', 'aria-label': 'Subjects' },
    SUBJECTS.map((subject) =>
      el('button', {
        class: `chip${state.subject === subject ? ' selected' : ''}`,
        role: 'option',
        'aria-selected': String(state.subject === subject),
        text: subject,
        onclick: (e) => {
          state.subject = subject === 'Other' ? 'Other' : subject;
          grid.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
          e.currentTarget.classList.add('selected', 'select-pop');
          if (subject === 'Other') {
            otherInput.classList.add('show');
            otherInput.focus();
          } else {
            otherInput.classList.remove('show');
            trackEvent('subject_selected', { subject });
            setTimeout(next, 340);
          }
        },
      })
    )
  );

  otherInput.addEventListener('input', () => {
    state.customSubject = otherInput.value.trim();
  });
  otherInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.customSubject.length > 1) {
      state.subject = 'Other';
      trackEvent('subject_selected', { subject: state.customSubject });
      next();
    }
  });

  root.appendChild(
    el(
      'div',
      { class: 'step' },
      el(
        'div',
        { class: 'step-heading' },
        el('span', { class: 'step-kicker', text: 'Step 2 of 4' }),
        el('h1', { text: 'What subject?' }),
        el('p', { text: `${state.classLevel} · EXAMIVO tunes questions to this subject\u2019s syllabus expectations.` })
      ),
      grid,
      otherInput
    )
  );
}

/* ---------------- Step 3 — Examination ---------------- */

function renderExamStep() {
  const subjectLabel = state.subject === 'Other' ? state.customSubject || 'your subject' : state.subject;
  const grid = el(
    'div',
    { class: 'exam-grid', role: 'listbox', 'aria-label': 'Examination types' },
    EXAM_TYPES.map((exam) => {
      const selected = state.examType === exam.id;
      return el(
        'button',
        {
          class: `exam-card${selected ? ' selected' : ''}`,
          role: 'option',
          'aria-selected': String(selected),
          onclick: (e) => {
            state.examType = exam.id;
            grid.querySelectorAll('.exam-card').forEach((c) => c.classList.remove('selected'));
            e.currentTarget.classList.add('selected', 'select-pop');
            trackEvent('exam_type_selected', { exam_type: exam.id });
            setTimeout(next, 340);
          },
        },
        el(
          'span',
          { class: 'ec-name' },
          el('span', { text: exam.label }),
          selected ? el('span', { class: 'ec-check', html: '✓', 'aria-hidden': 'true' }) : null
        ),
        el('span', { class: 'ec-desc', text: exam.desc })
      );
    })
  );

  root.appendChild(
    el(
      'div',
      { class: 'step' },
      el(
        'div',
        { class: 'step-heading' },
        el('span', { class: 'step-kicker', text: 'Step 3 of 4' }),
        el('h1', { text: 'What examination?' }),
        el('p', { text: `${subjectLabel} · The exam format shapes question style, structure and marking depth.` })
      ),
      grid
    )
  );
}

/* ---------------- Step 4 — Material + options ---------------- */

let materialCardEls = null;

function renderMaterialStep() {
  const subjectLabel = state.subject === 'Other' ? state.customSubject || 'your subject' : state.subject;

  const panelHolder = el('div', { class: 'material-panel' });

  const cards = {
    doc: {
      icon: ICONS.doc,
      title: 'Upload Document',
      desc: 'PDF, DOC, DOCX, TXT — handouts, slides, notes.',
    },
    image: {
      icon: ICONS.image,
      title: 'Upload Image',
      desc: 'JPG, PNG, WEBP — photos of notes, textbook pages, screenshots.',
    },
    paste: {
      icon: ICONS.text,
      title: 'Paste Text',
      desc: 'Copy your notes or a chapter straight into EXAMIVO.',
    },
    topic: {
      icon: ICONS.topic,
      title: 'Enter a Topic',
      desc: 'Just a topic? EXAMIVO builds from your class, subject and exam.',
    },
  };

  materialCardEls = {};
  const grid = el(
    'div',
    { class: 'material-grid' },
    Object.entries(cards).map(([key, meta]) => {
      const card = el(
        'button',
        {
          class: `material-card${state.material?.inputKind === key ? ' selected' : ''}`,
          'data-kind': key,
          onclick: () => selectMaterialKind(key),
        },
        el('span', { class: 'mc-icon', html: meta.icon, 'aria-hidden': 'true' }),
        el('h3', { text: meta.title }),
        el('p', { text: meta.desc })
      );
      materialCardEls[key] = card;
      return card;
    })
  );

  /* ----- Options UI ----- */
  const countSeg = el(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Question count' },
    QUESTION_COUNTS.map((n) =>
      el('button', {
        text: String(n),
        'aria-pressed': String(state.count === n),
        onclick: (e) => {
          state.count = n;
          countSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
          e.currentTarget.setAttribute('aria-pressed', 'true');
        },
      })
    )
  );

  const diffSeg = el(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Difficulty' },
    DIFFICULTIES.map((d) =>
      el('button', {
        text: d,
        'aria-pressed': String(state.difficulty === d),
        onclick: (e) => {
          state.difficulty = d;
          diffSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
          e.currentTarget.setAttribute('aria-pressed', 'true');
        },
      })
    )
  );

  const modeCards = el(
    'div',
    { class: 'mode-cards', role: 'group', 'aria-label': 'Exam mode' },
    EXAM_MODES.map((m) =>
      el(
        'button',
        {
          class: `mode-card${state.mode === m.id ? ' selected' : ''}`,
          'aria-pressed': String(state.mode === m.id),
          onclick: (e) => {
            state.mode = m.id;
            modeCards.querySelectorAll('.mode-card').forEach((c) => c.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
          },
        },
        el('span', { class: 'mc-title' }, el('span', { text: m.label }), state.mode === m.id ? el('span', { class: 'ec-check', html: '✓' }) : null),
        el('span', { class: 'mc-desc', text: m.desc })
      )
    )
  );

  const timedToggle = el('button', {
    class: `chip${state.timed ? ' selected' : ''}`,
    text: state.timed ? 'Timed' : 'Untimed',
    'aria-pressed': String(state.timed),
    onclick: () => {
      state.timed = !state.timed;
      timedToggle.classList.toggle('selected', state.timed);
      timedToggle.textContent = state.timed ? 'Timed' : 'Untimed';
      timedToggle.setAttribute('aria-pressed', String(state.timed));
      durationRow.classList.toggle('show', state.timed);
    },
  });

  const durationInput = el('input', {
    class: 'input tabular',
    type: 'number',
    min: '5',
    max: '180',
    value: String(state.durationMin),
    'aria-label': 'Duration in minutes',
  });
  durationInput.addEventListener('change', () => {
    state.durationMin = Math.min(180, Math.max(5, Number(durationInput.value) || 30));
  });
  const durationRow = el(
    'div',
    { class: `duration-row${state.timed ? ' show' : ''}` },
    el('span', { style: 'font-size:.86rem;color:var(--text-secondary)', text: 'Duration (minutes)' }),
    durationInput
  );

  const weakBanner = state.material?.type === 'weakareas'
    ? el(
        'div',
        { class: 'weak-banner' },
        el('span', { text: '◎', 'aria-hidden': 'true', style: 'font-size:1.1rem' }),
        el(
          'div',
          {},
          el('strong', { text: 'Targeting your weak areas.' }),
          el('p', { style: 'font-size:.88rem;color:var(--text-secondary);margin-top:.2rem', text: 'EXAMIVO will focus this practice on the concepts below. Add extra material if you like — or go straight to analysis.' }),
          el('div', { class: 'wb-list' }, state.weakConcepts.map((c) => el('span', { class: 'badge badge-amber', text: c })))
        )
      )
    : null;

  const analyzeBtn = el(
    'button',
    {
      class: 'btn btn-primary btn-lg',
      html: `Analyze & Build Focus ${ICONS.arrowRight}`,
      onclick: () => runAnalysis(),
    }
  );

  root.appendChild(
    el(
      'div',
      { class: 'step' },
      weakBanner,
      el(
        'div',
        { class: 'step-heading', style: weakBanner ? 'margin-bottom:1.6rem' : '' },
        el('span', { class: 'step-kicker', text: 'Step 4 of 4' }),
        el('h1', { text: 'What are you studying?' }),
        el('p', { text: `${state.classLevel} · ${subjectLabel} · ${examTypeLabel(state.examType)}` })
      ),
      grid,
      panelHolder,
      el(
        'div',
        { class: 'options-panel' },
        el('div', { class: 'option-row' }, el('div', {}, el('span', { class: 'or-label', text: 'Questions' }), el('span', { class: 'or-hint', text: 'How many questions to generate' })), countSeg),
        el('div', { class: 'option-row' }, el('div', {}, el('span', { class: 'or-label', text: 'Difficulty' }), el('span', { class: 'or-hint', text: 'Affects reasoning depth, not just wording' })), diffSeg),
        el('div', { class: 'option-row', style: 'flex-direction:column;align-items:stretch' }, el('span', { class: 'or-label' }, 'Mode', el('span', { class: 'or-hint', text: 'How you want to practice today' })), modeCards),
        el('div', { class: 'option-row' }, el('div', {}, el('span', { class: 'or-label', text: 'Timer' }), el('span', { class: 'or-hint', text: 'Exam-style countdown or untimed practice' })), timedToggle),
        durationRow
      ),
      el('div', { class: 'step-actions' }, analyzeBtn)
    )
  );

  function selectMaterialKind(kind) {
    Object.values(materialCardEls).forEach((c) => c.classList.remove('selected'));
    materialCardEls[kind]?.classList.add('selected', 'select-pop');
    buildPanel(kind);
  }

  function buildPanel(kind) {
    panelHolder.classList.remove('show');
    panelHolder.innerHTML = '';
    state.material = state.material?.type === 'weakareas' ? state.material : null;

    if (kind === 'doc' || kind === 'image') {
      const input = el('input', { type: 'file', accept: kind === 'doc' ? DOC_ACCEPT : IMG_ACCEPT, class: 'sr-only' });
      const zone = el(
        'div',
        { class: 'dropzone', role: 'button', tabindex: '0', 'aria-label': kind === 'doc' ? 'Upload document' : 'Upload image' },
        el('span', { class: 'dz-icon', html: kind === 'doc' ? ICONS.upload : ICONS.image, 'aria-hidden': 'true' }),
        el('h3', { text: kind === 'doc' ? 'Drop your document here' : 'Drop your image here' }),
        el('p', { text: 'or click to browse' }),
        el('p', { class: 'dz-hint', text: kind === 'doc' ? 'PDF · DOC · DOCX · TXT — up to 20 MB' : 'JPG · JPEG · PNG · WEBP — up to 12 MB' })
      );
      zone.addEventListener('click', () => input.click());
      zone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
      ['dragenter', 'dragover'].forEach((evt) =>
        zone.addEventListener(evt, (e) => {
          e.preventDefault();
          zone.classList.add('dragover');
        })
      );
      ['dragleave', 'drop'].forEach((evt) =>
        zone.addEventListener(evt, (e) => {
          e.preventDefault();
          zone.classList.remove('dragover');
        })
      );
      zone.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFile(file);
      });
      input.addEventListener('change', () => {
        if (input.files?.[0]) handleFile(input.files[0]);
      });

      panelHolder.append(zone, input);
      panelHolder.classList.add('show');
    }

    if (kind === 'paste') {
      const ta = el('textarea', {
        class: 'textarea',
        placeholder: 'Paste your notes, a chapter, definitions — anything you\u2019re studying.',
        'aria-label': 'Paste your study text',
      });
      let t;
      ta.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const text = ta.value.trim();
          state.material = text.length > 20 ? { type: 'text', inputKind: 'paste', fileName: 'Pasted text', text } : null;
          updateReadout();
        }, 300);
      });
      panelHolder.append(ta);
      panelHolder.classList.add('show');
      setTimeout(() => ta.focus(), 60);
    }

    if (kind === 'topic') {
      const input = el('input', {
        class: 'input',
        type: 'text',
        placeholder: `e.g. ${subjectGuess()} — enter one topic or a short list`,
        'aria-label': 'Topic',
      });
      input.addEventListener('input', () => {
        const v = input.value.trim();
        state.material = v.length > 1 ? { type: 'topic', inputKind: 'topic', topic: v } : null;
        updateReadout();
      });
      panelHolder.append(input);
      panelHolder.classList.add('show');
      setTimeout(() => input.focus(), 60);
    }
  }

  function subjectGuess() {
    const s = state.subject === 'Other' ? state.customSubject : state.subject;
    return s === 'Mathematics' ? 'Quadratic equations' : s === 'Biology' ? 'Photosynthesis' : 'Your topic';
  }

  async function handleFile(file) {
    const kind = state.material?.inputKind || (file.type.startsWith('image/') ? 'image' : 'doc');
    if (kind === 'image' && file.size > LIMITS.maxImageBytes) {
      return toast('That image is larger than 12 MB. Try a smaller one.', 'warning');
    }
    if (kind === 'doc' && file.size > LIMITS.maxDocBytes) {
      return toast('That document is larger than 20 MB.', 'warning');
    }
    const readout = el('div', { class: 'material-readout' }, el('span', { class: 'ai-status-line', dataset: { state: 'reading' } }, el('span', { class: 'pulse-dot' }), el('span', { text: `Reading ${file.name}…` })));
    panelHolder.querySelector('.material-readout')?.remove();
    panelHolder.appendChild(readout);

    try {
      const material = await materialFromFile(file);
      material.inputKind = kind;
      state.material = material;
      trackEvent('material_uploaded', { material_type: material.type, size_bytes: file.size });

      // Replace zone with a file chip + preview
      const zoneEl = panelHolder.querySelector('.dropzone');
      const chip = el(
        'div',
        { class: 'file-chip' },
        el('span', { class: 'fc-icon', html: material.type === 'image' ? ICONS.image : ICONS.doc, 'aria-hidden': 'true' }),
        el(
          'span',
          { class: 'fc-main' },
          el('div', { class: 'fc-name', text: file.name }),
          el('div', { class: 'fc-meta', text: `${formatBytes(file.size)} · ${material.type === 'image' ? 'Image ready for analysis' : `${(material.text || '').length.toLocaleString()} characters extracted`}` })
        ),
        el('button', {
          class: 'fc-remove',
          'aria-label': 'Remove file',
          html: ICONS.trash,
          onclick: () => {
            state.material = null;
            buildPanel(kind);
            updateReadout();
          },
        })
      );
      if (material.type === 'image') {
        const img = el('img', { class: 'image-preview', src: material.dataUrl, alt: `Preview of ${file.name}` });
        panelHolder.append(chip, img);
      } else {
        panelHolder.append(chip);
      }
      zoneEl?.remove();
      panelHolder.querySelector('.material-readout')?.remove();
      panelHolder.appendChild(
        el(
          'div',
          { class: 'material-readout' },
          (() => {
            const core = createAICore({ size: 26, state: 'reading' });
            setTimeout(() => setAIState(core, 'idle'), 1600);
            return core;
          })(),
          el('span', { text: material.type === 'image' ? 'Attached. EXAMIVO will read it visually during analysis.' : 'Attached. EXAMIVO will study it during analysis.' })
        )
      );
      updateReadout();
    } catch (err) {
      panelHolder.querySelector('.material-readout')?.remove();
      toast(err instanceof HumanError ? err.message : 'That file could not be processed. Try another one.', 'error');
    }
  }

  function updateReadout() {
    const existing = root.querySelector('[data-ready-note]');
    existing?.remove();
    if (state.material) {
      const label =
        state.material.type === 'topic'
          ? `Topic mode: EXAMIVO will build practice around “${escapeHtml(state.material.topic)}”.`
          : state.material.type === 'weakareas'
            ? 'Weak-area mode: this practice targets your flagged concepts.'
            : state.material.type === 'image'
              ? 'Image attached and ready.'
              : `Text ready — ${state.material.text?.length?.toLocaleString() || 0} characters.`;
      analyzeBtn.parentElement.before(
        el('p', { 'data-ready-note': '', style: 'text-align:center;color:var(--primary-strong);font-size:.9rem;font-weight:500;margin-top:1.4rem', html: `✓ ${label}` })
      );
    }
  }

  if (state.material?.type === 'weakareas') updateReadout();
}

/* ---------------- Analysis → Exam Focus ---------------- */

async function runAnalysis() {
  const subject = state.subject === 'Other' ? state.customSubject : state.subject;

  if (!state.classLevel) return toast('Select your class first.', 'warning');
  if (!subject) return toast('Select a subject first.', 'warning');
  if (!state.examType) return toast('Select your examination first.', 'warning');

  const needsMaterial = state.material?.type !== 'weakareas';
  if (needsMaterial && !state.material) {
    return toast('Give EXAMIVO something to work with — upload, paste, or enter a topic.', 'warning');
  }
  if (state.material?.type === 'text' && (state.material.text || '').length < 60) {
    return toast('That text is too short to analyze. Add more material or enter a topic instead.', 'warning');
  }

  const config = {
    classLevel: state.classLevel,
    subject,
    examType: state.examType,
    count: state.count,
    difficulty: state.difficulty.toLowerCase().replace(' ', '_'),
    mode: state.mode,
    timed: state.timed,
    durationMin: state.timed ? state.durationMin : null,
  };

  trackEvent('practice_started', {
    class_level: config.classLevel,
    subject: config.subject,
    exam_type: config.examType,
    material_type: state.material?.type || 'none',
  });

  const loading = createAILoading({
    title: 'EXAMIVO IS ANALYZING',
    subtitle: 'Your material is being studied — not just skimmed.',
    stages: ['Reading your material', 'Analyzing content & concepts', 'Building your exam focus'],
  });
  document.body.appendChild(loading.overlay);

  try {
    // Stage 0 — local reading already happened (real); mark done, start the call.
    loading.start(0);
    if (state.material?.type === 'text') await new Promise((r) => setTimeout(r, 200));
    loading.done(0);

    // Stage 1 — real analyzeMaterial call.
    loading.start(1, `Adapting to ${config.classLevel} · ${config.subject}`);
    const analysis = await analyzeMaterial({ config, material: sanitizeMaterial(state.material) });
    loading.done(1);

    // Stage 2 — building the focus view (real render work).
    loading.start(2, 'Prioritizing your focus areas');
    loading.done(2);
    loading.complete('Your exam focus is ready.');
    await new Promise((r) => setTimeout(r, 480));
    await loading.close();

    state.analysis = analysis;
    state.config = config;
    setStep(currentStep + 1); // → focus
  } catch (err) {
    loading.fail(err?.retryable === false ? err.message : null);
    await new Promise((r) => setTimeout(r, 1400));
    await loading.close();
    toast(err.message || 'EXAMIVO couldn’t analyze that material. Try again.', 'error');
  }
}

function sanitizeMaterial(material) {
  if (!material) return null;
  const clone = { ...material };
  if (clone.dataUrl) delete clone.dataUrl; // transport keeps base64 only
  return clone;
}

/* ---------------- Step 5 — Exam Focus ---------------- */

function renderFocusStep() {
  const { analysis, config } = state;
  const focus = analysis?.focus || { highPriority: analysis?.keyConcepts?.slice(0, 3) || [], alsoRevise: [], rationale: '' };
  const materialLabel =
    state.material?.type === 'topic'
      ? `Topic: “${state.material.topic}”`
      : state.material?.type === 'weakareas'
        ? 'Your weak areas'
        : state.material?.type === 'image'
          ? `Image: ${state.material.fileName}`
          : state.material?.type === 'text'
            ? `Material: ${state.material.fileName}`
            : 'No material — built from your class, subject and exam';

  const startBtn = el(
    'button',
    {
      class: 'btn btn-primary btn-lg',
      html: `Generate My Exam ${ICONS.arrowRight}`,
      onclick: () => {
        Handoff.set('examivo.session', {
          config: state.config,
          analysis: state.analysis,
          materialMeta: {
            type: state.material?.type || null,
            fileName: state.material?.fileName || null,
            hasImage: state.material?.type === 'image',
            imageBase64: state.material?.type === 'image' ? state.material.base64 : null,
            imageMime: state.material?.type === 'image' ? state.material.mime : null,
          },
        });
        trackEvent('focus_confirmed', { subject: config.subject });
        location.href = 'exam.html';
      },
    }
  );

  root.innerHTML = '';
  root.className = 'step-slide-in-forward';
  root.appendChild(
    el(
      'div',
      { class: 'focus-wrap' },
      el(
        'div',
        { class: 'step-heading' },
        el('span', { class: 'step-kicker', text: 'Exam Focus' }),
        el('h1', { text: 'Here\u2019s what matters most.' }),
        el('p', { class: 'focus-material-note', text: materialLabel })
      ),
      el(
        'div',
        { class: 'focus-summary' },
        summaryChip(config.classLevel),
        summaryChip(config.subject),
        summaryChip(examTypeLabel(config.examType)),
        summaryChip(`${config.count} questions`),
        summaryChip(difficultyLabel(config.difficulty)),
        summaryChip(config.mode === 'exam' ? 'Exam Mode' : 'Practice Mode'),
        summaryChip(config.timed ? `${config.durationMin} min timed` : 'Untimed')
      ),
      el(
        'div',
        { class: 'focus-columns' },
        el(
          'div',
          { class: 'card focus-card' },
          el(
            'div',
            { class: 'fc-head' },
            el('span', { class: 'badge badge-teal', text: 'High Priority' })
          ),
          el('div', { class: 'focus-tags' }, (focus.highPriority || []).map((c) => el('span', { class: 'focus-tag priority', text: c })))
        ),
        (focus.alsoRevise || []).length
          ? el(
              'div',
              { class: 'card focus-card' },
              el('div', { class: 'fc-head' }, el('span', { class: 'badge badge-neutral', text: 'Also Revise' })),
              el('div', { class: 'focus-tags' }, focus.alsoRevise.map((c) => el('span', { class: 'focus-tag', text: c })))
            )
          : null
      ),
      focus.rationale
        ? el('div', { class: 'focus-rationale', html: focus.rationale })
        : null,
      el('p', { class: 'focus-disclaimer', text: 'Prioritized based on the selected examination format and your supplied material — not a prediction of exact questions.' }),
      el('div', { class: 'step-actions' }, startBtn)
    )
  );
}

function summaryChip(text) {
  return el('span', { class: 'badge badge-neutral', text });
}

function difficultyLabel(d) {
  return (d || '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------------- Boot ---------------- */

if (focusFlag === 'weakareas') {
  // Jump straight to material step in weak-area mode.
  currentStep = 3;
  railBar.style.width = '100%';
  backBtn.hidden = false;
  render();
} else {
  setStep(0);
}

trackEvent('setup_viewed');
