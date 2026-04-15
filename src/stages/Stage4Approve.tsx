/**
 * Stage 4 — Approve / Learn.
 *
 * Feeds project.first_draft vs project.final_draft to Claude (via
 * assembleDiffPrompt), parses the JSON response into a DiffSummary, and
 * updates the learning system:
 *
 *   - Extracted pattern strings become LearnedPattern entries appended to
 *     UserProfile.learned_patterns with { pinned: false,
 *     source_project_ids: [project.id] }. Duplicates (case-insensitive
 *     description match) are merged by extending source_project_ids on the
 *     existing entry rather than adding a second copy.
 *   - profile.pattern_count is kept in sync with learned_patterns.length.
 *   - profile.last_pattern_review is stamped.
 *   - detectConflicts is run over the full pattern list. Conflicts are
 *     surfaced in the UI as a reviewable list; nothing is auto-deleted.
 *   - shouldPromptConsolidation gates a soft notice — actual consolidation
 *     is a later feature.
 *
 * The diff is run ONCE automatically on first visit (when diff_summary is
 * absent). Returning to this stage shows the stored summary without
 * re-running. A "Re-run diff analysis" button is offered for re-computation
 * when the user wants a fresh pass; this intentionally appends any newly
 * extracted patterns rather than replacing, since the learning system is
 * append-only by design.
 *
 * Continue advances stage_status "approved" -> "producing_images" and
 * routes to Stage 5.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { callClaude, ClaudeError, extractText } from '@/lib/claude';
import { assembleDiffPrompt } from '@/lib/prompts';
import { profileRepo } from '@/lib/storage/repositories';
import { computeLocalDiffMetrics } from '@/lib/diff';
import {
  detectConflicts,
  PATTERN_CONSOLIDATION_THRESHOLD,
  shouldPromptConsolidation,
} from '@/lib/learningSystem';
import type { DiffSummary, LearnedPattern, UserProfile } from '@/types';
import type { ProjectContext } from '@/pages/ProjectShell';

interface LearningResult {
  /** Patterns newly added by this run (does NOT include merges into existing). */
  added: LearnedPattern[];
  /** Descriptions that matched an existing pattern and were merged. */
  merged: string[];
  /** Conflict pairs over the full pattern list after merging. */
  conflicts: Array<[LearnedPattern, LearnedPattern]>;
  /** Whether the user should be nudged to consolidate. */
  consolidation: boolean;
  totalPatterns: number;
}

type State =
  | { kind: 'preconditions_missing' }
  | { kind: 'generating' }
  | { kind: 'ready'; summary: DiffSummary; learning: LearningResult | null }
  | { kind: 'error'; message: string };

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The JSON payload we expect back from Claude. Anything missing/malformed is
 * caught at the parse site.
 */
interface RawDiffPayload {
  rewritten_sections?: string[];
  kept_sections?: string[];
  edit_types?: string[];
  patterns?: string[];
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function parseDiffPayload(raw: string): DiffSummary {
  // Models occasionally wrap JSON in ```json fences despite instructions.
  // Strip fence prefixes/suffixes defensively.
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Claude returned invalid JSON for the diff.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Diff response was not an object.');
  }
  const p = parsed as RawDiffPayload;
  return {
    generated_at: new Date().toISOString(),
    rewritten_sections: isStringArray(p.rewritten_sections) ? p.rewritten_sections : [],
    kept_sections: isStringArray(p.kept_sections) ? p.kept_sections : [],
    edit_types: isStringArray(p.edit_types) ? p.edit_types : [],
    patterns: isStringArray(p.patterns) ? p.patterns : [],
  };
}

/**
 * Merge extracted pattern strings into the user's learned_patterns array.
 * Duplicates (case-insensitive description match) extend source_project_ids
 * on the existing entry rather than adding a second copy.
 */
function mergePatterns(
  existing: LearnedPattern[],
  extracted: string[],
  projectId: string,
): { merged: LearnedPattern[]; added: LearnedPattern[]; mergedDescs: string[] } {
  const byKey = new Map<string, number>();
  existing.forEach((p, i) => byKey.set(p.description.trim().toLowerCase(), i));

  const out = existing.slice();
  const added: LearnedPattern[] = [];
  const mergedDescs: string[] = [];
  const now = new Date().toISOString();

  for (const raw of extracted) {
    const description = raw.trim();
    if (description.length === 0) continue;
    const key = description.toLowerCase();
    const hit = byKey.get(key);
    if (hit !== undefined) {
      const prev = out[hit];
      if (!prev.source_project_ids.includes(projectId)) {
        out[hit] = {
          ...prev,
          source_project_ids: [...prev.source_project_ids, projectId],
        };
      }
      mergedDescs.push(description);
      continue;
    }
    const pattern: LearnedPattern = {
      id: newId(),
      created_at: now,
      description,
      pinned: false,
      source_project_ids: [projectId],
    };
    out.push(pattern);
    byKey.set(key, out.length - 1);
    added.push(pattern);
  }

  return { merged: out, added, mergedDescs };
}

export function Stage4Approve() {
  const { project, setProject } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();

  // Preconditions are checked at mount and baked into the initial state so we
  // don't flash a "generating" spinner before redirecting.
  const initial: State = useMemo(() => {
    if (!project.first_draft || !project.final_draft) {
      return { kind: 'preconditions_missing' };
    }
    if (project.diff_summary) {
      return { kind: 'ready', summary: project.diff_summary, learning: null };
    }
    return { kind: 'generating' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<State>(initial);
  const autoStarted = useRef(false);
  const inFlightRef = useRef(false);

  const metrics = useMemo(() => {
    if (!project.first_draft || !project.final_draft) return null;
    return computeLocalDiffMetrics(
      project.first_draft.plain_text,
      project.final_draft.plain_text,
    );
  }, [project.first_draft, project.final_draft]);

  async function runDiff() {
    if (inFlightRef.current) return;
    if (!project.first_draft || !project.final_draft) return;
    inFlightRef.current = true;
    setState({ kind: 'generating' });
    try {
      const assembled = assembleDiffPrompt();
      const userMessage = [
        '## First draft (Claude-generated)',
        project.first_draft.plain_text,
        '',
        '## Approved final draft (user-edited)',
        project.final_draft.plain_text,
      ].join('\n');
      const res = await callClaude({
        system: assembled.system,
        messages: [{ role: 'user', content: userMessage }],
        metadata: { stage: 'diff', project_id: project.id },
      });
      const summary = parseDiffPayload(extractText(res));

      // Apply the learning-system update: merge patterns, count, stamp, and
      // persist profile + project atomically-ish (two writes — acceptable for
      // localStorage, Supabase will get a transaction later).
      const profile: UserProfile = await profileRepo.getOrCreate();
      const { merged, added, mergedDescs } = mergePatterns(
        profile.learned_patterns,
        summary.patterns,
        project.id,
      );
      const now = new Date().toISOString();
      const nextProfile: UserProfile = {
        ...profile,
        learned_patterns: merged,
        pattern_count: merged.length,
        last_pattern_review: now,
      };
      await profileRepo.save(nextProfile);

      await setProject((prev) => ({
        ...prev,
        diff_summary: summary,
      }));

      const conflicts = detectConflicts(merged);
      const consolidation = shouldPromptConsolidation(merged.length);

      setState({
        kind: 'ready',
        summary,
        learning: {
          added,
          merged: mergedDescs,
          conflicts,
          consolidation,
          totalPatterns: merged.length,
        },
      });
    } catch (err) {
      const message =
        err instanceof ClaudeError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      setState({ kind: 'error', message });
    } finally {
      inFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (state.kind !== 'generating') return;
    if (autoStarted.current) return;
    autoStarted.current = true;
    void runDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinue() {
    await setProject((prev) => ({
      ...prev,
      stage_status: 'producing_images',
    }));
    navigate(`/project/${project.id}/stage-5`);
  }

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
          <p className="font-medium">Stage 4 needs an approved draft.</p>
          <p className="mt-1">
            Approve a draft in Stage 3 first — Stage 4 compares the first draft to what you
            actually approved.
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
            Stage 4 · Approve
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {project.metadata.working_title?.trim() || 'New article'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            The system compares what Claude wrote to what you approved, extracts patterns
            from the diff, and feeds them back into the voice model for future drafts.
          </p>
        </header>

        {metrics && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="First draft" value={`${metrics.first_draft_word_count} words`} />
            <MetricCard label="Final draft" value={`${metrics.final_word_count} words`} />
            <MetricCard
              label="Delta"
              value={`${metrics.word_delta >= 0 ? '+' : ''}${metrics.word_delta} (${
                metrics.word_delta_pct >= 0 ? '+' : ''
              }${metrics.word_delta_pct}%)`}
            />
          </div>
        )}

        {state.kind === 'generating' && (
          <div className="rounded-md border border-neutral-200 bg-white p-10 text-center">
            <p className="text-sm font-medium">Analysing the diff…</p>
            <p className="mt-1 text-xs text-neutral-500">
              Extracting patterns from your edits. This takes 10-30 seconds.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-900">Diff analysis failed</p>
            <p className="mt-1 font-mono text-xs text-red-700">{state.message}</p>
            <button
              type="button"
              onClick={() => void runDiff()}
              className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100"
            >
              Try again
            </button>
          </div>
        )}

        {state.kind === 'ready' && (
          <DiffReadySections
            summary={state.summary}
            learning={state.learning}
            onRerun={() => void runDiff()}
            onContinue={() => void handleContinue()}
          />
        )}
      </div>
    </Layout>
  );
}

// ---------- Sub-views ----------

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function SectionList({
  title,
  items,
  tone,
  emptyHint,
}: {
  title: string;
  items: string[];
  tone: 'kept' | 'rewritten' | 'edits';
  emptyHint: string;
}) {
  const toneClass =
    tone === 'kept'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'rewritten'
        ? 'border-violet-200 bg-violet-50 text-violet-900'
        : 'border-neutral-200 bg-white text-neutral-800';
  return (
    <div className={`rounded-md border px-4 py-3 ${toneClass}`}>
      <p className="text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs opacity-70">{emptyHint}</p>
      ) : (
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiffReadySections({
  summary,
  learning,
  onRerun,
  onContinue,
}: {
  summary: DiffSummary;
  learning: LearningResult | null;
  onRerun: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SectionList
          title="Kept essentially as-generated"
          items={summary.kept_sections}
          tone="kept"
          emptyHint="No kept sections flagged."
        />
        <SectionList
          title="Materially rewritten"
          items={summary.rewritten_sections}
          tone="rewritten"
          emptyHint="No rewrites flagged."
        />
      </div>

      <SectionList
        title="Edit types applied"
        items={summary.edit_types}
        tone="edits"
        emptyHint="No edit types extracted."
      />

      {/*
       * Learning block — only rendered on the run that produced new patterns.
       * When returning to Stage 4 after the fact we show the stored summary
       * without re-announcing the learning-system effects.
       */}
      {learning && (
        <div className="space-y-4 rounded-md border border-neutral-200 bg-white px-5 py-4">
          <div>
            <p className="text-sm font-medium">Learning system</p>
            <p className="mt-1 text-xs text-neutral-500">
              {learning.added.length} new pattern{learning.added.length === 1 ? '' : 's'} added,{' '}
              {learning.merged.length} merged into existing.{' '}
              <span className="text-neutral-400">
                {learning.totalPatterns} total in your profile.
              </span>
            </p>
          </div>

          {learning.added.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Newly extracted
              </p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-neutral-800">
                {learning.added.map((p) => (
                  <li key={p.id}>{p.description}</li>
                ))}
              </ul>
            </div>
          )}

          {learning.merged.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Seen before (linked to this project)
              </p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-neutral-600">
                {learning.merged.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {learning.conflicts.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">
                Possible conflicts to review
              </p>
              <p className="mt-1 text-xs text-amber-800">
                These pairs look like they might contradict each other. Nothing was deleted —
                review them when you get a chance.
              </p>
              <ul className="mt-2 space-y-2 text-sm text-amber-900">
                {learning.conflicts.map(([a, b], i) => (
                  <li key={i} className="rounded-md border border-amber-200 bg-white px-3 py-2">
                    <div>
                      <span className="font-medium">A:</span> {a.description}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">B:</span> {b.description}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {learning.consolidation && (
            <div className="rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-medium">Time to consolidate?</p>
              <p className="mt-1 text-xs">
                You have {learning.totalPatterns} patterns — past the{' '}
                {PATTERN_CONSOLIDATION_THRESHOLD}-pattern threshold. Consider folding recurring
                themes into your voice guide so the prompt budget stays lean. (Automated
                consolidation is a future feature.)
              </p>
            </div>
          )}
        </div>
      )}

      {!learning && summary.patterns.length > 0 && (
        <div className="rounded-md border border-neutral-200 bg-white px-5 py-4">
          <p className="text-sm font-medium">Patterns extracted from this diff</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-neutral-800">
            {summary.patterns.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            These were folded into your voice profile on first run.
          </p>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onRerun}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
        >
          Re-run diff analysis
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Continue to Image Prompts →
        </button>
      </footer>
    </>
  );
}
