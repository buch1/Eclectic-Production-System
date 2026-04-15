/**
 * ProjectShell loads a project by id and renders the current stage via an
 * outlet. Stage components consume the project from useOutletContext.
 *
 * Scaffold note: the actual stage implementations land in follow-up commits.
 */
import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { projectRepo } from '@/lib/storage/repositories';
import type { Project } from '@/types';
import { Layout } from '@/components/Layout';

export interface ProjectContext {
  project: Project;
  setProject: (updater: (prev: Project) => Project) => Promise<void>;
}

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProjectState] = useState<Project | null | 'missing'>(null);

  useEffect(() => {
    if (!projectId) return;
    void projectRepo.get(projectId).then((p) => {
      setProjectState(p ?? 'missing');
    });
  }, [projectId]);

  const setProject: ProjectContext['setProject'] = async (updater) => {
    setProjectState((prev) => {
      if (prev === null || prev === 'missing') return prev;
      const next: Project = { ...updater(prev), last_saved_at: new Date().toISOString() };
      void projectRepo.save(next);
      return next;
    });
  };

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
