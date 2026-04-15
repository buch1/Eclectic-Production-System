/**
 * Stage 1 — Input.
 *
 * Captures the outline plus optional metadata (working title, audience, tone,
 * reference links). The outline is the only required field. Everything is
 * persisted with a 500 ms debounced save so a browser close never loses work.
 *
 * Submitting advances stage_status from "input" to "first_draft" and routes
 * to Stage 2, which consumes `project.outline` + `project.metadata` to
 * generate the first draft. The submit handler flushes any pending debounced
 * save before navigating, so Stage 2 is guaranteed to read the freshest state.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import type { Project } from '@/types';
import { Layout } from '@/components/Layout';
import { SaveStatus, type SaveState } from '@/components/SaveStatus';
import type { ProjectContext } from '@/pages/ProjectShell';

const TONE_OPTIONS = ['conversational', 'provocative', 'reflective', 'analytical'];
const DEBOUNCE_MS = 500;

/**
 * Local mirror of the editable fields. Stored as strings (even reference
 * links, which are one-per-line in a textarea) so the form round-trips
 * cleanly without churning the form on every keystroke.
 */
interface FormState {
  outline: string;
  working_title: string;
  target_audience: string;
  tone: string;
  reference_links: string;
}

function toFormState(project: Project): FormState {
  return {
    outline: project.outline,
    working_title: project.metadata.working_title ?? '',
    target_audience: project.metadata.target_audience ?? '',
    tone: project.metadata.tone ?? '',
    reference_links: (project.metadata.reference_links ?? []).join('\n'),
  };
}

function applyFormState(project: Project, form: FormState): Project {
  const links = form.reference_links
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const trimmedTitle = form.working_title.trim();
  const trimmedAudience = form.target_audience.trim();
  const trimmedTone = form.tone.trim();
  return {
    ...project,
    outline: form.outline,
    metadata: {
      ...project.metadata,
      working_title: trimmedTitle.length > 0 ? trimmedTitle : undefined,
      target_audience: trimmedAudience.length > 0 ? trimmedAudience : undefined,
      tone: trimmedTone.length > 0 ? trimmedTone : undefined,
      reference_links: links.length > 0 ? links : undefined,
    },
  };
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function Stage1Input() {
  const { project, setProject } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(() => toFormState(project));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The first effect run happens right after hydrating `form` from the
  // loaded project — nothing to persist, so skip it.
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState('dirty');
    const timer = setTimeout(() => {
      setSaveState('saving');
      setProject((prev) => applyFormState(prev, form))
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // setProject is stable via useCallback in ProjectShell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const outlineValid = form.outline.trim().length > 0;

  async function handleGenerate() {
    if (!outlineValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Flush the current form state AND advance stage in a single write so
      // Stage 2 reads the freshest project even if a debounce was pending.
      await setProject((prev) => ({
        ...applyFormState(prev, form),
        stage_status: 'first_draft',
        status: 'in_review',
      }));
      navigate(`/project/${project.id}/stage-2`);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Failed to save before advancing.');
    }
  }

  return (
    <Layout
      rightSlot={
        <>
          <SaveStatus state={saveState} lastSavedAt={project.last_saved_at} />
          <Link to="/" className="text-sm hover:text-neutral-900">
            All projects
          </Link>
        </>
      }
    >
      <div className="space-y-8">
        <header>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Stage 1 · Input</p>
          <h1 className="mt-1 text-2xl font-semibold">
            {form.working_title.trim().length > 0 ? form.working_title : 'New article'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Paste an outline, rough bullets, or a partial draft. Markdown is fine. Everything
            below the outline is optional — skip anything that doesn't apply.
          </p>
        </header>

        <section className="space-y-2">
          <label htmlFor="outline" className="block text-sm font-medium">
            Outline <span className="text-red-600">*</span>
          </label>
          <textarea
            id="outline"
            value={form.outline}
            onChange={(e) => setForm((f) => ({ ...f, outline: e.target.value }))}
            placeholder="A rough outline, a few bullets, a half-draft — anything. Markdown welcome."
            className="min-h-[340px] w-full rounded-md border border-neutral-300 bg-white px-4 py-3 font-mono text-sm leading-relaxed outline-none focus:border-neutral-900"
          />
          <p className="text-xs text-neutral-500">{wordCount(form.outline)} words</p>
        </section>

        <details
          className="rounded-md border border-neutral-200 bg-white"
          open={hasAnyMetadata(form)}
        >
          <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-neutral-700">
            Optional metadata
          </summary>
          <div className="space-y-4 border-t border-neutral-200 px-4 py-4">
            <Field label="Working title" id="title">
              <input
                id="title"
                type="text"
                value={form.working_title}
                onChange={(e) => setForm((f) => ({ ...f, working_title: e.target.value }))}
                placeholder="Untitled"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </Field>

            <Field label="Target audience" id="audience">
              <input
                id="audience"
                type="text"
                value={form.target_audience}
                onChange={(e) => setForm((f) => ({ ...f, target_audience: e.target.value }))}
                placeholder='e.g., "professionals in Japan exploring AI"'
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </Field>

            <Field label="Tone" id="tone" hint="Pick a suggestion or type your own.">
              <input
                id="tone"
                type="text"
                list="tone-options"
                value={form.tone}
                onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
                placeholder="conversational"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
              <datalist id="tone-options">
                {TONE_OPTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>

            <Field label="Reference links" id="links" hint="One URL per line.">
              <textarea
                id="links"
                value={form.reference_links}
                onChange={(e) => setForm((f) => ({ ...f, reference_links: e.target.value }))}
                placeholder="https://previous-article.example"
                className="h-24 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs outline-none focus:border-neutral-900"
              />
            </Field>
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
          {!outlineValid && !error && (
            <p className="text-sm text-neutral-500">Add an outline to continue.</p>
          )}
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!outlineValid || submitting}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Advancing…' : 'Generate first draft →'}
          </button>
        </div>
      </div>
    </Layout>
  );
}

function hasAnyMetadata(form: FormState): boolean {
  return (
    form.working_title.trim().length > 0 ||
    form.target_audience.trim().length > 0 ||
    form.tone.trim().length > 0 ||
    form.reference_links.trim().length > 0
  );
}

function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
