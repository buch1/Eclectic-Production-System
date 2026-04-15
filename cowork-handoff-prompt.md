# Cowork Handoff Prompt — Content Production Pipeline

## Copy the prompt below into Cowork after pointing it at your content-pipeline folder:

---

I want you to build a web app prototype for a content production pipeline. There are 3 reference docs in this folder that define everything:

1. `content-pipeline-blueprint.md` — The full workflow spec. Read this first. It defines 7 stages from outline to Instagram carousel, the data model, the learning system, and the UX for each stage.

2. `bucci-voice-guide.md` — My writing voice and style guide. This gets embedded as the system prompt for any AI-powered writing stages (Stages 2, 3, 6, 7).

3. `bucci-visual-style-guide.md` — My visual brand guide. This gets embedded as the system prompt for image prompt generation stages (Stages 5, 7).

## What to build

A single-page React web app (can be multiple files) that implements the Tier 1 prototype described in the blueprint. The app should:

- Walk me through all 7 stages sequentially (outline → draft → edit → approve → images → LinkedIn → Instagram carousel)
- Use the Claude API (claude-sonnet-4-20250514) to power Stages 2, 3, 5, 6, and 7
- Embed the voice guide into the system prompt for writing stages
- Embed the visual style guide into the system prompt for image generation stages
- Store project state in local storage or a JSON file so I don't lose work between sessions
- Have a clean, minimal UI — this is a working tool, not a demo. I'll be using it weekly.

## Stage-specific notes

- Stage 1 (Input): Simple text area for outline + optional fields for title, audience, tone
- Stage 2 (First Draft): Call Claude API with voice guide as system prompt, outline as user message. Display the result.
- Stage 3 (Edit): A rich text editor where I can manually edit the draft. Also support highlighting text and giving AI feedback to revise just that section.
- Stage 4 (Approve): Lock the draft. Save the outline + first draft + final draft so the diff can be used for future learning.
- Stage 5 (Image Prompts): Call Claude API with visual style guide as system prompt + approved article. Generate 3-5 image prompts with copy buttons.
- Stage 6 (LinkedIn): Call Claude API to generate 2-3 LinkedIn post variants (hook, story, hot take). Each with a copy button.
- Stage 7 (Instagram Carousel): Generate 5-8 slide texts + image prompts for each slide (designed for text overlay) + caption with hashtags.

## Important

- Read all three docs thoroughly before starting
- The blueprint has a detailed data model section — follow it
- Don't skip the learning system architecture (Stage 4 diff tracking) — that's the key feature that makes this get better over time
- Make sure every AI output has a "Regenerate" button
- The voice guide has a "Red Flags" section — use it as a validation checklist

Start by reading all three files completely, then propose your build plan before writing any code. I want to review the plan first.
