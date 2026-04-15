/**
 * Auth token handling. The token is a shared secret that authorizes requests
 * to the proxy. There are two sources, checked in order:
 *
 *   1. VITE_PROXY_AUTH_TOKEN — build-time env var for personal / single-user
 *      deploys. If set, the user is never prompted.
 *   2. Runtime storage — entered through the auth gate on first use and
 *      persisted via the storage layer.
 *
 * This is a placeholder design. When multi-user lands, replace the runtime
 * source with a real session token issued after login; every other part of
 * the app already reads through getAuthToken().
 */
import { storage, NAMESPACES } from './storage';

const SETTINGS_KEY = 'auth_token';
const BUILD_TOKEN: string | undefined = import.meta.env.VITE_PROXY_AUTH_TOKEN;

let cached: string | null = null;

export function getAuthToken(): string | null {
  if (BUILD_TOKEN && BUILD_TOKEN.length > 0) return BUILD_TOKEN;
  return cached;
}

export async function hydrateAuthToken(): Promise<void> {
  if (BUILD_TOKEN && BUILD_TOKEN.length > 0) {
    cached = BUILD_TOKEN;
    return;
  }
  const stored = await storage.load<string>(NAMESPACES.settings, SETTINGS_KEY);
  cached = stored ?? null;
}

export async function setAuthToken(token: string): Promise<void> {
  cached = token;
  await storage.save(NAMESPACES.settings, SETTINGS_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  cached = null;
  await storage.delete(NAMESPACES.settings, SETTINGS_KEY);
}

export function isAuthConfigured(): boolean {
  return getAuthToken() !== null;
}
