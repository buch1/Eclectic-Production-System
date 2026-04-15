/**
 * Typed repository helpers over the generic StorageProvider.
 * These are the only functions stage code should call for CRUD — they bake in
 * the right namespace and keep typing consistent.
 */
import type { Project, UserProfile } from '@/types';
import { VOICE_GUIDE, VISUAL_GUIDE } from '@/data/guides';
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

function defaultProfile(): UserProfile {
  return {
    voice_style_guide: VOICE_GUIDE,
    visual_style_guide: VISUAL_GUIDE,
    learned_patterns: [],
    image_style_library: [],
    pattern_count: 0,
  };
}

export const profileRepo = {
  /** Returns the stored profile, or null if the user has never saved one. */
  async get(): Promise<UserProfile | null> {
    return storage.load<UserProfile>(NAMESPACES.profile, DEFAULT_PROFILE_KEY);
  },

  /**
   * Returns the stored profile, or creates-and-persists a default one using
   * the bundled voice and visual guides. Stage code should prefer this over
   * get() so it can rely on a non-null profile without null-check boilerplate.
   */
  async getOrCreate(): Promise<UserProfile> {
    const existing = await storage.load<UserProfile>(NAMESPACES.profile, DEFAULT_PROFILE_KEY);
    if (existing !== null) return existing;
    const seeded = defaultProfile();
    await storage.save(NAMESPACES.profile, DEFAULT_PROFILE_KEY, seeded);
    return seeded;
  },

  async save(profile: UserProfile): Promise<void> {
    await storage.save(NAMESPACES.profile, DEFAULT_PROFILE_KEY, profile);
  },
};
