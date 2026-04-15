/**
 * Local development server. Mounts the shared proxy handler so `npm run dev`
 * behaves exactly like the Vercel function would in production.
 *
 * Vite (port 5173) proxies /api/* to this server (port 5174).
 */
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
