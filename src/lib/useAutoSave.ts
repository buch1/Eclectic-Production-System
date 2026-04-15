/**
 * useAutoSave — Stage 3's debounced persistence hook.
 *
 * Behaviour (matches the spec in SaveStatus.tsx):
 *   - 1 second debounce after the last input change (TipTap's onUpdate).
 *   - Persists to project.versions[] with kind "auto_save". Only ONE auto_save
 *     entry is kept — subsequent saves overwrite that slot in place so the
 *     array doesn't bloat on every keystroke.
 *   - Named snapshots (kind: "first_draft" | "manual_snapshot" | "approved")
 *     are appended separately by callers and are never touched by auto-save.
 *   - project.last_saved_at is refreshed on every successful save (handled by
 *     ProjectShell.setProject).
 *   - Exposes { state, flush } where state is the SaveState for the indicator
 *     and flush() writes any pending change synchronously before navigation.
 *
 * The hook only writes when content has actually changed since the last
 * persisted auto_save — reopening the page and twiddling a character back and
 * forth won't spam storage.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftVersion, Project } from '@/types';
import type { SaveState } from '@/components/SaveStatus';

const DEBOUNCE_MS = 1_000;

interface UseAutoSaveArgs {
  enabled: boolean;
  /** TipTap JSON document (or null if editor hasn't mounted yet). */
  doc: unknown;
  /** Serialized plain-text / markdown representation of the document. */
  plainText: string;
  /** Prompt version from the source draft, carried forward. */
  promptVersion?: string;
  setProject: (updater: (prev: Project) => Project) => Promise<void>;
}

export interface UseAutoSaveResult {
  state: SaveState;
  /** Persist any pending change immediately; resolves once written. */
  flush: () => Promise<void>;
}

/** Replace the single auto_save slot in versions[], preserving every other entry. */
function upsertAutoSave(versions: DraftVersion[], entry: DraftVersion): DraftVersion[] {
  const idx = versions.findIndex((v) => v.kind === 'auto_save');
  if (idx === -1) return [...versions, entry];
  const next = versions.slice();
  next[idx] = entry;
  return next;
}

export function useAutoSave(args: UseAutoSaveArgs): UseAutoSaveResult {
  const { enabled, doc, plainText, promptVersion, setProject } = args;

  const [state, setState] = useState<SaveState>('idle');

  // Refs keep the latest values available to flush() / timeout callbacks
  // without forcing them into the dep array.
  const docRef = useRef<unknown>(doc);
  const textRef = useRef<string>(plainText);
  const promptVersionRef = useRef<string | undefined>(promptVersion);
  const setProjectRef = useRef(setProject);
  const lastSavedTextRef = useRef<string | null>(null);
  const firstRunRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  docRef.current = doc;
  textRef.current = plainText;
  promptVersionRef.current = promptVersion;
  setProjectRef.current = setProject;

  const performSave = useCallback(async () => {
    const text = textRef.current;
    // Skip if nothing meaningful has changed since the last persisted save.
    if (lastSavedTextRef.current === text) {
      setState('idle');
      return;
    }
    setState('saving');
    const entry: DraftVersion = {
      created_at: new Date().toISOString(),
      kind: 'auto_save',
      doc: docRef.current,
      plain_text: text,
      prompt_version: promptVersionRef.current,
    };
    try {
      await setProjectRef.current((prev) => ({
        ...prev,
        versions: upsertAutoSave(prev.versions, entry),
      }));
      lastSavedTextRef.current = text;
      setState('saved');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Skip the first run — the editor has just hydrated with the source
    // draft; there's nothing new to persist.
    if (firstRunRef.current) {
      firstRunRef.current = false;
      lastSavedTextRef.current = plainText;
      return;
    }
    // Don't mark dirty if the text is identical to the last persisted copy
    // (e.g. cursor moves through a no-op `onUpdate`).
    if (lastSavedTextRef.current === plainText) return;

    setState('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      inFlightRef.current = performSave().finally(() => {
        inFlightRef.current = null;
      });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [plainText, enabled, performSave]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) {
      await inFlightRef.current;
    }
    await performSave();
  }, [performSave]);

  return { state, flush };
}
