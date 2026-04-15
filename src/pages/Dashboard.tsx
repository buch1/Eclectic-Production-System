/**
 * Project Dashboard — home screen.
 *
 * Lists all articles with their current stage, sorted by last saved. Clicking
 * an item routes into the appropriate stage so the user resumes where they
 * left off. Creating a new project routes directly to Stage 1.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { projectRepo } from '@/lib/storage/repositories';
import { createProject, stageLabel } from '@/lib/projects';
import { formatBytes, getStorageUsage, type StorageUsage } from '@/lib/storage/usage';
import type { Project } from '@/types';
import { Layout } from '@/components/Layout';

export function Dashboard() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void projectRepo.list().then(setProjects);
    void getStorageUsage().then(setUsage);
  }, []);

  async function handleNew() {
    const project = createProject();
    await projectRepo.save(project);
    navigate(`/project/${project.id}/stage-1`);
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <button
          type="button"
          onClick={() => void handleNew()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New article
        </button>
      </div>

      {usage?.shouldWarn && usage.bytes !== null && usage.pct !== null && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Local storage is filling up</p>
          <p className="mt-1">
            Using {formatBytes(usage.bytes)} ({usage.pct}% of the ~5 MB browser limit). Delete old
            projects or export versions before saves start failing.
          </p>
        </div>
      )}

      {projects === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : projects.length === 0 ? (
        <EmptyState onNew={() => void handleNew()} />
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200 bg-white">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={resumeRoute(p)}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {p.metadata.working_title?.trim() || 'Untitled article'}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Last saved {formatRelative(p.last_saved_at)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600">
                  {stageLabel(p.stage_status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 bg-white p-12 text-center">
      <p className="text-sm text-neutral-600">No articles yet.</p>
      <button
        type="button"
        onClick={onNew}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Start the first one
      </button>
    </div>
  );
}

function resumeRoute(p: Project): string {
  switch (p.stage_status) {
    case 'input':
      return `/project/${p.id}/stage-1`;
    case 'first_draft':
      return `/project/${p.id}/stage-2`;
    case 'editing':
      return `/project/${p.id}/stage-3`;
    case 'approved':
      return `/project/${p.id}/stage-4`;
    case 'producing_images':
      return `/project/${p.id}/stage-5`;
    case 'producing_distribution':
    case 'complete':
      return `/project/${p.id}/stage-5`;
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
