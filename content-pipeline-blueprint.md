# Content Production Pipeline — Workflow Blueprint

## What This Is

A web app that takes a blog article from outline to fully produced, multi-channel content. The AI handles the heavy lifting (drafting, generating derivative content), and the human stays in control of voice, quality, and approval at every stage.

This is the blueprint for validating the workflow. Once validated, it becomes a detailed product spec for a production build — and eventually, an Inimon product offering for clients.

---

## The Pipeline: 7 Stages

```
OUTLINE → FIRST DRAFT → EDIT & REFINE → APPROVE → IMAGE PROMPTS → LINKEDIN → INSTAGRAM CAROUSEL
   1           2              3             4            5             6              7
          [CREATIVE PHASE]                        [PRODUCTION PHASE]
      (human in the loop)                    (automated from approved draft)
```

### How the Two Phases Work

**Creative Phase (Stages 1-4):** Collaborative. The human provides direction, the AI drafts, the human edits and refines. This requires back-and-forth and manual judgment. Ends with an explicit approval.

**Production Phase (Stages 5-7):** Mostly automated. Once the draft is approved, the AI generates all derivative content in one pass. The human reviews and tweaks, but the AI does the production work. Each output can be regenerated independently if one isn't right.

---

## Stage-by-Stage Breakdown

### Stage 1: Input

**What the user does:** Pastes in an outline, bullet points, rough ideas, or a partial draft. Optionally selects metadata.

**Inputs:**
- Outline or rough content (required) — free-form text field, supports markdown
- Working title (optional)
- Target audience (optional dropdown or free text, e.g., "professionals in Japan exploring AI," "product managers," "general tech audience")
- Tone selector (optional, e.g., "conversational," "provocative," "reflective," "analytical")
- Reference articles (optional) — links or pasted text from previous posts the AI should match in style or depth

**What the AI does:** Nothing yet. This stage is just capture.

**Output:** A structured input object saved to the project. Moves to Stage 2.

**UI:** Clean, spacious text input. No clutter. A "Generate First Draft" button at the bottom. The metadata fields (audience, tone) should feel optional, not like a form to fill out.

---

### Stage 2: First Draft

**What the user does:** Waits (briefly), then reads the generated draft.

**What the AI does:**
1. Reads the outline and any metadata from Stage 1
2. Pulls the user's voice/style guide (stored in the system — see "Learning System" below)
3. Pulls learnings from previous outline-to-final comparisons (the feedback loop from Stage 4)
4. Generates a complete first draft in the user's voice

**System prompt includes:**
- The user's permanent voice/style guide (equivalent of SOUL.md)
- Examples of previous approved articles (especially the diffs between first drafts and finals)
- Any tone/audience overrides from Stage 1

**Output:** A full article draft, displayed in the editor.

**UI:** The draft appears in a rich text editor (Stage 3's workspace). A small "AI confidence" note could indicate which sections the AI felt strongest/weakest about, so the user knows where to focus editing energy. Also show a "Regenerate" button in case the first attempt misses the mark entirely.

---

### Stage 3: Edit and Refine

**What the user does:** Two editing modes, switchable at any time:

1. **Manual editing** — Rich text editor with full formatting capabilities:
   - Headers (H1-H4)
   - Bold, italic, strikethrough
   - Bullet and numbered lists
   - Block quotes
   - Links
   - Code blocks (if relevant)
   - Drag-and-drop section reordering
   - The user can directly rewrite any sentence, paragraph, or section

2. **AI-assisted editing** — Inline feedback mode:
   - Highlight a section and leave a comment (e.g., "make this more personal," "too formal," "this isn't my point — my point is X")
   - The AI revises only the highlighted section based on the comment
   - "Revise full draft" button for broader feedback (e.g., "tighten the whole thing, it's too long")
   - Accept/reject each AI revision individually

**What the AI does:** Only responds when asked. Does not auto-suggest or interrupt. When the user highlights text and gives feedback, the AI:
1. Revises that specific section
2. Shows the revision inline (like track changes / diff view)
3. Waits for accept/reject

**Output:** A continuously evolving draft. Every version is saved (version history).

**UI:** This is the core workspace. Should feel like a real writing tool — think Notion or Google Docs level, not a chat interface. The AI collaboration should feel like a co-editor, not a chatbot. Key elements:
- Rich text toolbar at the top
- Main editor canvas (the draft)
- A collapsible side panel for AI comments/suggestions
- Version history accessible from a dropdown or sidebar
- Word count
- "Ready to Approve" button (disabled until user has made at least one edit or explicitly confirms)

---

### Stage 4: Approve

**What the user does:** Clicks "Approve Final Draft." Confirms via a modal: "This will lock the draft and start generating distribution content. Continue?"

**What the AI does (behind the scenes — this is the learning loop):**
1. Saves the approved final draft
2. Compares the Stage 2 first draft to the Stage 4 final draft
3. Generates a structured "lessons learned" summary:
   - What sections were rewritten vs. kept
   - What kind of edits were made (tone shifts, structural changes, cuts, additions)
   - Patterns (e.g., "user consistently removes corporate jargon," "user always adds personal anecdotes," "user shortens introductions")
4. Stores this comparison in the learning database (see "Learning System" below)
5. Updates the user's voice/style profile based on accumulated patterns

**Output:** Locked, approved draft. Learning data saved. Production phase begins automatically.

**UI:** A clear "approved" state — the editor becomes read-only with a green "Approved" badge. Below it, the production phase outputs start generating, each in its own card/section.

---

### Stage 5: Image Prompts

**What the user does:** Reviews generated image prompts. Edits, regenerates, or approves each one.

**What the AI does:**
1. Reads the approved article
2. Identifies 3-5 key visual moments, themes, or metaphors in the article
3. Pulls from the image style library (see "Learning System") — previous prompts, approved styles, visual brand guidelines
4. Generates detailed image generation prompts for each moment, written for Midjourney / DALL-E / similar tools

**Each prompt includes:**
- The image description (detailed, specific)
- Style notes (photography vs. illustration, color palette, mood)
- Suggested aspect ratio
- Reference to which section of the article it maps to
- Consistency note referencing the user's established visual style

**Output:** 3-5 image prompts, each editable. A "Copy Prompt" button for each, for pasting into image generation tools.

**UI:** Card layout — one card per prompt. Each card shows the prompt text, a tag indicating which article section it relates to, and action buttons (edit, regenerate, copy). At the top of the section, show a "Style Reference" summary pulled from the image style library so the user can see what visual style the AI is targeting.

**Image Style Library (grows over time):**
- After the user generates images from these prompts, they can upload the results back into the app
- The app stores prompt + result pairs
- Future prompts reference these as style examples
- This creates visual brand consistency across articles

---

### Stage 6: LinkedIn Post

**What the user does:** Reviews 2-3 LinkedIn post variants. Picks one, edits it, copies it.

**What the AI does:**
1. Reads the approved article
2. Generates 2-3 distinct LinkedIn post variants, each with a different strategy:
   - **Hook-first:** Opens with a provocative statement or question to stop the scroll
   - **Story-first:** Opens with a personal anecdote or observation that leads into the article's thesis
   - **Hot take:** Opens with a contrarian or surprising position
3. Each post includes a call-to-action linking to the published article
4. Post length: 150-300 words (LinkedIn optimal range)

**Output:** 2-3 LinkedIn post variants, each editable.

**UI:** Side-by-side or stacked cards, one per variant. Each labeled with its strategy (Hook, Story, Hot Take). Character/word count on each. "Copy" button. Ability to edit inline before copying.

---

### Stage 7: Instagram Carousel

**What the user does:** Reviews the generated carousel. Edits text on individual slides. Reviews image prompts for each slide. Copies or exports.

**What the AI does:**
1. Reads the approved article
2. Extracts 5-8 key takeaways, insights, or quotable moments
3. Formats each as a carousel slide:
   - **Slide 1:** Title/hook slide — attention-grabbing headline
   - **Slides 2-7:** One key point per slide, written as short, punchy text (max 30 words per slide)
   - **Final slide:** CTA slide — "Read the full article" or "Follow for more"
4. For each slide, generates an image prompt for a background/visual that works with text overlaid on top:
   - Specifies that the image should have areas of low visual complexity (dark regions, gradients, blurred sections) where text can sit
   - Includes color palette notes that ensure text contrast/readability
   - References the image style library for brand consistency
5. Generates an Instagram caption (with relevant hashtags)

**Output:**
- 5-8 slide text blocks
- 5-8 corresponding image prompts (designed for text overlay)
- 1 Instagram caption with hashtags

**UI:** Horizontal scrollable carousel preview — shows each slide as a card in sequence. Each card has:
- The slide text (editable)
- The image prompt (expandable, editable, copyable)
- Slide number
Above the carousel: the Instagram caption (editable). A "Copy All" button that copies all slide texts and prompts in a structured format.

---

## Learning System

This is what makes the app get smarter over time. Three data stores that grow with usage:

### 1. Voice/Style Profile

**What it stores:**
- Base voice guide (written once, updated periodically) — tone, vocabulary, sentence structure, what to avoid
- Accumulated patterns from Stage 4 diffs (e.g., "always cuts jargon," "prefers short paragraphs," "adds personal stories")
- Example passages — before/after pairs showing first draft vs. approved version

**How it's used:** Injected into the system prompt at Stage 2 (first draft generation) and Stage 3 (AI-assisted edits). The more articles produced, the better the first drafts become.

**How it updates:** Automatically after each Stage 4 approval. The user can also manually edit the voice guide at any time from a settings/profile page.

### 2. Article Archive

**What it stores:**
- Every approved article (outline + first draft + final draft)
- The diff/lessons-learned summary from each Stage 4 approval
- Metadata: date, topic, audience, tone

**How it's used:**
- Stage 2 references recent approved articles as style examples
- Stage 4 comparison uses historical patterns to identify new learnings
- Future: could power a "content calendar" view

### 3. Image Style Library

**What it stores:**
- Every image prompt generated (Stage 5 and Stage 7)
- User ratings or approvals of prompts (which ones they actually used)
- Uploaded generated images (prompt + result pairs) — optional but valuable
- Visual brand notes: preferred color palettes, photography vs. illustration, mood descriptors

**How it's used:**
- Stage 5 and Stage 7 reference this library when generating new prompts
- Creates visual consistency across articles without the user having to re-specify their style every time

**How it updates:** Automatically saves prompts after each production run. User can upload generated images and mark prompts as "approved style" or "don't use this style again."

---

## Data Model (Simplified)

```
Project (one per article)
├── id
├── created_at
├── status: draft | in_review | approved | produced
├── metadata
│   ├── working_title
│   ├── target_audience
│   ├── tone
│   └── reference_links
├── outline (Stage 1 input)
├── first_draft (Stage 2 output)
├── versions[] (Stage 3 edit history)
├── final_draft (Stage 4 approved)
├── diff_summary (Stage 4 learning output)
├── image_prompts[] (Stage 5)
├── linkedin_variants[] (Stage 6)
└── instagram_carousel
    ├── slides[]
    │   ├── text
    │   └── image_prompt
    └── caption

User Profile
├── voice_style_guide (text, markdown)
├── learned_patterns[] (from Stage 4 diffs)
├── image_style_library[]
│   ├── prompt
│   ├── result_image_url (optional)
│   ├── approved: boolean
│   └── tags[]
└── article_archive[]
    └── → references Project
```

---

## Technical Notes for Implementation

### AI Integration
- Each AI-powered stage is a separate API call to Claude (or equivalent)
- System prompts are assembled dynamically: base instructions + voice profile + relevant learning data + stage-specific instructions
- The rich text editor needs to support inline AI operations (highlight → comment → AI revises → accept/reject)
- All AI outputs should be regeneratable independently (e.g., regenerate just LinkedIn without re-running images)

### Storage
- Projects and user profiles need persistent storage
- Version history for drafts (every save creates a version)
- Image style library needs to support image uploads eventually (can start as text-only prompts)

### Key UX Principles
- The creative phase should feel like a writing tool, not a chatbot
- The production phase should feel like a dashboard — all outputs visible at once
- Never auto-advance stages — the user always clicks to proceed
- Every AI output is editable before the user takes action on it
- The learning system is invisible to the user during normal use (no "learning in progress" popups) — it just quietly makes first drafts better over time

---

## What's NOT in This Version (Future Roadmap)

- Direct publishing to LinkedIn / Instagram (requires OAuth integrations)
- Agent-to-agent handoff (OpenClaw backend with dedicated ghostwriter + producer agents)
- Multi-user / team support (for Inimon clients)
- Content calendar / scheduling view
- Analytics integration (which posts performed best)
- Newsletter / email variant generation
- Twitter/X thread generation
- Audio / podcast script variant
- SEO optimization suggestions
- Collaboration features (editor + client review mode)

---

## How to Validate This Blueprint

Before building the full app, test the workflow manually:

1. Write an outline for your next blog post
2. Walk through each stage using this document as a checklist
3. Note where the stages feel right and where they feel clunky
4. Pay special attention to Stage 3 — is the manual edit + AI assist combo actually how you want to work, or do you prefer one mode over the other?
5. After one full cycle, update this blueprint with what you learned

Then hand the validated blueprint to Cowork for the Tier 1 prototype build.
