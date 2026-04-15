/**
 * Typed repository helpers over the generic StorageProvider.
 * These are the only functions stage code should call for CRUD — they bake in
 * the right namespace and keep typing consistent.
 */
import type { Project, UserProfile } from '@/types';
import { storage, NAMESPACES } from './index';

const DEFAULT_PROFILE_KEY = 'default';

export const projectRepo = {
  async list(): Promise<Project[]> {
    const all = await storage.listAll<Project>(NAMESPACES.projects);
    return all
      .map((x) => x.value)
      .sort((a, b) => b.last_saved_at.localeCompare(a.last_saved_at));
  },
  async get(id: string): Promise<Project | null> {
    return storage.load<Project>(NAMESPACES.projects, id);
  },
  async save(project: Project): Promise<void> {
    await storage.save(NAMESPACES.projects, project.id, project);
  },
  async delete(id: string): Promise<void> {
    await storage.delete(NAMESPACES.projects, id);
  },
};

export const profileRepo = {
  async get(): Promise<UserProfile | null> {
    return storage.load<UserProfile>(NAMESPACES.profile, DEFAULT_PROFILE_KEY);
  },
  async save(profile: UserProfile): Promise<void> {
    await storage.save(NAMESPACES.profile, DEFAULT_PROFILE_KEY, profile);
  },
};
