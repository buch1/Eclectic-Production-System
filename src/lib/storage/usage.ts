/**
 * Storage usage monitoring.
 *
 * localStorage caps at ~5MB in most browsers. Once version histories, drafts,
 * and learned patterns accumulate, a session can fill the quota and saves
 * start throwing QuotaExceededError with no warning to the user. This module
 * surfaces a usage estimate so the dashboard can warn before that happens.
 */
import { storage } from './index';

/** Conservative assumption — Chrome, Firefox, Safari all allow at least this much. */
export const ASSUMED_LIMIT_BYTES = 5 * 1024 * 1024;

/** Show a warning banner once usage crosses this percentage. */
export const STORAGE_WARN_THRESHOLD_PCT = 70;

export interface StorageUsage {
  bytes: number | null;
  pct: number | null;
  shouldWarn: boolean;
}

export async function getStorageUsage(): Promise<StorageUsage> {
  if (!storage.estimateUsageBytes) {
    return { bytes: null, pct: null, shouldWarn: false };
  }
  const bytes = await storage.estimateUsageBytes();
  if (bytes === null) {
    return { bytes: null, pct: null, shouldWarn: false };
  }
  const pct = Math.round((bytes / ASSUMED_LIMIT_BYTES) * 100);
  return {
    bytes,
    pct,
    shouldWarn: pct >= STORAGE_WARN_THRESHOLD_PCT,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
