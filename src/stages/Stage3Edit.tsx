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
 * Defensive behaviours:
 *   - If no first_draft exists, route back to Stage 2 (user shouldn't be
 *     here yet).
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

export function Stage3Edit() {
  const { project, setProject } = useOutletContext<ProjectContext>();
  const navigate = useNavigate();

  // Resolved once at mount; we don't re-hydrate from props since the user is
  // now the source of truth while editing.
  const initialSource = useMemo(() => pickSourceDraft(project), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // Live serialized state used by useAutoSave. TipTap's onUpdate pushes into
  // these whenever the document changes.
  const [doc, setDoc] = useState<unknown>(initialSource?.doc ?? null);
  const [plainText, setPlainText] = useState<string>(initialSource?.plain_text ?? '');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const approvingRef = useRef(false);

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

  const { state: saveState, flush } = useAutoSave({
    enabled: editor !== null && !approving,
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

  if (!project.first_draft) {
    return (
      <Layout>
        <p className="text-sm text-neutral-500">Redirecting to Stage 2…</p>
      </Layout>
    );
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
      <div className="space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Stage 3 · Edit</p>
            <h1 className="mt-1 text-2xl font-semibold">
              {project.metadata.working_title?.trim() || 'New article'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Edit the draft directly. Auto-saves every second while you type. Use Save Version
              to capture a named checkpoint, or Approve when it's ready to lock in.
            </p>
          </div>
        </header>

        {editor && <EditorToolbar editor={editor} />}

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
