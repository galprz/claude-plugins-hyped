# claude-plugins-hyped

Claude Code plugin for [Hyped](https://github.com/galprz/hyped) — provides skills, MCP servers, and UI templates used by the Hyped daemon.

---

## Installation

Hyped installs this plugin automatically when you run `restart.sh`. For manual installation:

```bash
git clone https://github.com/galprz/claude-plugins-hyped.git ~/.hyped/plugins/claude-plugins-hyped
```

The daemon passes `--plugin-dir ~/.hyped/plugins/claude-plugins-hyped` to every Claude Code session.

---

## Skills

Skills are loaded automatically by Claude Code via the plugin directory. They activate when Claude detects the task matches their description.

| Skill | Description |
|-------|-------------|
| `visualize-plan` | Opens an interactive plan/brainstorm viewer in the browser, served via ngrok tunnel with `_token` auth. Supports brainstorm, spec review, and plan alignment modes. |
| `restart-daemon` | Rebuilds and restarts the hyped-daemon via `restart.sh` |
| `hyped-cron` | Creates and manages scheduled cron jobs via the daemon API |
| `hyped-cron-onboarding` | First-time cron setup guide |
| `hyped-projects` | Register, list, and switch between projects |
| `local-ui` | Scaffold a local Vite + React + Tailwind v4 UI |
| `use-local-tunnel` | Open an ngrok tunnel via the local-tunnel MCP |
| `chrome-bridge` | Control Chrome via CDP for screenshots and automation |
| `shadcn` | Add shadcn/ui components |
| `tailwind-v4-shadcn` | Tailwind v4 + shadcn setup reference |

---

## MCP Servers

| Server | Description |
|--------|-------------|
| `local-tts` | Text-to-speech using Orpheus 3B (local, Apple Silicon) — returns `.opus` file path |
| `local-tunnel` | Open/close/list ngrok tunnels — returns `{ url, token }` |
| `chrome-tool` | Chrome DevTools Protocol bridge for browser automation |

---

## Writing a New Skill

1. Create `skills/<name>/SKILL.md` with frontmatter:

```markdown
---
name: my-skill
description: Use when the user asks to do X
---

# my-skill

## Instructions
...
```

2. The `description` field is how Claude Code decides when to load the skill — be specific.
3. Reference the `local-tts` or `local-tunnel` MCPs via their tool names (e.g., `mcp__plugin_hyped-plugin_local-tts__text_to_speech`).

---

## Templates

- `templates/plan-viewer/` — Vite + React UI for plan/brainstorm review. Protected by `PLAN_TOKEN` env var. Copy to `/tmp/plan-viewer-<feature>` and run with `PLAN_TOKEN=<token> bun run dev --port 5200 --host`.

---

## License

Apache 2.0 — see [LICENSE](LICENSE).