/**
 * Imports the markdown guides as raw strings so they can be embedded in
 * system prompts. The markdown files at the repo root remain the source of
 * truth — edits propagate into the app on next build/reload.
 *
 * The `?raw` suffix is a Vite feature (declared in src/vite-env.d.ts).
 */
import voiceGuideMd from '../../bucci-voice-guide.md?raw';
import visualGuideMd from '../../bucci-visual-style-guide.md?raw';

export const VOICE_GUIDE: string = voiceGuideMd;
export const VISUAL_GUIDE: string = visualGuideMd;
