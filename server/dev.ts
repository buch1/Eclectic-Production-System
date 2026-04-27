/**
 * Local development server. Mounts the shared proxy handler so `npm run dev`
 * behaves exactly like the Vercel function would in production.
 *
 * Vite (port 5173) proxies /api/* to this server (port 5174).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env before anything else reads process.env. We do this manually
// instead of using dotenv because tsx watch + ESM has compatibility issues
// with dotenv's auto-config.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
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

import express from 'express';
import { handleProxyRequest } from '../api/_handler';

const PORT = Number(process.env.DEV_API_PORT ?? 5174);

const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/api/claude', async (req, res) => {
  const { status, body } = await handleProxyRequest({
    method: req.method,
    authHeader: req.get('authorization'),
    body: req.body,
  });
  res.status(status).json(body);
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    hasAuthToken: Boolean(process.env.PROXY_AUTH_TOKEN),
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] dev proxy listening on http://localhost:${PORT}`);
});
