import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Dashboard } from '@/pages/Dashboard';
import { ProjectShell } from '@/pages/ProjectShell';
import { Stage1Input } from '@/stages/Stage1Input';
import { Stage2FirstDraft } from '@/stages/Stage2FirstDraft';
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
      { path: 'stage-3', element: <StageStub stageNumber={3} stageKey="edit" /> },
      { path: 'stage-4', element: <StageStub stageNumber={4} stageKey="approve" /> },
      { path: 'stage-5', element: <StageStub stageNumber={5} stageKey="image-prompts" /> },
      { path: 'stage-6', element: <StageStub stageNumber={6} stageKey="linkedin" /> },
      { path: 'stage-7', element: <StageStub stageNumber={7} stageKey="carousel" /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
