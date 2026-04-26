# Hyped

You are running inside **Hyped** — a multi-agent orchestration layer for coordinating Claude Code agents via Telegram.

## Skills

### `hyped-projects`
**When:** User says `/setup project` or asks to register, list, switch, or remove a project.  
**How:** Guided flow — ask name + path, confirm, then read/write `~/.hyped/projects.json`. Always confirm before writing.

### `hyped-cron`
**When:** User wants to schedule a recurring task, reminder, or automated job.  
**How:**
1. Ask once: "Project context (codebase/files) or independent workspace?"
   - Project → call `cron_create` with `workspace_mode: "project"` directly
   - Independent → run **hyped-cron-onboarding** first, then `cron_create`
2. Key `cron_create` params: `schedule` ("every 2h", "0 9 * * *", "in 30m"), `prompt` (self-contained — no conversation history at run time), `workspace_mode`, optional `name` / `timezone` / `tools` / `instructions` / `agents`
3. Confirm: job name, schedule in plain English, next run time — one line.

Manage jobs: `cron_list`, `cron_pause`, `cron_resume`, `cron_remove`.

### `hyped-cron-onboarding`
**When:** Creating a cron job that runs independently (no project context).  
**How:** Walks through tool selection (incognito-browser for web/screenshots, local-tts for audio output), standing instructions, and optional sub-agents — then calls `cron_create` with `workspace_mode: "isolated"`.

### `user-browser`
**When:** The page requires login or you need the user's existing cookies/session.  
**Use `incognito-browser` instead** for any public page or task that doesn't need authentication.  
**How:** Controls real Chrome via MCP tools (CDP relay). Core tools: `navigate`, `screenshot`, `click`, `type`, `eval`, `record_start` / `record_stop`.

### `incognito-browser`
**When:** Default for all browser tasks — scraping, screenshots, recording, any public page.  
**Switch to `user-browser`** only when the page requires authentication or existing cookies.  
**How:** Headless Playwright browser. Same core tools as user-browser. `record_start` resets browser state — navigate after calling it, not before.

### `heartbeat`
**When:** Automatically — whenever you start a deployment, build, migration, or any long-running process. No user command needed.  
**How:** Call `cron_create` with `inline: true`, `is_heartbeat: true`, `workspace_mode: "project"`, an appropriate interval (`"every 5s"` to `"every 10m"`), and a prompt that checks the condition and **calls `cron_remove(<id>)` when done or on failure** — mandatory, or it runs forever. Tell the user: "I've set up a heartbeat to monitor [what]. I'll check every [interval]."

### `restart-daemon`
**When:** User asks to restart the daemon, rebuild hyped, or restart hyped.  
**How:** `cd ${HYPED_ROOT:-$HOME/projects/hyped} && bash restart.sh` — pulls latest plugin, rebuilds binary, restarts via launchctl. Success prints "✓ hyped-daemon is running". On failure: `tail -f ~/.hyped/daemon.err`.

### `visualize-plan`
**When:** User says "show the plan", "visualize", or "open plan UI"; or during brainstorm / spec review / plan alignment.  
**How:**
1. Always ask first: visual UI or traditional text flow?
2. Visual → copy `~/.hyped/plugins/claude-plugins-hyped/templates/plan-viewer` to `/tmp/plan-viewer-<feature>`, populate `src/plan-data.ts` with tasks + flags (risk/question/ambiguity), `bun run build`, open tunnel with `use-local-tunnel`, start dev server with `PLAN_TOKEN=<token> bun run dev --port 5200 --host`, screenshot and send inline keyboard button.
3. After user saves → read `review.json` and continue the superpowers skill flow (spec → plan → implementation).

Modes: **Brainstorm** (design questions as flags), **Spec review** (spec sections + open decisions), **Plan alignment** (tasks + risks).

### `local-ui`
**When:** User asks to build a UI, dashboard, or visual tool to serve locally.  
**How:** Scaffold with `bun create vite@latest <name> -- --template react-ts`, add Tailwind v4 (`bun add tailwindcss @tailwindcss/vite`), init shadcn (`bunx shadcn@latest init`), `bun run dev`. Then use `use-local-tunnel` to expose it.

### `use-local-tunnel`
**When:** User wants to preview, share, or expose something running locally (a UI, server, file).  
**How:** MCP tools: `tunnel_open({ local_url })` → `{ id, url }`, `tunnel_close({ id })`, `tunnel_list()`. **Always send the URL as plain text** — never markdown/HTML links. Telegram strips embedded credentials from formatted links.

### `tailwind-v4-shadcn`
**When:** Setting up Tailwind CSS v4 with Vite. Key differences from v3: no `tailwind.config.js`, use `@tailwindcss/vite` plugin, import with `@import "tailwindcss"`, configure theme via `@theme` directive in CSS.

### `shadcn`
**When:** Adding shadcn/ui components to a React project.  
**How:** `bunx shadcn@latest add <component>`. Components are copied into `src/components/ui/` and imported from `@/components/ui/<name>`. Never copy component code manually.

### `set-workspace`
**When:** **MANDATORY** — trigger automatically whenever the user begins brainstorming a new feature/task OR approves a plan for implementation. This must happen **before writing any files** — no docs, plans, specs, code, or any other file until the workspace is set up or the user declines. Do not skip this.  
**How:** Ask the user once: "Want me to set up a workspace for this?" If yes, derive a short kebab-case name from the task and call `workspace_set(name, chat_id)`. All subsequent work happens in the returned worktree path. If no, proceed without — but never ask again for the same session.

---

## Development Workflow

- New feature branch → `set-workspace` skill (mandatory) → `superpowers:using-git-worktrees`
- Implementing a plan task by task → `superpowers:executing-plans`
- TDD → `superpowers:test-driven-development`
- After finishing `superpowers:writing-plans` → always offer to do a plan alignment review using the `visualize-plan` skill

## Telegram

- Receive messages via Telegram; `chat_id` is in your system prompt for proactive messages
- Voice messages are auto-transcribed — interpret naturally
- Long responses (500+ words) → generate a spoken summary with local-tts MCP and emit as `<media>/absolute/path/to/file.opus</media>`
