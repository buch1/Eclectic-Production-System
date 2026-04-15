/**
 * Stage 3 — Edit.
 *
 * Rich-text editor over the Stage 2 first draft using TipTap. Persistence
 * happens via useAutoSave (1 s debounce, single rolling auto_save slot).
 *
 * Flow:
 *   - Source content is resolved at mount time: the most recent auto_save
 *     wins, falling back to first_draft. Nothing here mutates first_draft —
 *     it stays pristine so Stage 4 can diff against it.
 *   - Save Version captures the current state as a manual_snapshot entry,
 *     appended to versions[] (not merged with auto_save).
 *   - Approve writes a final_draft + kind:"approved" snapshot, advances
 *     stage_status to "approved", and routes to Stage 4.
 *
 * AI assistance (opt-in, never automatic):
 *   - "Revise selection": highlight text, add a comment, Claude rewrites
 *     just the highlighted span via assembleSectionRevisionPrompt.
 *   - "Revise full draft": send the full draft + user feedback; the response
 *     replaces the editor contents (the prior state is still recoverable
 *     from versions[] — Save Version first if you want a checkpoint).
 *   - Auto-save is paused while an AI revision is in flight so we don't
 *     persist a half-rewritten state as the user's canonical auto_save.
 *
 * Version history:
 *   - Dropdown lists first_draft + every manual_snapshot + the auto_save,
 *     newest first. Restoring overwrites the editor contents. Restored
 *     content is treated as a user edit — a new auto_save will be written
 *     shortly after, so versions[] reflects the restore going forward.
 *
 * Defensive behaviours:
 *   - If no first_draft exists, route back to Stage 2.
 *   - Pending auto-saves are flushed before navigation on Approve so we
 *     never lose the last keystroke.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Layout } from '@/components/Layout';
import { SaveStatus } from '@/components/SaveStatus';
import { useAutoSave } from '@/lib/useAutoSave';
import { docToMarkdown, markdownToHtml } from '@/lib/mdLite';
import { callClaude, ClaudeError, extractText } from '@/lib/claude';
import {
  assembleFullRevisionPrompt,
  assembleSectionRevisionPrompt,
} from '@/lib/prompts';
import { profileRepo } from '@/lib/storage/repositories';
import type { DraftVersion } from '@/types';
import type { ProjectContext } from '@/pages/ProjectShell';

/**
 * Pick the draft we should hydrate the editor with. Precedence:
 *   auto_save (most recent user state) > first_draft (Stage 2 output).
 */
function pickSourceDraft(project: ProjectContext['project']): DraftVersion | null {
  const auto = project.versions.find((v) => v.kind === 'auto_save');
  if (auto) return auto;
  return project.first_draft ?? null;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

type RevisionState =
  | { kind: 'idle' }
  | { kind: 'running'; scope: 'section' | 'full' }
  | { kind: 'error'; message: string };

export function Stage3Edit() {
  const { project, setProject } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();

  // Resolved once at mount; we don't re-hydrate from props since the user is
  // now the source of truth while editing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialSource = useMemo(() => pickSourceDraft(project), []);

  // Live serialized state used by useAutoSave. TipTap's onUpdate pushes into
  // these whenever the document changes.
  const [doc, setDoc] = useState<unknown>(initialSource?.doc ?? null);
  const [plainText, setPlainText] = useState<string>(initialSource?.plain_text ?? '');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [revision, setRevision] = useState<RevisionState>({ kind: 'idle' });
  const [revisionWarnings, setRevisionWarnings] = useState<string[]>([]);
  const approvingRef = useRef(false);
  const revisingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Start editing your draft…' }),
    ],
    // If the source already has a TipTap doc, use it directly. Otherwise
    // hydrate from the markdown plain_text via our lightweight converter.
    content: initialSource?.doc ?? markdownToHtml(initialSource?.plain_text ?? ''),
    editorProps: {
      attributes: {
        class:
          'tiptap-doc min-h-[480px] rounded-md border border-neutral-200 bg-white px-6 py-5 text-[15px] leading-relaxed text-neutral-800 focus:outline-none focus:border-neutral-400',
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      setDoc(json);
      setPlainText(docToMarkdown(json));
    },
  });

  // Defensive redirect — Stage 3 requires a first_draft to be meaningful.
  useEffect(() => {
    if (!project.first_draft) {
      navigate(`/project/${project.id}/stage-2`, { replace: true });
    }
  }, [project.first_draft, project.id, navigate]);

  const revisionRunning = revision.kind === 'running';

  const { state: saveState, flush } = useAutoSave({
    enabled: editor !== null && !approving && !revisionRunning,
    doc,
    plainText,
    promptVersion: initialSource?.prompt_version,
    setProject,
  });

  async function handleSaveSnapshot() {
    const label = window.prompt('Label for this snapshot (optional):', '') ?? '';
    const trimmed = label.trim();
    const snapshot: DraftVersion = {
      created_at: new Date().toISOString(),
      kind: 'manual_snapshot',
      label: trimmed.length > 0 ? trimmed : undefined,
      doc,
      plain_text: plainText,
      prompt_version: initialSource?.prompt_version,
    };
    // Flush any pending auto_save first so the snapshot isn't stale vs. what
    // the user just typed.
    await flush();
    await setProject((prev) => ({
      ...prev,
      versions: [...prev.versions, snapshot],
    }));
  }

  async function handleApprove() {
    if (approvingRef.current) return;
    if (plainText.trim().length === 0) {
      setApproveError('The draft is empty — write something before approving.');
      return;
    }
    approvingRef.current = true;
    setApproving(true);
    setApproveError(null);
    try {
      await flush();
      const approved: DraftVersion = {
        created_at: new Date().toISOString(),
        kind: 'approved',
        doc,
        plain_text: plainText,
        prompt_version: initialSource?.prompt_version,
      };
      await setProject((prev) => ({
        ...prev,
        versions: [...prev.versions, approved],
        final_draft: approved,
        stage_status: 'approved',
        status: 'approved',
      }));
      navigate(`/project/${project.id}/stage-4`);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Failed to approve draft.');
      approvingRef.current = false;
      setApproving(false);
    }
  }

  async function handleReviseSection() {
    if (!editor || revisingRef.current) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setRevision({
        kind: 'error',
        message: 'Highlight the passage you want revised first.',
      });
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to, '\n');
    if (selectedText.trim().length === 0) {
      setRevision({ kind: 'error', message: 'The selected range is empty.' });
      return;
    }
    const comment = window.prompt(
      `How should Claude revise this passage?\n\n"${truncate(selectedText, 180)}"`,
      '',
    );
    if (comment === null) return; // User cancelled.
    const trimmed = comment.trim();
    if (trimmed.length === 0) {
      setRevision({ kind: 'error', message: 'Add a comment so Claude knows what to change.' });
      return;
    }

    revisingRef.current = true;
    setRevision({ kind: 'running', scope: 'section' });
    try {
      const profile = await profileRepo.getOrCreate();
      const assembled = assembleSectionRevisionPrompt({
        profile,
        metadata: project.metadata,
      });
      setRevisionWarnings(assembled.warnings);
      const userMessage = [
        '## Full draft (for context)',
        plainText,
        '',
        '## Highlighted passage',
        selectedText,
        '',
        '## Revision request',
        trimmed,
      ].join('\n');
      const res = await callClaude({
        system: assembled.system,
        messages: [{ role: 'user', content: userMessage }],
        metadata: { stage: 'section_revision', project_id: project.id },
      });
      const revisedText = extractText(res).trim();
      if (revisedText.length === 0) {
        throw new Error('Claude returned an empty revision.');
      }
      // Replace the selection with the revised content. Converting through
      // markdown preserves any formatting the model emitted.
      const html = markdownToHtml(revisedText);
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent(html)
        .run();
      setRevision({ kind: 'idle' });
    } catch (err) {
      setRevision({ kind: 'error', message: formatError(err) });
    } finally {
      revisingRef.current = false;
    }
  }

  async function handleReviseFull() {
    if (!editor || revisingRef.current) return;
    if (plainText.trim().length === 0) {
      setRevision({ kind: 'error', message: 'There is nothing to revise yet.' });
      return;
    }
    const feedback = window.prompt(
      'What should Claude change across the whole draft?',
      '',
    );
    if (feedback === null) return;
    const trimmed = feedback.trim();
    if (trimmed.length === 0) {
      setRevision({ kind: 'error', message: 'Add feedback so Claude knows what to change.' });
      return;
    }
    const confirmed = window.confirm(
      'This will replace the entire draft with the revision. The current state will still be reachable from Versions (via the latest auto-save). Continue?',
    );
    if (!confirmed) return;

    revisingRef.current = true;
    setRevision({ kind: 'running', scope: 'full' });
    try {
      // Flush before we overwrite so the pre-revision state is preserved
      // as the most recent auto_save snapshot.
      await flush();

      const profile = await profileRepo.getOrCreate();
      const assembled = assembleFullRevisionPrompt({
        profile,
        metadata: project.metadata,
      });
      setRevisionWarnings(assembled.warnings);
      const userMessage = [
        '## Current draft',
        plainText,
        '',
        '## Feedback',
        trimmed,
      ].join('\n');
      const res = await callClaude({
        system: assembled.system,
        messages: [{ role: 'user', content: userMessage }],
        metadata: { stage: 'full_revision', project_id: project.id },
      });
      const revisedText = extractText(res).trim();
      if (revisedText.length === 0) {
        throw new Error('Claude returned an empty revision.');
      }
      // `true` makes TipTap fire onUpdate so our serialized state + auto-save
      // catch up naturally.
      editor.commands.setContent(markdownToHtml(revisedText), true);
      setRevision({ kind: 'idle' });
    } catch (err) {
      setRevision({ kind: 'error', message: formatError(err) });
    } finally {
      revisingRef.current = false;
    }
  }

  function handleRestoreVersion(version: DraftVersion) {
    if (!editor) return;
    const label = versionLabel(version);
    const ok = window.confirm(
      `Restore "${label}"? The current draft will still be reachable from the most recent auto-save.`,
    );
    if (!ok) return;
    const html =
      version.doc !== null && version.doc !== undefined
        ? null
        : markdownToHtml(version.plain_text);
    // Prefer the stored JSON doc when available — it preserves structure
    // losslessly. Fall back to re-hydrating from markdown.
    if (version.doc) {
      editor.commands.setContent(version.doc as never, true);
    } else if (html !== null) {
      editor.commands.setContent(html, true);
    }
  }

  if (!project.first_draft) {
    return (
      <Layout>
        <p className="text-sm text-neutral-500">Redirecting to Stage 2…</p>
      </Layout>
    );
  }

  const selectionEmpty = editor ? editor.state.selection.empty : true;
  const revisionBusy = revision.kind === 'running';

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
      <div className="space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Stage 3 · Edit</p>
            <h1 className="mt-1 text-2xl font-semibold">
              {project.metadata.working_title?.trim() || 'New article'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Edit directly or ask Claude to revise. Auto-saves every second while you type.
              Save Version captures a named checkpoint. Approve locks the draft and advances
              to Stage 4.
            </p>
          </div>
        </header>

        {editor && <EditorToolbar editor={editor} />}

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Claude
          </span>
          <button
            type="button"
            onClick={() => void handleReviseSection()}
            disabled={revisionBusy || selectionEmpty}
            title={selectionEmpty ? 'Highlight text first' : 'Revise the highlighted passage'}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Revise selection
          </button>
          <button
            type="button"
            onClick={() => void handleReviseFull()}
            disabled={revisionBusy}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Revise full draft
          </button>
          <VersionsMenu project={project} onRestore={handleRestoreVersion} />
          {revision.kind === 'running' && (
            <span className="ml-auto text-xs text-neutral-500">
              Claude is revising ({revision.scope === 'section' ? 'selection' : 'full draft'})…
            </span>
          )}
          {revision.kind === 'error' && (
            <span className="ml-auto text-xs text-red-600">{revision.message}</span>
          )}
        </div>

        {revisionWarnings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Learning-system notes</p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              {revisionWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <EditorContent editor={editor} />

        <footer className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">{wordCount(plainText)} words</div>
          <div className="flex items-center gap-3">
            {approveError && <p className="text-sm text-red-600">{approveError}</p>}
            <button
              type="button"
              onClick={() => void handleSaveSnapshot()}
              className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
            >
              Save Version
            </button>
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={approving}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {approving ? 'Approving…' : 'Approve →'}
            </button>
          </div>
        </footer>
      </div>
    </Layout>
  );
}

// ---------- Helpers ----------

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

function formatError(err: unknown): string {
  if (err instanceof ClaudeError) return `${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

function versionLabel(v: DraftVersion): string {
  if (v.label && v.label.length > 0) return v.label;
  const time = new Date(v.created_at).toLocaleString();
  switch (v.kind) {
    case 'first_draft':
      return `First draft · ${time}`;
    case 'auto_save':
      return `Auto-save · ${time}`;
    case 'manual_snapshot':
      return `Snapshot · ${time}`;
    case 'approved':
      return `Approved · ${time}`;
  }
}

// ---------- Versions menu ----------

function VersionsMenu({
  project,
  onRestore,
}: {
  project: ProjectContext['project'];
  onRestore: (v: DraftVersion) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Combine all reachable versions, newest first. first_draft is not in
  // versions[] — it lives on project directly — so prepend it explicitly.
  const all: DraftVersion[] = [];
  if (project.first_draft) all.push(project.first_draft);
  all.push(...project.versions);
  const sorted = all
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-800 hover:bg-neutral-100"
      >
        Versions ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-80 rounded-md border border-neutral-200 bg-white shadow-md">
          {sorted.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-500">No versions yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {sorted.map((v, i) => (
                <li key={`${v.kind}-${v.created_at}-${i}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onRestore(v);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs hover:bg-neutral-100"
                  >
                    <div className="font-medium text-neutral-800">{versionLabel(v)}</div>
                    <div className="text-neutral-500">
                      {wordCount(v.plain_text)} words
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Toolbar ----------

type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

function EditorToolbar({ editor }: { editor: EditorInstance }) {
  // Force re-render on selection change so the active-state highlights update.
  const [, setTick] = useState(0);
  useEffect(() => {
    const rerender = () => setTick((t) => t + 1);
    editor.on('selectionUpdate', rerender);
    editor.on('transaction', rerender);
    return () => {
      editor.off('selectionUpdate', rerender);
      editor.off('transaction', rerender);
    };
  }, [editor]);

  const btn = (active: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs ${
      active
        ? 'border-neutral-900 bg-neutral-900 text-white'
        : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={btn(editor.isActive('heading', { level: 1 }))}
      >
        H1
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btn(editor.isActive('heading', { level: 2 }))}
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btn(editor.isActive('heading', { level: 3 }))}
      >
        H3
      </button>
      <span className="mx-1 h-4 w-px bg-neutral-200" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive('bold'))}
      >
        Bold
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive('italic'))}
      >
        Italic
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={btn(editor.isActive('code'))}
      >
        Code
      </button>
      <span className="mx-1 h-4 w-px bg-neutral-200" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive('bulletList'))}
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive('orderedList'))}
      >
        1. List
      </button>
      <span className="mx-1 h-4 w-px bg-neutral-200" />
      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className={`${btn(false)} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className={`${btn(false)} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        Redo
      </button>
    </div>
  );
}
