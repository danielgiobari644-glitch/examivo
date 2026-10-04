/* ============================================================
   EXAMIVO — AI provider adapter (server-side only)
   Provider-agnostic: any OpenAI-compatible chat completions API
   (OpenAI, Z.ai GLM, DeepSeek, Groq, OpenRouter, local gateways…).
   Credentials NEVER leave the server. Configure with Firebase
   secrets (see README):
     firebase functions:secrets:set AI_API_KEY
     firebase functions:config:set ai.base_url=… ai.model=…
   ============================================================ */

const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const AI_VISION_MODEL = process.env.AI_VISION_MODEL || AI_MODEL;
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 180000);

class AIConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = 'failed-precondition';
  }
}

function requireConfig() {
  if (!AI_API_KEY) {
    throw new AIConfigError(
      'The AI backend is not configured yet. The server needs an AI_API_KEY secret — see the README ("Connect the AI backend") for the one-line setup.'
    );
  }
}

/**
 * Call the chat-completions endpoint.
 * opts: { system, user, images?: [{base64, mime}], json?: boolean, temperature?, maxTokens? }
 * Returns: parsed JSON (json=true) or string.
 */
async function callAI(opts) {
  requireConfig();
  const {
    system,
    user,
    images = [],
    json = false,
    temperature = 0.65,
    maxTokens = 8000,
  } = opts;

  const useVision = images.length > 0;
  const model = useVision ? AI_VISION_MODEL : AI_MODEL;

  const content = [{ type: 'text', text: user }];
  for (const img of images) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mime || 'image/jpeg'};base64,${img.base64}`, detail: 'high' },
    });
  }

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: useVision ? content : user },
    ],
  };
  if (json) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new AIConfigError('The AI provider took too long to respond. Try again — or use a shorter material.');
    }
    throw new AIConfigError('EXAMIVO could not reach its AI provider. Check the server configuration.');
  }
  clearTimeout(timer);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[EXAMIVO AI] provider error', response.status, text.slice(0, 500));
    if (response.status === 401 || response.status === 403) {
      throw new AIConfigError('The AI provider rejected the server credentials. Verify the AI_API_KEY secret.');
    }
    if (response.status === 429) {
      throw new AIConfigError('The AI provider is rate-limiting requests right now. Give it a moment and try again.');
    }
    throw new AIConfigError('The AI provider returned an error. Try again in a moment.');
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new AIConfigError('The AI provider returned an empty response. Try again.');

  return json ? extractJson(text) : text;
}

/** Robust JSON extraction (handles fenced code blocks and stray prose). */
function extractJson(text) {
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new AIConfigError('The AI response could not be parsed. Try generating again.');
}

module.exports = { callAI, AIConfigError, AI_MODEL, AI_VISION_MODEL };
