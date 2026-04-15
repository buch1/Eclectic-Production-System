/**
 * Shared proxy handler for Claude API requests.
 *
 * Runs as a Vercel serverless function (see api/claude.ts) and is also mounted
 * by the local Express dev server (see server/dev.ts). Both call through this
 * single handler so behavior is identical in dev and prod.
 *
 * Contract:
 *   POST /api/claude
 *   Headers: Authorization: Bearer <PROXY_AUTH_TOKEN>
 *   Body: { system: string, messages: Message[], model?: string, max_tokens?: number, metadata?: object }
 *   Response: the raw Anthropic /v1/messages response
 *
 * The API key is never exposed to the client. The client only knows PROXY_AUTH_TOKEN,
 * which authorizes requests to this proxy.
 */

export interface ProxyRequestBody {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /** Pass-through metadata the server logs but does not forward to Anthropic. */
  metadata?: Record<string, unknown>;
}

export interface ProxyResponse {
  status: number;
  body: unknown;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Retry policy for transient upstream failures (Anthropic 429 rate-limits
 * and 5xx overload/server errors). Deliberately small — a request mid-edit
 * shouldn't hang for long. Backoff: 1s, 2s, 4s.
 */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAnthropic(payload: unknown, apiKey: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });
      if (RETRY_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError ?? new Error('Upstream request failed after retries');
}

/** Structured proxy log — one line per request, JSON for easy ingestion. */
function logRequest(entry: {
  ts: string;
  stage: unknown;
  model: string;
  status: number;
  ms: number;
  input_tokens?: number;
  output_tokens?: number;
  error?: string;
}): void {
  // eslint-disable-next-line no-console
  console.log('[proxy]', JSON.stringify(entry));
}

export async function handleProxyRequest(args: {
  method: string;
  authHeader: string | undefined;
  body: unknown;
}): Promise<ProxyResponse> {
  const { method, authHeader, body } = args;

  if (method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed' } };
  }

  const expectedToken = process.env.PROXY_AUTH_TOKEN;
  if (!expectedToken) {
    return {
      status: 500,
      body: { error: 'Server misconfigured: PROXY_AUTH_TOKEN not set' },
    };
  }

  const presentedToken = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  if (presentedToken !== expectedToken) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      body: { error: 'Server misconfigured: ANTHROPIC_API_KEY not set' },
    };
  }

  const parsed = parseBody(body);
  if ('error' in parsed) {
    return { status: 400, body: { error: parsed.error } };
  }

  const payload = {
    model: parsed.model ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODEL,
    max_tokens: parsed.max_tokens ?? DEFAULT_MAX_TOKENS,
    system: parsed.system,
    messages: parsed.messages,
    ...(parsed.temperature !== undefined ? { temperature: parsed.temperature } : {}),
  };

  const stage = parsed.metadata?.stage;
  const started = Date.now();

  try {
    const res = await fetchAnthropic(payload, apiKey);
    const data = (await res.json().catch(() => ({ error: 'Invalid JSON from Anthropic' }))) as
      | { usage?: { input_tokens?: number; output_tokens?: number }; error?: unknown }
      | Record<string, unknown>;
    logRequest({
      ts: new Date().toISOString(),
      stage,
      model: payload.model,
      status: res.status,
      ms: Date.now() - started,
      input_tokens:
        typeof (data as { usage?: { input_tokens?: number } }).usage?.input_tokens === 'number'
          ? (data as { usage: { input_tokens: number } }).usage.input_tokens
          : undefined,
      output_tokens:
        typeof (data as { usage?: { output_tokens?: number } }).usage?.output_tokens === 'number'
          ? (data as { usage: { output_tokens: number } }).usage.output_tokens
          : undefined,
    });
    return { status: res.status, body: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logRequest({
      ts: new Date().toISOString(),
      stage,
      model: payload.model,
      status: 502,
      ms: Date.now() - started,
      error: message,
    });
    return { status: 502, body: { error: `Upstream request failed: ${message}` } };
  }
}

function parseBody(raw: unknown):
  | ProxyRequestBody
  | { error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { error: 'Body must be a JSON object' };
  }
  const b = raw as Record<string, unknown>;
  if (typeof b.system !== 'string' || b.system.length === 0) {
    return { error: 'Missing or invalid "system" (string) in body' };
  }
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return { error: 'Missing or invalid "messages" (non-empty array) in body' };
  }
  for (const m of b.messages) {
    if (
      typeof m !== 'object' ||
      m === null ||
      ((m as { role: unknown }).role !== 'user' && (m as { role: unknown }).role !== 'assistant') ||
      typeof (m as { content: unknown }).content !== 'string'
    ) {
      return { error: 'Each message must be { role: "user"|"assistant", content: string }' };
    }
  }
  return {
    system: b.system,
    messages: b.messages as ProxyRequestBody['messages'],
    model: typeof b.model === 'string' ? b.model : undefined,
    max_tokens: typeof b.max_tokens === 'number' ? b.max_tokens : undefined,
    temperature: typeof b.temperature === 'number' ? b.temperature : undefined,
    metadata:
      typeof b.metadata === 'object' && b.metadata !== null
        ? (b.metadata as Record<string, unknown>)
        : undefined,
  };
}
