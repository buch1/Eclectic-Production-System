/**
 * Core types for the Eclectic Production System.
 *
 * Mirrors the data model in content-pipeline-blueprint.md with the additions
 * from the senior review feedback:
 *   - prompt_version, last_saved_at, stage_status on Project
 *   - pattern_count, last_pattern_review on UserProfile
 *   - pinned flag on LearnedPattern for user curation
 */

export type StageStatus =
  | 'input'
  | 'first_draft'
  | 'editing'
  | 'approved'
  | 'producing_images'
  | 'producing_distribution'
  | 'complete';

export type ProjectStatus = 'draft' | 'in_review' | 'approved' | 'produced';

export type Tone = 'conversational' | 'provocative' | 'reflective' | 'analytical' | string;

export interface ProjectMetadata {
  working_title?: string;
  target_audience?: string;
  tone?: Tone;
  reference_links?: string[];
}

export interface DraftVersion {
  /** ISO timestamp. */
  created_at: string;
  /** One of: "first_draft", "auto_save", "manual_snapshot", "approved". */
  kind: 'first_draft' | 'auto_save' | 'manual_snapshot' | 'approved';
  /** Optional label for named snapshots. */
  label?: string;
  /** TipTap JSON doc. Kept as unknown to avoid leaking TipTap types into shared modules. */
  doc: unknown;
  /** Plain-text representation for diffing and prompts. */
  plain_text: string;
  /** Which prompt version produced this draft, if any. */
  prompt_version?: string;
}

export interface ImagePrompt {
  id: string;
  /** Which article section this prompt maps to (free-form label). */
  section_label: string;
  prompt: string;
  style_notes?: string;
  aspect_ratio?: string;
  prompt_version: string;
  approved?: boolean;
  /** Stage 7 only: whether the prompt is designed for text-overlay backgrounds. */
  for_text_overlay?: boolean;
}

export interface LinkedInVariant {
  id: string;
  strategy: 'hook' | 'story' | 'hot_take';
  body: string;
  prompt_version: string;
}

export interface CarouselSlide {
  id: string;
  index: number;
  kind: 'title' | 'point' | 'cta';
  text: string;
  image_prompt: ImagePrompt;
}

export interface InstagramCarousel {
  slides: CarouselSlide[];
  caption: string;
  prompt_version: string;
}

export interface DiffSummary {
  /** ISO timestamp when the diff was generated. */
  generated_at: string;
  /** Structured summary of rewrites vs. kept sections, edit types, patterns. */
  rewritten_sections: string[];
  kept_sections: string[];
  edit_types: string[];
  /** Natural-language patterns the learning system extracted. */
  patterns: string[];
}

export interface Project {
  id: string;
  created_at: string;
  /** Updated on any persistent write; used by auto-save + dashboard sorting. */
  last_saved_at: string;
  status: ProjectStatus;
  stage_status: StageStatus;
  metadata: ProjectMetadata;

  /** Stage 1 input (raw outline / rough content). */
  outline: string;

  /** Stage 2 output. Stored so Stage 4 can diff against the final. */
  first_draft?: DraftVersion;

  /** Stage 3 edit history (includes auto-saves and manual snapshots). */
  versions: DraftVersion[];

  /** Stage 4 approved draft. */
  final_draft?: DraftVersion;

  /** Stage 4 diff output feeding the learning system. */
  diff_summary?: DiffSummary;

  /** Stage 5. */
  image_prompts: ImagePrompt[];

  /** Stage 6. */
  linkedin_variants: LinkedInVariant[];

  /** Stage 7. */
  instagram_carousel?: InstagramCarousel;

  /** Which prompt version produced the current state of the project. */
  prompt_version?: string;
}

export interface LearnedPattern {
  id: string;
  created_at: string;
  /** Human-readable description (e.g., "Always cuts corporate jargon"). */
  description: string;
  /** User-curated tag. */
  category?: 'tone' | 'structure' | 'vocabulary' | 'length' | 'other';
  /** When pinned, the pattern is always injected regardless of recency. */
  pinned: boolean;
  /** IDs of projects whose diffs contributed to this pattern. */
  source_project_ids: string[];
}

export interface StyleExample {
  id: string;
  prompt: string;
  /** Optional URL or data URL of the generated image (Phase 2). */
  result_image_url?: string;
  approved: boolean;
  tags: string[];
}

export interface UserProfile {
  /** The permanent voice/style guide (SOUL.md equivalent). Editable by the user. */
  voice_style_guide: string;
  /** Visual brand guide. Editable by the user. */
  visual_style_guide: string;
  learned_patterns: LearnedPattern[];
  image_style_library: StyleExample[];
  /** Maintained for monitoring growth toward token limits. */
  pattern_count: number;
  /** ISO timestamp of the last time the user reviewed patterns. */
  last_pattern_review?: string;
}

/** Request payload to the Claude proxy. Mirrors api/_handler.ts. */
export interface ClaudeRequest {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

/** Subset of the Anthropic response we rely on. */
export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string } | { type: string; [key: string]: unknown }>;
  stop_reason: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}
