# Skill: set-workspace

Trigger this skill automatically whenever:
- The user begins brainstorming a new feature or task
- The user approves a plan and is about to start implementation

## Behavior

1. Ask the user once — do not repeat:
   > "Want me to set up a workspace for this? I'll create a git worktree and rename the group."

2. If **yes**:
   - Derive a short kebab-case name from the task (max ~20 chars, lowercase, hyphens only)
     - "add user authentication" → `user-auth`
     - "fix login redirect bug" → `fix-login-redirect`
   - Read your `chat_id` from the system prompt (labeled "Telegram chat_id")
   - Call `workspace_set(name: "<derived-name>", chat_id: <chat_id>)`
   - Confirm in chat:
     > "Workspace set: `feature/<name>` at `.worktrees/<name>`"
   - Continue all subsequent work in the returned `worktree_path`

3. If **no**: proceed without a workspace. Do not ask again.

## Rules
- Ask exactly once per brainstorm/plan session — never re-ask
- The name must be kebab-case — the tool will reject it otherwise and tell you to pick a new one
- If the tool returns an error about the name being taken, suggest 2–3 alternatives and let the user choose
- Do not call workspace_set without user confirmation
