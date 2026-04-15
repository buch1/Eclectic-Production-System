import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Dashboard } from '@/pages/Dashboard';
import { ProjectShell } from '@/pages/ProjectShell';
import { Stage1Input } from '@/stages/Stage1Input';
import { Stage2FirstDraft } from '@/stages/Stage2FirstDraft';
import { Stage3Edit } from '@/stages/Stage3Edit';
import { Stage4Approve } from '@/stages/Stage4Approve';
import { Stage5ImagePrompts } from '@/stages/Stage5ImagePrompts';
import { StageStub } from '@/stages/StageStub';

export const router = createBrowserRouter([
  { path: '/', element: <Dashboard /> },
  {
    path: '/project/:projectId',
    element: <ProjectShell />,
    children: [
      { index: true, element: <Navigate to="stage-1" replace /> },
      { path: 'stage-1', element: <Stage1Input /> },
      { path: 'stage-2', element: <Stage2FirstDraft /> },
      { path: 'stage-3', element: <Stage3Edit /> },
      { path: 'stage-4', element: <Stage4Approve /> },
      { path: 'stage-5', element: <Stage5ImagePrompts /> },
      { path: 'stage-6', element: <StageStub stageNumber={6} stageKey="linkedin" /> },
      { path: 'stage-7', element: <StageStub stageNumber={7} stageKey="carousel" /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
