/**
 * LocalStorageProvider — the v1 implementation of StorageProvider.
 *
 * Keys are prefixed with "eps:<namespace>:" to avoid collisions with anything
 * else the browser might be storing.
 */
import type { StorageProvider } from './types';

const KEY_PREFIX = 'eps';

function makeKey(namespace: string, key: string): string {
  return `${KEY_PREFIX}:${namespace}:${key}`;
}

function matchNamespace(storageKey: string, namespace: string): string | null {
  const prefix = `${KEY_PREFIX}:${namespace}:`;
  return storageKey.startsWith(prefix) ? storageKey.slice(prefix.length) : null;
}

export class LocalStorageProvider implements StorageProvider {
  async load<T>(namespace: string, key: string): Promise<T | null> {
    const raw = localStorage.getItem(makeKey(namespace, key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async save<T>(namespace: string, key: string, value: T): Promise<void> {
    localStorage.setItem(makeKey(namespace, key), JSON.stringify(value));
  }

  async list(namespace: string): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k === null) continue;
      const matched = matchNamespace(k, namespace);
      if (matched !== null) keys.push(matched);
    }
    return keys;
  }

  async listAll<T>(namespace: string): Promise<Array<{ key: string; value: T }>> {
    const keys = await this.list(namespace);
    const out: Array<{ key: string; value: T }> = [];
    for (const key of keys) {
      const value = await this.load<T>(namespace, key);
      if (value !== null) out.push({ key, value });
    }
    return out;
  }

  async delete(namespace: string, key: string): Promise<void> {
    localStorage.removeItem(makeKey(namespace, key));
  }

  async clearNamespace(namespace: string): Promise<void> {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k === null) continue;
      if (matchNamespace(k, namespace) !== null) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  }
}
