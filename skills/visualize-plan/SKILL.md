# Skill: visualize-plan

Use this skill when:
- Starting a **brainstorm** (replaces or augments `superpowers:brainstorming`)
- Doing a **spec review** (after writing the spec, before writing the plan)
- Doing a **plan alignment review** (after `writing-plans`, before implementation)
- The user says "show the plan", "visualize", "open plan UI", or asks for visual flow

---

## Step 0: Always ask first

**Before doing anything**, ask the user:

> "Would you like a **visual UI** (opens in browser, suggestion chips, save → notify flow) or the **traditional text-based** flow?"

- If **traditional** → stop this skill and proceed with the appropriate superpowers skill (`brainstorming`, `writing-plans`, etc.) as normal.
- If **visual** → continue below. The visual flow is a UI layer on top — **the analysis and logic of the relevant superpowers skill still fully applies**.

---

## Modes

### Mode A — Brainstorm
The superpowers `brainstorming` skill drives the content:
- Explore project context first (as brainstorming requires)
- Identify the key design decisions, open questions, trade-offs, and risks
- Propose 2–3 approaches with reasoning (do this in text first, get direction from user)
- Then render the remaining clarifying questions and design decisions as flags in the visual UI

The visual UI replaces the back-and-forth Q&A for clarifying questions — NOT the upfront analysis.

### Mode B — Spec Review
After the spec is written:
- Map each major spec section to a task
- Flag open decisions, constraints, and ambiguities as `question` / `ambiguity` flags
- Flag known risks as `risk` flags
- User reviews and annotates in the browser

### Mode C — Plan Alignment (original use case)
After the implementation plan is written:
- Extract tasks from `### Task N:` headings
- Extract steps from `- [ ]` / `- [x]` checkboxes
- Annotate risks, questions, and ambiguities as flags
- Do NOT include task status — this is alignment, not execution tracking

---

## Execution Flow (all modes)

### 1. Prepare content
Run the relevant superpowers skill logic first (explore context, draft analysis, identify risks/questions). Do this in-context before building the UI.

For Mode A: complete the brainstorming analysis steps up to the point where you'd ask clarifying questions. Those questions become the flags.

### 2. Set up the project directory

```bash
FEATURE=<kebab-case-feature-name>
PLUGIN_ROOT=~/.hyped/plugins/claude-plugins-hyped
cp -r ${PLUGIN_ROOT}/templates/plan-viewer /tmp/plan-viewer-${FEATURE}
cd /tmp/plan-viewer-${FEATURE}
bun install --no-summary
```

### 3. Generate audio walkthrough

Write a 2–4 sentence summary covering **only**:
- Non-obvious architectural decisions
- Risks and known unknowns
- Ambiguities that require user judgment

Skip anything routine.

Call `local-tts` MCP: `text_to_speech(text="<summary>")`

```bash
cp /path/to/returned.opus /tmp/plan-viewer-${FEATURE}/public/walkthrough.opus
# Convert to M4A for Safari/iOS compatibility (Opus alone doesn't play on iOS)
ffmpeg -i /tmp/plan-viewer-${FEATURE}/public/walkthrough.opus \
  -c:a aac -b:a 128k /tmp/plan-viewer-${FEATURE}/public/walkthrough.m4a -y
```

### 4. Populate src/plan-data.ts

Map content to the `PlanData` structure:

```ts
import type { PlanData } from './types'

export const PLAN: PlanData = {
  title: 'Feature or Topic Name',
  goal: 'One sentence describing the purpose of this review.',
  tasks: [
    {
      id: '1',
      title: 'Section or Decision Area',
      steps: [
        { label: 'Context or step description' },
      ],
      flags: [
        { type: 'risk', text: 'Known risk or concern.' },
        {
          type: 'question',
          text: 'Open decision to make?',
          suggestions: ['Option A', 'Option B', 'Option C'],
        },
        { type: 'ambiguity', text: 'Something that could be interpreted two ways.' },
      ],
    },
  ],
}
```

**Mode mapping:**
- Brainstorm → tasks = design areas (interaction model, data flow, etc.); flags = the design questions
- Spec → tasks = spec sections; flags = open decisions, risks, constraints
- Plan → tasks = implementation tasks; flags = risks, unknowns, questions

Generate `suggestions` only for `question` flags where choices are genuinely clear-cut (2–3 max).

### 5. Build validation

```bash
cd /tmp/plan-viewer-${FEATURE}
bun run build
```

On failure: read the error, fix it, retry (max 3 attempts).

### 6. Open a tunnel

Follow the **`use-local-tunnel` skill** to expose `http://localhost:5200`. The tunnel returns `{ id, url, status }` where `url` is `https://hyped:<token>@<host>.ngrok-free.app`.

Save the `id` (to close later) and extract `<token>` from the URL — you need it for `PLAN_TOKEN` in the next step.

Append `?chat_id=<TELEGRAM_CHAT_ID>&thread_id=<TELEGRAM_THREAD_ID>&_token=<token>` to the tunnel URL — double security (Basic Auth in URL + token in query param). `thread_id` is required so Telegram responses go back to the correct forum topic:
```
https://hyped:<token>@<host>.ngrok-free.app?chat_id=<TELEGRAM_CHAT_ID>&thread_id=<TELEGRAM_THREAD_ID>&_token=<token>
```

### 7. Start the dev server

```bash
lsof -i :5200 | grep LISTEN || echo "5200 is free"
cd /tmp/plan-viewer-${FEATURE}
PLAN_TOKEN=<token-from-step-6> bun run dev --port 5200 --host &
sleep 2
```

**`PLAN_TOKEN`** gates ALL requests to the dev server — the page itself and the API endpoints. Anyone without the matching token in the URL gets 401.

### 8. Screenshot and send

Navigate to `http://localhost:5200?_token=<token>` with `incognito-browser` (not the ngrok URL — ngrok shows a browser warning page that blocks the screenshot) and take a screenshot.

Then send the tunnel URL as a **separate plain text message** following the `use-local-tunnel` skill's sending rules — raw URL only, no markdown, no buttons. Append `?chat_id=<TELEGRAM_CHAT_ID>` to the URL before sending.

---

## After the user saves

You will receive a message in this chat:
> "Plan review saved. Check `<path>/review.json` for user responses..."

Read `review.json`, extract the user's answers, and **continue the superpowers skill flow**:
- **Brainstorm**: use answers to finalize the design, write the spec, invoke `writing-plans`
- **Spec review**: apply feedback, finalize spec, invoke `writing-plans`
- **Plan review**: apply feedback, begin implementation with `executing-plans`

---

## Rules

- Always `--host` with `bun run dev` — required for ngrok to reach it
- Always `bun install --no-summary`
- `src/plan-data.ts` is the only file to edit — touch nothing else unless layout demands it
- **Open the tunnel before starting the dev server** — you need the token to set `PLAN_TOKEN` env var
- Always pass `PLAN_TOKEN=<token>` when starting the dev server — omitting it leaves the server unprotected
- Follow the `use-local-tunnel` skill for all tunnel open/send/close steps
- Always append `?chat_id=<TELEGRAM_CHAT_ID>&_token=<token>` to the tunnel URL — Basic Auth in URL + `_token` param for double security
- Screenshot from `http://localhost:5200?_token=<token>` not the ngrok URL — ngrok shows a warning page in the browser
- The visual UI is a presentation layer — never skip the analysis steps of the underlying superpowers skill
- Always ask visual vs traditional preference before starting (Step 0)

## References

- `superpowers:brainstorming` — drives content for Mode A
- `superpowers:writing-plans` — drives content for Mode B/C
- `use-local-tunnel` skill — canonical tunnel open/send/close instructions
- `local-ui` skill — Vite + React + Tailwind v4 stack reference
- `local-tts` MCP — `text_to_speech(text)` → absolute path to `.opus` file
