/**
 * Stage 5 — Image Prompts.
 *
 * Sends the approved draft to Claude with the visual style guide in context
 * (via assembleImagePromptsPrompt) and receives a JSON array of image
 * generation prompts keyed to the most visual moments in the piece. The
 * result is stored on project.image_prompts and rendered as an editable
 * card grid.
 *
 * This stage produces prompts; it does NOT generate images. The user takes
 * each prompt to their external tool of choice (Midjourney, DALL·E, etc.).
 * Copy-to-clipboard is the critical interaction.
 *
 * Per-card actions:
 *   - Edit: inline textarea editing of prompt / style_notes / aspect_ratio
 *   - Regenerate: recall Claude for just this one prompt, asking for a
 *     fresh alternative tied to the same section_label
 *   - Copy: navigator.clipboard with a brief "Copied!" confirmation
 *   - Approve toggle: flips ImagePrompt.approved for curation
 *
 * Regenerate All rebuilds the entire set, replacing project.image_prompts
 * wholesale. Existing approved states are discarded — the user confirms
 * before the overwrite.
 *
 * Continue marks stage_status "complete" (Phase 2 distribution stages are
 * deferred) and routes back to the dashboard.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { callClaude, ClaudeError, extractText } from '@/lib/claude';
import { assembleImagePromptsPrompt } from '@/lib/prompts';
import { profileRepo } from '@/lib/storage/repositories';
import { VISUAL_GUIDE } from '@/data/guides';
import type { ImagePrompt, UserProfile } from '@/types';
import type { ProjectContext } from '@/pages/ProjectShell';

type State =
  | { kind: 'preconditions_missing' }
  | { kind: 'generating_all' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Shape we expect inside the JSON array Claude returns. */
interface RawImagePrompt {
  section_label?: string;
  prompt?: string;
  style_notes?: string;
  aspect_ratio?: string;
}

function parseImagePromptArray(raw: string, promptVersion: string): ImagePrompt[] {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Claude returned invalid JSON for image prompts.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array of image prompts.');
  }
  const out: ImagePrompt[] = [];
  for (const item of parsed as RawImagePrompt[]) {
    if (!item || typeof item !== 'object') continue;
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
    if (prompt.length === 0) continue;
    out.push({
      id: newId(),
      section_label: typeof item.section_label === 'string' ? item.section_label : 'Scene',
      prompt,
      style_notes: typeof item.style_notes === 'string' ? item.style_notes : undefined,
      aspect_ratio: typeof item.aspect_ratio === 'string' ? item.aspect_ratio : undefined,
      prompt_version: promptVersion,
      approved: false,
    });
  }
  if (out.length === 0) {
    throw new Error('Claude returned no usable image prompts.');
  }
  return out;
}

export function Stage5ImagePrompts() {
  const { project, setProject } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();

  const initial: State = useMemo(() => {
    if (!project.final_draft) return { kind: 'preconditions_missing' };
    if (project.image_prompts.length === 0) return { kind: 'generating_all' };
    return { kind: 'ready' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<State>(initial);
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const autoStarted = useRef(false);
  const inFlightRef = useRef(false);

  async function generateAll(confirmOverwrite: boolean) {
    if (inFlightRef.current) return;
    if (!project.final_draft) return;
    if (confirmOverwrite && project.image_prompts.length > 0) {
      const ok = window.confirm(
        'This replaces all current image prompts (including approvals and edits). Continue?',
      );
      if (!ok) return;
    }
    inFlightRef.current = true;
    setState({ kind: 'generating_all' });
    try {
      const profile: UserProfile = await profileRepo.getOrCreate();
      const assembled = assembleImagePromptsPrompt({ profile });
      const res = await callClaude({
        system: assembled.system,
        messages: [{ role: 'user', content: project.final_draft.plain_text }],
        metadata: { stage: 'image_prompts', project_id: project.id },
      });
      const prompts = parseImagePromptArray(extractText(res), assembled.prompt_version);
      await setProject((prev) => ({ ...prev, image_prompts: prompts }));
      setState({ kind: 'ready' });
    } catch (err) {
      setState({ kind: 'error', message: formatError(err) });
    } finally {
      inFlightRef.current = false;
    }
  }

  async function regenerateOne(id: string) {
    if (!project.final_draft) return;
    const current = project.image_prompts.find((p) => p.id === id);
    if (!current) return;
    if (regenerating[id]) return;
    setRegenerating((r) => ({ ...r, [id]: true }));
    try {
      const profile: UserProfile = await profileRepo.getOrCreate();
      const assembled = assembleImagePromptsPrompt({ profile });
      // Scope the request down to a single alternative for this section.
      // The system prompt already tells the model to emit a JSON array; we
      // reinforce the one-element constraint in the user message.
      const userMessage = [
        '# Article',
        project.final_draft.plain_text,
        '',
        '# Task override',
        `Produce exactly ONE new image prompt tied to the section labelled "${current.section_label}".`,
        'It should be a fresh alternative to the prompt below — different composition or framing, same article section.',
        '',
        '# Current prompt (do not repeat it)',
        current.prompt,
        '',
        'Return a JSON array with a single element: [{ "section_label", "prompt", "style_notes", "aspect_ratio" }].',
      ].join('\n');
      const res = await callClaude({
        system: assembled.system,
        messages: [{ role: 'user', content: userMessage }],
        metadata: { stage: 'image_prompts_single', project_id: project.id },
      });
      const [fresh] = parseImagePromptArray(extractText(res), assembled.prompt_version);
      if (!fresh) throw new Error('No replacement prompt returned.');
      // Preserve the id so React keys stay stable; replace the rest.
      const replacement: ImagePrompt = { ...fresh, id: current.id, approved: false };
      await setProject((prev) => ({
        ...prev,
        image_prompts: prev.image_prompts.map((p) => (p.id === id ? replacement : p)),
      }));
    } catch (err) {
      window.alert(`Regenerate failed: ${formatError(err)}`);
    } finally {
      setRegenerating((r) => {
        const next = { ...r };
        delete next[id];
        return next;
      });
    }
  }

  async function updatePrompt(id: string, patch: Partial<ImagePrompt>) {
    await setProject((prev) => ({
      ...prev,
      image_prompts: prev.image_prompts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  async function handleContinue() {
    await setProject((prev) => ({
      ...prev,
      stage_status: 'complete',
      status: 'produced',
    }));
    navigate('/');
  }

  useEffect(() => {
    if (state.kind !== 'generating_all') return;
    if (autoStarted.current) return;
    autoStarted.current = true;
    void generateAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === 'preconditions_missing') {
    return (
      <Layout
        rightSlot={
          <Link to="/" className="text-sm hover:text-neutral-900">
            All projects
          </Link>
        }
      >
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-medium">Stage 5 needs an approved draft.</p>
          <p className="mt-1">
            Approve the draft in Stage 3 and run the diff in Stage 4 before generating image
            prompts.
          </p>
          <div className="mt-3">
            <Link
              to={`/project/${project.id}/stage-3`}
              className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Back to editing
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const approvedCount = project.image_prompts.filter((p) => p.approved).length;

  return (
    <Layout
      rightSlot={
        <Link to="/" className="text-sm hover:text-neutral-900">
          All projects
        </Link>
      }
    >
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">
              Stage 5 · Image Prompts
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              {project.metadata.working_title?.trim() || 'New article'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Claude identifies the most visual moments in the approved draft and drafts image
              prompts keyed to each one. Edit, regenerate, or copy the prompts below — then
              paste them into your image generator of choice.
            </p>
          </div>
          {state.kind === 'ready' && (
            <button
              type="button"
              onClick={() => void generateAll(true)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
            >
              Regenerate all
            </button>
          )}
        </header>

        <VisualGuideReference />

        {state.kind === 'generating_all' && (
          <div className="rounded-md border border-neutral-200 bg-white p-10 text-center">
            <p className="text-sm font-medium">Generating image prompts…</p>
            <p className="mt-1 text-xs text-neutral-500">
              Reading the draft and mapping it to 3–5 visual beats.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-900">Generation failed</p>
            <p className="mt-1 font-mono text-xs text-red-700">{state.message}</p>
            <button
              type="button"
              onClick={() => void generateAll(false)}
              className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100"
            >
              Try again
            </button>
          </div>
        )}

        {state.kind === 'ready' && (
          <>
            <p className="text-xs text-neutral-500">
              {project.image_prompts.length} prompt{project.image_prompts.length === 1 ? '' : 's'}
              {' · '}
              {approvedCount} approved
            </p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {project.image_prompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  regenerating={Boolean(regenerating[prompt.id])}
                  onUpdate={(patch) => void updatePrompt(prompt.id, patch)}
                  onRegenerate={() => void regenerateOne(prompt.id)}
                />
              ))}
            </div>

            <footer className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500">
                Phase 2 (LinkedIn + Carousel) is deferred — Continue marks this project
                complete.
              </p>
              <button
                type="button"
                onClick={() => void handleContinue()}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Continue — mark complete →
              </button>
            </footer>
          </>
        )}
      </div>
    </Layout>
  );
}

// ---------- Reference panel ----------

function VisualGuideReference() {
  return (
    <details className="rounded-md border border-neutral-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-neutral-700">
        Visual style guide (reference)
      </summary>
      <div className="border-t border-neutral-200 px-4 py-3">
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-700">
          {VISUAL_GUIDE}
        </pre>
      </div>
    </details>
  );
}

// ---------- Card ----------

function PromptCard({
  prompt,
  regenerating,
  onUpdate,
  onRegenerate,
}: {
  prompt: ImagePrompt;
  regenerating: boolean;
  onUpdate: (patch: Partial<ImagePrompt>) => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt.prompt);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1_800);
    } catch {
      // Fallback for browsers/permissions blocking the clipboard API.
      try {
        const ta = document.createElement('textarea');
        ta.value = prompt.prompt;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 1_800);
      } catch {
        window.alert('Copy failed — select the text manually.');
      }
    }
  }

  const approvedBorder = prompt.approved
    ? 'border-emerald-400 shadow-[0_0_0_1px_rgb(52,211,153)]'
    : 'border-neutral-200';

  return (
    <article className={`rounded-md border bg-white px-5 py-4 ${approvedBorder}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-neutral-400">
            {prompt.section_label || 'Scene'}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            <span className="font-mono">{prompt.prompt_version}</span>
            {prompt.aspect_ratio ? <> · {prompt.aspect_ratio}</> : null}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-700">
          <input
            type="checkbox"
            checked={Boolean(prompt.approved)}
            onChange={(e) => onUpdate({ approved: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-neutral-300"
          />
          Approved
        </label>
      </div>

      <label className="mt-3 block text-xs font-medium text-neutral-600">
        Prompt
        <textarea
          value={prompt.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          rows={5}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-neutral-900"
        />
      </label>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block text-xs font-medium text-neutral-600">
          Style notes
          <input
            type="text"
            value={prompt.style_notes ?? ''}
            onChange={(e) =>
              onUpdate({ style_notes: e.target.value.length > 0 ? e.target.value : undefined })
            }
            placeholder="e.g., muted palette, high contrast"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-xs font-medium text-neutral-600">
          Aspect ratio
          <input
            type="text"
            value={prompt.aspect_ratio ?? ''}
            onChange={(e) =>
              onUpdate({ aspect_ratio: e.target.value.length > 0 ? e.target.value : undefined })
            }
            placeholder="16:9"
            className="mt-1 w-28 rounded-md border border-neutral-300 px-3 py-2 text-xs outline-none focus:border-neutral-900"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            copied
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50'
          }`}
        >
          {copied ? 'Copied!' : 'Copy prompt'}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </button>
        <span className="ml-auto text-[11px] text-neutral-400">
          Paste into Midjourney, DALL·E, etc.
        </span>
      </div>
    </article>
  );
}

function formatError(err: unknown): string {
  if (err instanceof ClaudeError) return `${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
