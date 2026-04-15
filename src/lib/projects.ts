/**
 * Project creation helpers + stage transitions.
 * Stage UI calls these rather than mutating the project shape directly.
 */
import type { Project, StageStatus } from '@/types';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProject(): Project {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created_at: now,
    last_saved_at: now,
    status: 'draft',
    stage_status: 'input',
    metadata: {},
    outline: '',
    versions: [],
    image_prompts: [],
    linkedin_variants: [],
  };
}

export function stageLabel(stage: StageStatus): string {
  switch (stage) {
    case 'input':
      return 'Outline';
    case 'first_draft':
      return 'First Draft';
    case 'editing':
      return 'Editing';
    case 'approved':
      return 'Approved';
    case 'producing_images':
      return 'Image Prompts';
    case 'producing_distribution':
      return 'Distribution';
    case 'complete':
      return 'Complete';
  }
}

export function touch(project: Project): Project {
  return { ...project, last_saved_at: new Date().toISOString() };
}
