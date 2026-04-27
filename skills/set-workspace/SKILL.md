# Skill: set-workspace

**This skill has the highest priority — it runs BEFORE all other skills, including `superpowers:brainstorming`, `superpowers:writing-plans`, and any exploration or planning.**

Trigger this skill **the moment you understand the user's intent** — what they want to build, fix, or change. Do not brainstorm, explore code, or invoke any other skill until the workspace is created. Every new task gets its own workspace.

## Steps — execute ALL of these NOW before doing anything else

### 1. Derive a name
Short kebab-case name from the task (max ~20 chars, lowercase, hyphens only):
- "add user authentication" → `user-auth`
- "fix login redirect bug" → `fix-login-redirect`
- "dark mode for plan viewer" → `plan-viewer-dark-mode`

### 2. Get chat_id
Find the `chat_id` value from your system prompt. It appears as `"chat_id"` or `"Telegram chat_id"` in the session context injected by the daemon. If you're running via Telegram, it's always present. If you cannot find it, use `0` as fallback (worktree will still be created but group won't be renamed).

### 3. Call the daemon — DO THIS NOW

Run this bash command immediately. Do not skip it. Do not defer it. This is the core of the skill:

```bash
curl -s -X POST http://localhost:7891/api/workspace \
  -H "Content-Type: application/json" \
  -d '{"chat_id": <chat_id>, "name": "<derived-name>"}'
```

This does two things in one call:
- Creates a git worktree at `.worktrees/<name>` on branch `feature/<name>`
- Renames the Telegram group to include the branch name

**Response (200):**
```json
{
  "worktree_path": "/path/to/repo/.worktrees/<name>",
  "branch": "feature/<name>",
  "title": "hyped [feature/<name>]"
}
```

### 4. Switch to the worktree
`cd` into the returned `worktree_path` — all subsequent work happens there.

### 5. Confirm
Tell the user:
> Workspace ready: `feature/<name>`

Then — and only then — proceed with brainstorming, planning, or whatever comes next.

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
- **Do NOT use `EnterWorktree` tool or `superpowers:using-git-worktrees`** — this skill replaces them
