/**
 * Vercel serverless function entry point for the Claude proxy.
 * Delegates to the shared handler so dev and prod behave identically.
 */
import type { VercelRequest, VercelResponse } from './_vercel-types';
import { handleProxyRequest } from './_handler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { status, body } = await handleProxyRequest({
    method: req.method ?? 'GET',
    authHeader: req.headers['authorization'] as string | undefined,
    body: req.body,
  });
  res.status(status).json(body);
}
