# Skill: set-workspace

Trigger this skill **the moment you understand the user's intent** — what they want to build, fix, or change. Do not wait for brainstorming, planning, or approval. Every new task gets its own workspace.

## Behavior

1. Derive a short kebab-case name from the task (max ~20 chars, lowercase, hyphens only):
   - "add user authentication" → `user-auth`
   - "fix login redirect bug" → `fix-login-redirect`
   - "dark mode for plan viewer" → `plan-viewer-dark-mode`

2. Read your `chat_id` from the system prompt (labeled "Telegram chat_id").

3. Call the daemon API to create the worktree and rename the Telegram group:

```bash
curl -s -X POST http://localhost:7891/api/workspace \
  -H "Content-Type: application/json" \
  -d '{"chat_id": <chat_id>, "name": "<derived-name>"}'
```

**Response (200):**
```json
{
  "worktree_path": "/path/to/repo/.worktrees/<name>",
  "branch": "feature/<name>",
  "title": "hyped [feature/<name>]"
}
```

4. `cd` into the returned `worktree_path` — all subsequent work happens there.

5. Confirm in chat:
   > Workspace ready: `feature/<name>`

## Error handling

| Status | Meaning | Action |
|--------|---------|--------|
| 409 | Name already taken | Suggest 2–3 alternatives, let user choose |
| 503 | No Telegram bot token | Worktree still works, group rename skipped — warn user |
| 500 | Git or system error | Show the error message, ask user to check |

## Rules
- Do not ask for permission — just create the workspace as soon as intent is clear
- Never work on `main` directly
- Name must be kebab-case — the daemon rejects anything else
- One workspace per task, always
