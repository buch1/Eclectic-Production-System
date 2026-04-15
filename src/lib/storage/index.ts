/**
 * Storage entrypoint. Import from here everywhere else in the app; never
 * reach into a concrete implementation directly.
 *
 *   import { storage, NAMESPACES } from '@/lib/storage';
 *   await storage.save(NAMESPACES.projects, project.id, project);
 *
 * To swap the backend (e.g., Supabase), replace `makeStorage` below with a
 * different factory. No stage/component changes required.
 */
import { LocalStorageProvider } from './localStorage';
import type { StorageProvider } from './types';

export { NAMESPACES } from './types';
export type { StorageProvider, Namespace } from './types';

function makeStorage(): StorageProvider {
  return new LocalStorageProvider();
}

export const storage: StorageProvider = makeStorage();
