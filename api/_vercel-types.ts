/**
 * Minimal Vercel request/response types so we can type the serverless handler
 * without depending on @vercel/node. At deploy time Vercel supplies compatible
 * objects at runtime; only the shapes we use are declared here.
 */

export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}
