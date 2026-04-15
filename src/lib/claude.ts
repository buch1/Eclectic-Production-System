/**
 * Client-side wrapper for /api/claude.
 *
 * The client never sees the Anthropic API key. It only holds PROXY_AUTH_TOKEN
 * (a shared secret, provided via VITE_PROXY_AUTH_TOKEN at build time, or via
 * the in-app auth gate for runtime entry).
 */
import type { ClaudeRequest, ClaudeResponse } from '@/types';
import { getAuthToken } from './authToken';

export class ClaudeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ClaudeError';
  }
}

export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new ClaudeError(401, 'Missing proxy auth token. Enter it in the auth gate.');
  }

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
  });

  const data: unknown = await res.json().catch(() => ({ error: 'Invalid JSON' }));
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new ClaudeError(res.status, msg);
  }
  return data as ClaudeResponse;
}

/** Convenience: extract the concatenated text output from a Claude response. */
export function extractText(res: ClaudeResponse): string {
  return res.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
