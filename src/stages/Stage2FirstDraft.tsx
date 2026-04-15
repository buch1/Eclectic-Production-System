/**
 * Stage 2 — First Draft.
 *
 * Assembles the voice-guide-backed system prompt, sends the Stage 1 outline
 * to Claude, and stores the returned markdown as `project.first_draft`.
 *
 * Key contracts:
 *   - Auto-generates once on first mount when no draft exists. Returning to
 *     a project that already has a first_draft never auto-regenerates — the
 *     user has to click Regenerate explicitly.
 *   - Regenerate overwrites project.first_draft in place. No rejected-draft
 *     history is kept in project.versions[]; only the draft the user takes
 *     into Stage 3 matters for the Stage 4 diff.
 *   - The assembled prompt's pattern-selection warnings and the voice-guide
 *     Red Flag checks are surfaced advisorily, never blocking.
 *   - Continue advances stage_status "first_draft" -> "editing" and routes
 *     to Stage 3.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { callClaude, ClaudeError, extractText } from '@/lib/claude';
import { assembleFirstDraftPrompt } from '@/lib/prompts';
import { profileRepo } from '@/lib/storage/repositories';
import { runRedFlagChecks, type RedFlag } from '@/lib/voiceValidator';
import type { DraftVersion } from '@/types';
import type { ProjectContext } from '@/pages/ProjectShell';

type GenerateState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'error'; message: string };

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function Stage2FirstDraft() {
  const { project, setProject } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();

  // Seed state based on whether a draft already exists so we don't flash
  // a blank screen before the auto-generate effect fires.
  const [state, setState] = useState<GenerateState>(() =>
    project.first_draft ? { kind: 'idle' } : { kind: 'generating' },
  );
  const [warnings, setWarnings] = useState<string[]>([]);

  /** Guard against the auto-generate effect firing twice under StrictMode. */
  const autoStarted = useRef(false);
  /** Guard against the Regenerate button double-clicking while in flight. */
  const generatingRef = useRef(false);

  useEffect(() => {
    // Defensive redirect: if Stage 1 was somehow skipped, bounce back.
    if (project.outline.trim().length === 0) {
      navigate(`/project/${project.id}/stage-1`, { replace: true });
      return;
    }
    if (project.first_draft) return;
    if (autoStarted.current) return;
    autoStarted.current = true;
    void generate();
    // Only fire once per mount; the effect intentionally reads a snapshot of
    // project at mount time. setProject is stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setState({ kind: 'generating' });
    try {
      const profile = await profileRepo.getOrCreate();
      const assembled = assembleFirstDraftPrompt({
        profile,
        metadata: project.metadata,
      });
      setWarnings(assembled.warnings);

      const res = await callClaude({
        system: assembled.system,
        messages: [{ role: 'user', content: project.outline }],
        metadata: { stage: 'first_draft', project_id: project.id },
      });
      const text = extractText(res).trim();
      if (text.length === 0) {
        throw new Error('Claude returned an empty response.');
      }

      const draft: DraftVersion = {
        created_at: new Date().toISOString(),
        kind: 'first_draft',
        doc: null,
        plain_text: text,
        prompt_version: assembled.prompt_version,
      };

      // Overwrite any previous first_draft in place. versions[] is not touched
      // here — rejected first drafts are intentionally not preserved.
      await setProject((prev) => ({
        ...prev,
        first_draft: draft,
        prompt_version: assembled.prompt_version,
      }));
      setState({ kind: 'idle' });
    } catch (err) {
      const message =
        err instanceof ClaudeError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      setState({ kind: 'error', message });
    } finally {
      generatingRef.current = false;
    }
  }

  async function handleContinue() {
    await setProject((prev) => ({
      ...prev,
      stage_status: 'editing',
    }));
    navigate(`/project/${project.id}/stage-3`);
  }

  const draft = project.first_draft;
  const redFlags: RedFlag[] = draft ? runRedFlagChecks(draft.plain_text) : [];

  return (
    <Layout
      rightSlot={
        <Link to="/" className="text-sm hover:text-neutral-900">
          All projects
        </Link>
      }
    >
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wide text-neutral-400">
            Stage 2 · First Draft
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {project.metadata.working_title?.trim() || 'New article'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Claude drafts the article in your voice using the outline from Stage 1. Review it
            below — regenerate if the first attempt misses, or take it into editing to refine.
          </p>
        </header>

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Learning-system notes</p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {state.kind === 'generating' && (
          <div className="rounded-md border border-neutral-200 bg-white p-10 text-center">
            <p className="text-sm font-medium">Generating first draft…</p>
            <p className="mt-1 text-xs text-neutral-500">
              This can take 15-60 seconds depending on outline length.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-900">Generation failed</p>
            <p className="mt-1 font-mono text-xs text-red-700">{state.message}</p>
            <button
              type="button"
              onClick={() => void generate()}
              className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100"
            >
              Try again
            </button>
          </div>
        )}

        {draft && state.kind !== 'generating' && (
          <>
            <article className="rounded-md border border-neutral-200 bg-white px-6 py-5">
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-neutral-800">
                {draft.plain_text}
              </pre>
            </article>

            {redFlags.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">Voice red flags to review in editing</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {redFlags.map((f) => (
                    <li key={f.id}>
                      <span className="font-medium">{f.label}</span> — {f.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-neutral-500">
                Prompt <span className="font-mono">{draft.prompt_version ?? '—'}</span>{' '}
                · {wordCount(draft.plain_text)} words
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => void handleContinue()}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Continue to editing →
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </Layout>
  );
}
