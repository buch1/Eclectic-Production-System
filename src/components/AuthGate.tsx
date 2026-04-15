/**
 * Blocking auth gate. If no proxy auth token is configured (build-time env
 * or previously-entered runtime value), render an entry form. Once the user
 * submits, children render.
 *
 * This is deliberately simple — it's a placeholder until real auth lands.
 * Because everything reads through authToken.ts, swapping this for OAuth /
 * magic links won't touch stage code.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  clearAuthToken,
  hydrateAuthToken,
  isAuthConfigured,
  setAuthToken,
} from '@/lib/authToken';

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateAuthToken().then(() => {
      setAuthed(isAuthConfigured());
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  if (authed) {
    return (
      <>
        {children}
        <SignOutBadge
          onSignOut={async () => {
            await clearAuthToken();
            setAuthed(false);
          }}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <form
        className="w-full max-w-md space-y-4 rounded-lg border border-neutral-200 bg-white p-8 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (input.trim().length === 0) {
            setError('Enter the proxy auth token from your server .env.');
            return;
          }
          await setAuthToken(input.trim());
          setAuthed(true);
        }}
      >
        <div>
          <h1 className="text-xl font-semibold">Eclectic Production System</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Enter your proxy auth token. This is the <code className="font-mono">PROXY_AUTH_TOKEN</code>{' '}
            value from your server's <code className="font-mono">.env</code>.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          placeholder="proxy-auth-token"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-900"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Continue
        </button>
      </form>
    </div>
  );
}

function SignOutBadge({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      className="fixed bottom-4 right-4 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-500 shadow-sm hover:text-neutral-900"
    >
      sign out
    </button>
  );
}
