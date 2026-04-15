/**
 * ProjectShell loads a project by id and renders the current stage via an
 * outlet. Stage components consume the project from useOutletContext.
 *
 * Contract for setProject:
 *   - The updater is called against the latest known project (read from a
 *     ref, not a stale closure).
 *   - The updated project is persisted to storage BEFORE the promise
 *     resolves and BEFORE the re-render. Stages can safely `await setProject`
 *     and then navigate, knowing the next route will read the fresh state.
 *   - `last_saved_at` is stamped automatically on every update.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { projectRepo } from '@/lib/storage/repositories';
import type { Project } from '@/types';
import { Layout } from '@/components/Layout';

export interface ProjectContext {
  project: Project;
  setProject: (updater: (prev: Project) => Project) => Promise<void>;
}

type LoadState = Project | null | 'missing';

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProjectState] = useState<LoadState>(null);
  const projectRef = useRef<LoadState>(null);
  projectRef.current = project;

  useEffect(() => {
    if (!projectId) return;
    void projectRepo.get(projectId).then((p) => {
      setProjectState(p ?? 'missing');
    });
  }, [projectId]);

  const setProject = useCallback<ProjectContext['setProject']>(async (updater) => {
    const current = projectRef.current;
    if (current === null || current === 'missing') return;
    const next: Project = {
      ...updater(current),
      last_saved_at: new Date().toISOString(),
    };
    await projectRepo.save(next);
    projectRef.current = next;
    setProjectState(next);
  }, []);

  if (project === null) {
    return (
      <Layout>
        <p className="text-sm text-neutral-500">Loading project…</p>
      </Layout>
    );
  }
  if (project === 'missing') {
    return (
      <Layout>
        <p className="text-sm text-red-600">Project not found.</p>
      </Layout>
    );
  }

  const ctx: ProjectContext = { project, setProject };
  return <Outlet context={ctx} />;
}
