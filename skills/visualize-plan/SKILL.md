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

### 6. Start the dev server

```bash
lsof -i :5200 | grep LISTEN || echo "5200 is free"
cd /tmp/plan-viewer-${FEATURE}
bun run dev --port 5200 --host &
sleep 2
```

### 7. Open a tunnel

Use the `local-tunnel` MCP `tunnel_open` tool to expose `http://localhost:5200`.

The tunnel returns `{ url, token }` where `url` is a clean `https://<host>.ngrok-free.app` (no credentials).

Build the final URL:
```
https://<host>.ngrok-free.app?chat_id=<TELEGRAM_CHAT_ID>&_token=<token>
```

**Why `_token`:** Protects the `/save-feedback` and `/notify` Vite API endpoints from unauthorized POSTs. The plan page itself is publicly accessible via the obscure ngrok URL.

### 8. Screenshot and send

Navigate to the URL with `chrome-tool` and take a screenshot.

Send the screenshot to the user, then send the clean URL as plain text — Telegram auto-linkifies standard HTTPS URLs:

```
https://<host>.ngrok-free.app?chat_id=<ID>&_token=<token>
```

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
- Always append both `?chat_id=<ID>&_token=<token>` to the tunnel URL — omitting `_token` breaks Save on mobile
- The visual UI is a presentation layer — never skip the analysis steps of the underlying superpowers skill
- Always ask visual vs traditional preference before starting (Step 0)

## References

- `superpowers:brainstorming` — drives content for Mode A
- `superpowers:writing-plans` — drives content for Mode B/C
- `local-ui` skill — Vite + React + Tailwind v4 stack reference
- `local-tts` MCP — `text_to_speech(text)` → absolute path to `.opus` file
