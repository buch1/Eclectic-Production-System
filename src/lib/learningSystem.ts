/**
 * Learning system helpers.
 *
 * Handles pattern selection (to avoid unbounded prompt growth), conflict
 * detection, and consolidation triggers. Stage-level code should use these
 * functions rather than touching the pattern list directly.
 */
import type { LearnedPattern } from '@/types';

/** Tokens consumed by learned patterns are approximate; use a soft cap. */
const DEFAULT_INJECTION_BUDGET_CHARS = 3_000;

/** Beyond this count, prompt the user to consolidate into the voice guide. */
export const PATTERN_CONSOLIDATION_THRESHOLD = 40;

/** Pairs of opposing verbs used to flag contradictions for user review. */
const CONFLICT_PAIRS: Array<[RegExp, RegExp]> = [
  [/\badd(s|ing)?\b/i, /\b(cut|remove|trim)(s|ting|ming)?\b/i],
  [/\b(lengthen|expand)\b/i, /\b(shorten|tighten|condense)\b/i],
  [/\bmore\b/i, /\bless\b/i],
  [/\bformal\b/i, /\binformal\b/i],
];

/**
 * Choose which patterns to inject into the next system prompt.
 * Strategy: always include pinned patterns, then fill the remaining char
 * budget with the most recently created unpinned patterns.
 */
export function selectPatternsForInjection(
  patterns: LearnedPattern[],
  options: { budgetChars?: number } = {},
): LearnedPattern[] {
  const budget = options.budgetChars ?? DEFAULT_INJECTION_BUDGET_CHARS;
  const pinned = patterns.filter((p) => p.pinned);
  const unpinned = patterns
    .filter((p) => !p.pinned)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const selected: LearnedPattern[] = [];
  let used = 0;
  const push = (p: LearnedPattern): boolean => {
    const cost = p.description.length + 4; // bullet + newline
    if (used + cost > budget) return false;
    selected.push(p);
    used += cost;
    return true;
  };

  for (const p of pinned) push(p);
  for (const p of unpinned) {
    if (!push(p)) break;
  }
  return selected;
}

/** Render selected patterns as a bulleted block for the system prompt. */
export function renderPatternsBlock(patterns: LearnedPattern[]): string {
  if (patterns.length === 0) return '';
  const lines = patterns.map((p) => `- ${p.description}`);
  return ['## Learned Patterns', ...lines].join('\n');
}

/**
 * Return pairs of patterns whose descriptions appear to contradict each other.
 * The UI surfaces these as "Review for conflict" suggestions; it does not
 * automatically delete either side.
 */
export function detectConflicts(
  patterns: LearnedPattern[],
): Array<[LearnedPattern, LearnedPattern]> {
  const conflicts: Array<[LearnedPattern, LearnedPattern]> = [];
  for (let i = 0; i < patterns.length; i += 1) {
    for (let j = i + 1; j < patterns.length; j += 1) {
      const a = patterns[i];
      const b = patterns[j];
      for (const [left, right] of CONFLICT_PAIRS) {
        if (
          (left.test(a.description) && right.test(b.description)) ||
          (left.test(b.description) && right.test(a.description))
        ) {
          conflicts.push([a, b]);
          break;
        }
      }
    }
  }
  return conflicts;
}

export function shouldPromptConsolidation(count: number): boolean {
  return count >= PATTERN_CONSOLIDATION_THRESHOLD;
}
