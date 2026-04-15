import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Layout({ children, rightSlot }: { children: ReactNode; rightSlot?: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-semibold tracking-tight">
            Eclectic Production System
          </Link>
          <div className="flex items-center gap-4 text-sm text-neutral-500">{rightSlot}</div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
