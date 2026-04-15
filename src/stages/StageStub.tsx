/**
 * Placeholder used for every stage in the scaffold commit. Each stage gets
 * its own implementation in a follow-up commit (Stage 1 first).
 *
 * The stub still renders the shared layout and shows which stage would load,
 * so the routing + project shell can be validated end-to-end.
 */
import { Link, useOutletContext } from 'react-router-dom';
import type { ProjectContext } from '@/pages/ProjectShell';
import { Layout } from '@/components/Layout';
import { stageLabel } from '@/lib/projects';

export function StageStub({ stageNumber, stageKey }: { stageNumber: number; stageKey: string }) {
  const ctx = useOutletContext<ProjectContext>();
  return (
    <Layout
      rightSlot={
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          All projects
        </Link>
      }
    >
      <div className="rounded-md border border-dashed border-neutral-300 bg-white p-12 text-center">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          Stage {stageNumber} · {stageKey}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          {ctx.project.metadata.working_title?.trim() || 'Untitled article'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Currently at: {stageLabel(ctx.project.stage_status)}
        </p>
        <p className="mt-6 text-sm text-neutral-600">
          This stage is wired into the router but not yet implemented. It will be built in the next commit.
        </p>
      </div>
    </Layout>
  );
}
