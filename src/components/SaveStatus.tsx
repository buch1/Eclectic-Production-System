/**
 * Save-status indicator shared by Stage 3 (and any other stage that auto-saves).
 *
 * The actual debounce/auto-save loop is wired up in Stage 3 with `useAutoSave`;
 * this component is purely presentational.
 */

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export function SaveStatus({ state, lastSavedAt }: { state: SaveState; lastSavedAt?: string }) {
  const label = (() => {
    switch (state) {
      case 'idle':
        return 'No changes';
      case 'dirty':
        return 'Unsaved changes';
      case 'saving':
        return 'Saving…';
      case 'saved':
        return lastSavedAt ? `Saved ${formatTime(lastSavedAt)}` : 'Saved';
      case 'error':
        return 'Save failed';
    }
  })();

  const color = (() => {
    switch (state) {
      case 'dirty':
        return 'text-amber-600';
      case 'saving':
        return 'text-neutral-500';
      case 'saved':
        return 'text-emerald-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-neutral-400';
    }
  })();

  return <span className={`text-xs ${color}`}>{label}</span>;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}
