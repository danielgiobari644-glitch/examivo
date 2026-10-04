/* ============================================================
   EXAMIVO — Utilities
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Build a DOM element. attrs: class, text, html, dataset*, aria*, on* handlers. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key.startsWith('aria-') || key.startsWith('data-')) {
      node.setAttribute(key, value);
    } else {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function humanDelay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Errors that are safe (and meant) to show to the user. */
export class HumanError extends Error {
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.name = 'HumanError';
    this.retryable = retryable;
  }
}

/* ============================================================
   File processing helpers
   Files never touch Firebase Storage. Documents are extracted to
   text in-browser (lazy-loaded readers); images are downscaled and
   streamed as base64 to the secure backend, then discarded.
   ============================================================ */

export function detectKind(file) {
  const name = file.name.toLowerCase();
  const type = file.type || '';
  if (type.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) return 'image';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/\.(docx?|odt)$/.test(name) || type.includes('word')) return 'doc';
  if (type.startsWith('text/') || /\.(txt|md|csv)$/.test(name)) return 'text';
  return 'unknown';
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new HumanError('That file could not be read. Try a different file.'));
    reader.readAsText(file);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new HumanError('A required file reader could not load. Check your connection.'));
    document.head.appendChild(s);
  });
}

/** Extract text from a PDF in-browser using pdf.js (lazy loaded, CDN). */
export async function extractPdfText(file, onProgress) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = Math.min(pdf.numPages, 60);
  let text = '';
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n\n';
    onProgress?.(i / pages);
  }
  const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length < 40) {
    throw new HumanError(
      'EXAMIVO could not read selectable text from that PDF. It may be a scan — try uploading clear page images instead.'
    );
  }
  return clean.slice(0, 60000);
}

/** Extract text from DOCX in-browser using mammoth.js (lazy loaded, CDN). */
export async function extractDocxText(file) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  const text = String(result?.value || '').trim();
  if (!text) throw new HumanError('That document appears to be empty.');
  return text.slice(0, 60000);
}

/** Downscale an image in-browser and return { dataUrl, base64, mime, width, height }. */
export async function processImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new HumanError('That image could not be read.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new HumanError('That image could not be opened. Try a JPG or PNG.'));
    image.src = dataUrl;
  });
  const maxDim = 1400;
  let { width, height } = img;
  if (Math.max(width, height) > maxDim) {
    const ratio = maxDim / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl: out, base64: out.split(',')[1], mime: 'image/jpeg', width, height };
}

/** Normalize any material input into the transport shape used by the backend. */
export async function materialFromFile(file, onProgress) {
  const kind = detectKind(file);
  if (kind === 'image') {
    const img = await processImage(file);
    return { type: 'image', fileName: file.name, sizeBytes: file.size, ...img };
  }
  if (kind === 'pdf') {
    const text = await extractPdfText(file, onProgress);
    return { type: 'text', fileName: file.name, sizeBytes: file.size, text };
  }
  if (kind === 'doc') {
    if (/\.docx?$/i.test(file.name) && file.name.toLowerCase().endsWith('.doc')) {
      throw new HumanError('Legacy .doc files are not supported. Save as .docx, PDF or TXT and try again.');
    }
    const text = await extractDocxText(file);
    return { type: 'text', fileName: file.name, sizeBytes: file.size, text };
  }
  if (kind === 'text') {
    const text = (await readFileAsText(file)).slice(0, 60000);
    if (!text.trim()) throw new HumanError('That file appears to be empty.');
    return { type: 'text', fileName: file.name, sizeBytes: file.size, text };
  }
  throw new HumanError('That file type is not supported. Use PDF, DOC, DOCX, TXT, JPG, PNG or WEBP.');
}

/** Session-scoped handoff between pages (setup → exam → results). */
export const Handoff = {
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked — non fatal */
    }
  },
  get(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  take(key) {
    const value = Handoff.get(key);
    try {
      sessionStorage.removeItem(key);
    } catch { /* ignore */ }
    return value;
  },
  cloneInto(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Session storage can overflow with large material — trim text payload.
      try {
        const slim = { ...value, material: { ...value.material, text: undefined } };
        sessionStorage.setItem(key, JSON.stringify(slim));
      } catch { /* give up silently */ }
    }
  },
};

export function queryFlag(name) {
  return new URLSearchParams(location.search).get(name);
}
