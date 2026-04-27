/**
 * Loads .env into process.env. Import this FIRST in dev.ts so env vars are
 * available by the time any other module reads process.env.
 *
 * ESM hoists static imports, so inline code in dev.ts runs AFTER all imports
 * have been evaluated. Putting the loader in its own module guarantees it
 * executes before express / _handler are imported.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');

try {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[api] loaded .env from ${envPath}`);
} catch {
  // eslint-disable-next-line no-console
  console.warn(`[api] no .env file found at ${envPath} — using existing env vars`);
}
