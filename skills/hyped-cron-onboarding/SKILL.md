---
name: hyped-cron-onboarding
description: Use when creating a new isolated cron job — guides the user through workspace setup before calling cron_create
---

# Cron Job Onboarding

Guides the user through creating an isolated cron workspace with the right
tools, skills, and instructions before calling `cron_create`.

## Step 1 — Determine workspace mode

Ask once: "Does this job need access to a specific project (codebase,
git, files), or should it run independently in its own clean workspace?"

- **Project context** → call `cron_create` with `workspace_mode: "project"`, stop here
- **Independent** → continue to Step 2

## Step 2 — Determine tools

Ask: "Does it need to browse the web or take screenshots?"
- **Yes, public page (no login needed)** → `"incognito-browser"` — headless, clean session, no cookies
- **Yes, requires login or user's existing cookies/session** → `"user-browser"` — uses real Chrome with user's auth

Ask: "Should results be delivered as audio?" → `"local-tts"`
No browser, no audio → empty tools list (Claude's built-in tools only)

Available tools:
| Tool | What it enables |
|------|----------------|
| `incognito-browser` | Browse public pages, screenshot, scrape, record — **use by default** |
| `user-browser` | Browse with user's real Chrome session + cookies — **only when auth is required** |
| `local-tts` | Generate speech from text |

## Step 3 — Gather standing instructions

Ask: "Any standing instructions for every run?
(e.g. 'focus on X', 'skip Y', 'always bullet points')"

Capture verbatim as `instructions`. Empty string if none.

## Step 4 — Optionally define a sub-agent

If the job is complex (e.g. "research 5 sources then synthesise"), ask:
"Should I set up a specialized sub-agent for this job?"

If yes, gather:
- Agent name (e.g. `researcher`)
- Agent persona/instructions

Pass as `agents: [{ name, instructions }]` to `cron_create`.
If no → omit `agents`.

## Step 5 — Call cron_create

```
cron_create({
  schedule:       "<schedule string>",
  prompt:         "<self-contained task — no conversation history available>",
  name:           "<short display name>",
  timezone:       "<IANA timezone if user said local time>",
  workspace_mode: "isolated",
  tools:          ["incognito-browser"],   // or ["user-browser"] if auth needed, or [] if none
  instructions:   "Focus on AI...",  // or ""
  agents: [                          // optional
    { name: "researcher", instructions: "You are a research specialist..." }
  ]
})
```

## Step 6 — Confirm

One line: job name, schedule in plain English, tools available.
Example: `✅ "HN Summary" created — fires daily at 9am with web access.`

---

## Workspace files created (reference)

The `cron_create` tool scaffolds this structure automatically:

```
~/.hyped/cron/jobs/{id}/
  CLAUDE.md                          ← job context + instructions, loaded every run
  .mcp.json                          ← scoped MCP servers (absolute paths)
  .claude/
    settings.local.json              ← auto-approve permissions (bypassPermissions)
    skills/
      job-context/
        SKILL.md                     ← standing instructions as Claude Code skill
    agents/
      {agent-name}.md                ← sub-agents if requested
```

### File formats

**`CLAUDE.md`** — plain markdown, no frontmatter:
```markdown
# Cron Job: {name}
You are running as a scheduled cron job. No conversation history is available.
**Schedule:** every 1d
## Instructions
{user instructions}
## Output
Deliver your response directly. If nothing to report, respond with [SILENT].
```

**`skills/{name}/SKILL.md`** — YAML frontmatter required:
```markdown
---
name: job-context
description: Use when running this scheduled job to recall its purpose and standing instructions
---
# Job Context: {name}
...
```

**`agents/{name}.md`** — YAML frontmatter required:
```markdown
---
name: researcher
description: Use this agent when deep research is needed
model: inherit
---
You are a research specialist...
```

**`.mcp.json`** — standard MCP format with absolute paths:
```json
{
  "mcpServers": {
    "incognito-browser": {
      "command": "bun",
      "args": ["run", "--cwd", "/absolute/path/to/mcp/incognito-browser", "--silent", "start"]
    }
    // use "user-browser" instead only if the job requires auth/cookies
  }
}
```

**`.claude/settings.local.json`** — permissions:
```json
{
  "permissions": {
    "allow": ["*"],
    "defaultMode": "bypassPermissions"
  }
}
```
