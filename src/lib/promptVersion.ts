/**
 * Deterministic short hash used as a prompt version identifier.
 *
 * Rationale (from the build-plan review): every generated output needs to
 * record which assembled prompt produced it, so a good draft can be traced
 * back to the prompt that generated it. A 12-char FNV-1a hash of the full
 * system prompt string is enough to make collisions astronomically unlikely
 * within one user's corpus while staying short and human-legible.
 */
export function promptVersion(systemPrompt: string): string {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < systemPrompt.length; i += 1) {
    h ^= systemPrompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const unsigned = h >>> 0;
  // Mix in length so trivial prefix collisions are even rarer.
  const lenTag = systemPrompt.length.toString(36).padStart(4, '0').slice(-4);
  return `v1.${unsigned.toString(36)}.${lenTag}`;
}
