/**
 * Red-flag checks derived from bucci-voice-guide.md's "Red Flags" section.
 * Advisory only — surfaces warnings inline on generated drafts. Never blocks
 * saving or approval.
 */

export interface RedFlag {
  id: string;
  label: string;
  detail: string;
}

const RED_FLAGS: Array<{ id: string; label: string; detail: string; test: (text: string) => boolean }> = [
  {
    id: 'no-first-person',
    label: 'No first-person perspective',
    detail: "Drafts should include personal anecdotes. No 'I' or 'me' found.",
    test: (t) => !/\b(I|I'm|I've|my|me)\b/i.test(t),
  },
  {
    id: 'overuses-leverage',
    label: '"Leverage" used as a verb more than once',
    detail: 'Voice guide flags overused corporate jargon.',
    test: (t) => (t.match(/\bleverag(e|ing|es|ed)\b/gi) ?? []).length > 1,
  },
  {
    id: 'generic-ai-openers',
    label: 'Generic AI-style opener',
    detail: 'Phrases like "In today\'s rapidly evolving landscape" or "Let\'s dive in" are red-flagged.',
    test: (t) =>
      /in today'?s rapidly evolving/i.test(t) ||
      /let'?s dive in/i.test(t) ||
      /in conclusion[,.]/i.test(t),
  },
  {
    id: 'over-hedged',
    label: 'Excessive hedging',
    detail: 'Too many "could", "might", "potentially" — voice is supposed to take positions.',
    test: (t) => {
      const count = (t.match(/\b(could|might|potentially|perhaps|possibly)\b/gi) ?? []).length;
      return count > 6;
    },
  },
  {
    id: 'thesis-opener',
    label: 'Opens with a thesis statement',
    detail: '"In this article, I will..." / "Today I want to talk about..." are flagged.',
    test: (t) => /^\s*(in this (article|post),? I will|today I (want|'m going) to talk about)/i.test(t),
  },
];

export function runRedFlagChecks(plainText: string): RedFlag[] {
  const hits: RedFlag[] = [];
  for (const rule of RED_FLAGS) {
    if (rule.test(plainText)) {
      hits.push({ id: rule.id, label: rule.label, detail: rule.detail });
    }
  }
  return hits;
}
