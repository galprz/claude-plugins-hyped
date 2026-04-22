# Skill: visualize-plan

Use this skill when the user asks to "show the plan", "visualize the plan", "open plan UI", or when `writing-plans` finishes and the user wants an alignment review before implementation starts.

## Full Flow

### 1. Identify the plan file
Read the plan markdown file. If unclear which file, ask the user.

### 2. Set up the project directory

```bash
FEATURE=local-tunnel  # kebab-case from plan title
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

Skip anything routine (e.g. "Task 1 writes tests" — not worth narrating).

Call `local-tts` MCP:
```
text_to_speech(text="<summary>")
```

Copy the returned `.opus` file:
```bash
cp /path/to/returned.opus /tmp/plan-viewer-${FEATURE}/public/walkthrough.opus
```

### 4. Populate src/plan-data.ts

Read the plan markdown and write `src/plan-data.ts`:
- Extract tasks from `### Task N:` headings
- Extract steps from `- [ ]` / `- [x]` checkboxes under each task
- Annotate risks, open questions, and ambiguities as flags
- For `question` flags, generate 2–3 concise `suggestions` strings where choices are clear-cut
- Do NOT include task status — this viewer is for alignment, not execution tracking

```ts
import type { PlanData } from './types'

export const PLAN: PlanData = {
  title: 'Feature Name',
  goal: 'One sentence goal.',
  tasks: [
    {
      id: '1',
      title: 'Task Title',
      steps: [
        { label: 'Step description' },
        { label: 'Step with code', code: 'const x = 1' },
      ],
      flags: [
        { type: 'risk', text: 'Risk description' },
        {
          type: 'question',
          text: 'Open question?',
          suggestions: ['Option A', 'Option B', 'Option C'],
        },
      ],
    },
  ],
}
```

Modify `App.tsx` or other components freely if the plan structure needs a non-standard layout.

### 5. Build validation

```bash
cd /tmp/plan-viewer-${FEATURE}
bun run build
```

On failure: read the error, fix it, retry (max 3 attempts).

### 6. Start the dev server

Find a free port first:
```bash
lsof -i :5200 | grep LISTEN || echo "5200 is free"
```

Then start:
```bash
cd /tmp/plan-viewer-${FEATURE}
bun run dev --port 5200 --host &
```

### 7. Open a tunnel

Use the `local-tunnel` MCP `tunnel_open` tool to expose `http://localhost:5200`.

The tunnel returns a URL in the form `https://hyped:<token>@<host>.ngrok-free.app`.

Extract the token from the URL and build the final URL with both params:
```
https://hyped:<token>@<host>.ngrok-free.app?chat_id=<TELEGRAM_CHAT_ID>&_token=<token>
```

The TELEGRAM_CHAT_ID is the chat_id for the current Telegram conversation (available in your system context).

**Why `_token`:** Mobile browsers block `fetch()` calls from pages loaded with `user:pass@host` URL credentials — relative URLs inherit the credentials and Chrome rejects them. The `_token` param lets the JS read the ngrok password and include it as an `Authorization` header in API calls.

### 8. Screenshot and send

Use `chrome-tool` to navigate to and screenshot the tunnel URL (include both `?chat_id=` and `&_token=`).

Send the screenshot + tunnel URL to the user over Telegram.

## Rules

- Always `--host` with `bun run dev` — required for ngrok to reach it
- Always `bun install --no-summary`
- `src/plan-data.ts` is the primary file — touch nothing else unless the plan demands it
- Generate `suggestions` only for `question` flags where choices are genuinely clear-cut (2–3 max)
- Always append both `?chat_id=<ID>&_token=<token>` to the tunnel URL — omitting `_token` breaks Save on mobile
- After the user saves their review, you will receive a message in this chat to read the feedback file at `/tmp/plan-viewer-${FEATURE}/review.json`

## References

- `local-ui` skill — Vite + React + Tailwind v4 stack reference
- `use-local-tunnel` skill — tunnel orchestration
- `chrome-tool` skill — browser screenshot
- `local-tts` MCP — `text_to_speech(text)` → absolute path to `.opus` file
