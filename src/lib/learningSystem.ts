/**
 * Learning system helpers.
 *
 * Handles pattern selection (to avoid unbounded prompt growth), conflict
 * detection, and consolidation triggers. Stage-level code should use these
 * functions rather than touching the pattern list directly.
 */
import type { LearnedPattern } from '@/types';

/**
 * Soft cap on characters used by learned patterns inside the system prompt.
 * Tuned after review feedback: 3k was too tight once a few dozen patterns
 * accumulate. ~8k chars is roughly 2k tokens, which is a comfortable slice
 * of a system-prompt budget without crowding the voice guide.
 */
const DEFAULT_INJECTION_BUDGET_CHARS = 8_000;

/** Beyond this count, prompt the user to consolidate into the voice guide. */
export const PATTERN_CONSOLIDATION_THRESHOLD = 40;

/**
 * Pairs of opposing verbs used to flag contradictions for user review.
 *
 * TODO(learning-v2): This regex approach is a cheap first pass. Semantic
 * conflicts like "Use longer personal anecdotes" vs. "Keep the opening tight"
 * never share opposing verbs and slip through. Upgrade to an LLM-backed check
 * run during the Stage 4 consolidation flow — feed Claude the current pattern
 * list and ask it to cluster near-duplicates and flag genuine contradictions.
 */
const CONFLICT_PAIRS: Array<[RegExp, RegExp]> = [
  [/\badd(s|ing)?\b/i, /\b(cut|remove|trim)(s|ting|ming)?\b/i],
  [/\b(lengthen|expand)\b/i, /\b(shorten|tighten|condense)\b/i],
  [/\bmore\b/i, /\bless\b/i],
  [/\bformal\b/i, /\binformal\b/i],
];

export interface PatternSelection {
  /** Patterns to inject into the system prompt. */
  patterns: LearnedPattern[];
  /**
   * Non-fatal warnings the UI should surface (e.g., budget exceeded by
   * pinned patterns, unpinned patterns dropped).
   */
  warnings: string[];
  /** Total chars used by the selected patterns (for diagnostics). */
  chars_used: number;
  /** Budget in effect for this selection. */
  budget: number;
}

/** Cost (chars) a pattern contributes to the prompt, including list markup. */
function patternCost(p: LearnedPattern): number {
  return p.description.length + 4; // "- " + description + "\n"
}

/**
 * Choose which patterns to inject into the next system prompt.
 *
 * Contract:
 *   - All pinned patterns are ALWAYS injected, even if they collectively
 *     exceed the budget. Exceeding the budget emits a warning so the user can
 *     unpin or consolidate.
 *   - Unpinned patterns fill whatever budget remains after pinned, ordered
 *     by most recently created first.
 *   - Dropped unpinned patterns are counted in a warning so the user isn't
 *     silently missing recent lessons.
 */
export function selectPatternsForInjection(
  patterns: LearnedPattern[],
  options: { budgetChars?: number } = {},
): PatternSelection {
  const budget = options.budgetChars ?? DEFAULT_INJECTION_BUDGET_CHARS;
  const pinned = patterns.filter((p) => p.pinned);
  const unpinned = patterns
    .filter((p) => !p.pinned)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const selected: LearnedPattern[] = [];
  const warnings: string[] = [];
  let used = 0;

  // Pinned patterns: injected unconditionally.
  for (const p of pinned) {
    selected.push(p);
    used += patternCost(p);
  }
  if (used > budget) {
    warnings.push(
      `Pinned patterns use ${used} chars, exceeding the ${budget}-char injection budget. ` +
        `All pinned patterns are still included, but consider unpinning some or ` +
        `consolidating them into the voice guide to keep prompts lean.`,
    );
  }

  // Unpinned patterns: fill remaining budget.
  let droppedUnpinned = 0;
  for (const p of unpinned) {
    const cost = patternCost(p);
    if (used + cost > budget) {
      droppedUnpinned += 1;
      continue;
    }
    selected.push(p);
    used += cost;
  }
  if (droppedUnpinned > 0) {
    warnings.push(
      `${droppedUnpinned} unpinned pattern${droppedUnpinned === 1 ? '' : 's'} dropped ` +
        `to stay within the injection budget. Pin the most important ones or review for consolidation.`,
    );
  }

  return { patterns: selected, warnings, chars_used: used, budget };
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
 * automatically delete either side. See TODO(learning-v2) above.
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
