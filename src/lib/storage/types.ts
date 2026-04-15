/**
 * StorageProvider is the only contract the rest of the app uses to persist state.
 *
 * Rule of thumb: no component, stage, or hook may read or write localStorage
 * directly. Go through the provider. This lets us swap in Supabase, Firebase,
 * IndexedDB, or a real server without touching any UI code.
 *
 * Namespaces isolate domains ("projects", "profile", "drafts", etc.). Each
 * namespace is effectively a key/value store where keys are strings and values
 * are JSON-serializable.
 */

export interface StorageProvider {
  /** Read a single record. Returns null if missing. */
  load<T>(namespace: string, key: string): Promise<T | null>;

  /** Write a single record. Overwrites if present. */
  save<T>(namespace: string, key: string, value: T): Promise<void>;

  /** List all keys in a namespace. */
  list(namespace: string): Promise<string[]>;

  /** List all records in a namespace. */
  listAll<T>(namespace: string): Promise<Array<{ key: string; value: T }>>;

  /** Delete a single record. No-op if missing. */
  delete(namespace: string, key: string): Promise<void>;

  /** Clear an entire namespace. Useful for tests and the reset-profile flow. */
  clearNamespace(namespace: string): Promise<void>;

  /**
   * Estimate total bytes used across all namespaces the provider owns.
   * Optional — backends without a cheap way to compute this can return
   * null, in which case the UI hides the storage-usage indicator.
   */
  estimateUsageBytes?(): Promise<number | null>;
}

export const NAMESPACES = {
  projects: 'projects',
  profile: 'profile',
  settings: 'settings',
} as const;

export type Namespace = (typeof NAMESPACES)[keyof typeof NAMESPACES];
