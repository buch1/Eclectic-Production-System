/**
 * System prompt assembly for each AI-powered stage.
 *
 * Every assembled prompt is paired with a `prompt_version` via `promptVersion()`
 * so generated outputs can be traced back to the exact prompt that produced
 * them. Output of this module is the single source of truth for what the model
 * sees — any per-stage customization happens here, not inline in stage code.
 */
import type { LearnedPattern, ProjectMetadata, UserProfile } from '@/types';
import { VOICE_GUIDE, VISUAL_GUIDE } from '@/data/guides';
import { promptVersion } from './promptVersion';
import { renderPatternsBlock, selectPatternsForInjection } from './learningSystem';

export interface AssembledPrompt {
  system: string;
  prompt_version: string;
  /** Non-fatal warnings from pattern selection (e.g., budget exceeded). */
  warnings: string[];
}

function voiceBlock(profile: UserProfile | null): string {
  if (profile && profile.voice_style_guide.trim().length > 0) {
    return profile.voice_style_guide;
  }
  return VOICE_GUIDE;
}

function visualBlock(profile: UserProfile | null): string {
  if (profile && profile.visual_style_guide.trim().length > 0) {
    return profile.visual_style_guide;
  }
  return VISUAL_GUIDE;
}

function patternsSelection(profile: UserProfile | null): {
  block: string;
  warnings: string[];
} {
  const patterns: LearnedPattern[] = profile?.learned_patterns ?? [];
  const selection = selectPatternsForInjection(patterns);
  return {
    block: renderPatternsBlock(selection.patterns),
    warnings: selection.warnings,
  };
}

function metadataBlock(metadata: ProjectMetadata): string {
  const lines: string[] = [];
  if (metadata.working_title) lines.push(`Working title: ${metadata.working_title}`);
  if (metadata.target_audience) lines.push(`Target audience: ${metadata.target_audience}`);
  if (metadata.tone) lines.push(`Desired tone: ${metadata.tone}`);
  if (metadata.reference_links && metadata.reference_links.length > 0) {
    lines.push(`Reference links: ${metadata.reference_links.join(', ')}`);
  }
  if (lines.length === 0) return '';
  return ['## Article Metadata', ...lines].join('\n');
}

function assemble(parts: string[], warnings: string[] = []): AssembledPrompt {
  const system = parts.filter((p) => p.trim().length > 0).join('\n\n');
  return { system, prompt_version: promptVersion(system), warnings };
}

// ---------- Stage 2: First Draft ----------

export function assembleFirstDraftPrompt(args: {
  profile: UserProfile | null;
  metadata: ProjectMetadata;
}): AssembledPrompt {
  const instructions = [
    '# Task',
    'You are ghostwriting a first draft of a blog article in the voice described below.',
    'Produce a complete article — intro, body with headers, and closing reflection — not just an outline expansion.',
    'Follow the Voice Guide strictly. Avoid every item in its "Red Flags" section.',
    'Output plain markdown. Do not wrap your response in code fences or commentary.',
  ].join('\n');

  const pats = patternsSelection(args.profile);
  return assemble(
    [
      instructions,
      '# Voice Guide',
      voiceBlock(args.profile),
      pats.block,
      metadataBlock(args.metadata),
    ],
    pats.warnings,
  );
}

// ---------- Stage 3: Inline revision ----------

export function assembleSectionRevisionPrompt(args: {
  profile: UserProfile | null;
  metadata: ProjectMetadata;
}): AssembledPrompt {
  const instructions = [
    '# Task',
    'You revise a single highlighted section of a draft based on the user\'s inline comment.',
    'Return ONLY the revised text for that section. No preamble, no explanation, no markdown code fences.',
    'Preserve the surrounding context — do not rewrite material outside the highlight.',
    'Stay in the voice described below and honour every "Red Flag".',
  ].join('\n');

  const pats = patternsSelection(args.profile);
  return assemble(
    [
      instructions,
      '# Voice Guide',
      voiceBlock(args.profile),
      pats.block,
      metadataBlock(args.metadata),
    ],
    pats.warnings,
  );
}

export function assembleFullRevisionPrompt(args: {
  profile: UserProfile | null;
  metadata: ProjectMetadata;
}): AssembledPrompt {
  const instructions = [
    '# Task',
    'You revise the entire draft based on the user\'s feedback.',
    'Return the full revised article as markdown. No code fences, no commentary.',
    'Preserve what is working; only change what the feedback targets.',
  ].join('\n');
  const pats = patternsSelection(args.profile);
  return assemble(
    [
      instructions,
      '# Voice Guide',
      voiceBlock(args.profile),
      pats.block,
      metadataBlock(args.metadata),
    ],
    pats.warnings,
  );
}

// ---------- Stage 4: Diff / learning ----------

export function assembleDiffPrompt(): AssembledPrompt {
  const instructions = [
    '# Task',
    'Compare a first draft to the final approved draft of the same article.',
    'Return a JSON object with this exact shape:',
    '{',
    '  "rewritten_sections": string[],   // short labels of sections the user materially rewrote',
    '  "kept_sections": string[],         // short labels of sections kept essentially as-generated',
    '  "edit_types": string[],            // e.g., "tightened opener", "added personal anecdote", "cut jargon"',
    '  "patterns": string[]               // 1-5 generalizable patterns the user tends to apply',
    '}',
    'Respond with JSON only — no markdown, no prose outside the JSON.',
  ].join('\n');
  return assemble([instructions]);
}

// ---------- Stage 5: Image prompts ----------

export function assembleImagePromptsPrompt(args: {
  profile: UserProfile | null;
}): AssembledPrompt {
  const instructions = [
    '# Task',
    'Read the provided article and produce 3-5 image generation prompts keyed to its most visual moments.',
    'Each prompt must follow the Visual Style Guide — comic/manga illustration style, never photography.',
    'Return a JSON array. Each item: { "section_label": string, "prompt": string, "style_notes": string, "aspect_ratio": string }.',
    'No prose outside the JSON.',
  ].join('\n');
  return assemble([
    instructions,
    '# Visual Style Guide',
    visualBlock(args.profile),
  ]);
}

// ---------- Stage 6: LinkedIn ----------

export function assembleLinkedInPrompt(args: {
  profile: UserProfile | null;
  metadata: ProjectMetadata;
}): AssembledPrompt {
  const instructions = [
    '# Task',
    'Produce exactly three LinkedIn post variants of 150-300 words each from the provided article.',
    'Strategies: "hook" (provocative opener), "story" (personal anecdote opener), "hot_take" (contrarian opener).',
    'Return a JSON array of { "strategy": "hook"|"story"|"hot_take", "body": string }. JSON only.',
  ].join('\n');
  const pats = patternsSelection(args.profile);
  return assemble(
    [
      instructions,
      '# Voice Guide',
      voiceBlock(args.profile),
      pats.block,
      metadataBlock(args.metadata),
    ],
    pats.warnings,
  );
}

// ---------- Stage 7: Instagram carousel ----------

export function assembleCarouselPrompt(args: {
  profile: UserProfile | null;
}): AssembledPrompt {
  const instructions = [
    '# Task',
    'Convert the provided article into an Instagram carousel.',
    'Produce 5-8 slides: one title slide, the rest key points, a final CTA slide.',
    'Each slide text is max 30 words.',
    'For each slide, include an image prompt designed for text overlay: specify areas of low visual complexity and a palette that gives strong text contrast. Follow the Visual Style Guide.',
    'Also produce one Instagram caption with relevant hashtags.',
    'Return JSON: { "slides": [{ "kind": "title"|"point"|"cta", "text": string, "image_prompt": string, "style_notes": string }], "caption": string }. JSON only.',
  ].join('\n');
  return assemble([
    instructions,
    '# Visual Style Guide',
    visualBlock(args.profile),
  ]);
}
