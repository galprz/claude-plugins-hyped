# Skill: set-workspace

**This skill has the highest priority — it runs BEFORE all other skills, including `superpowers:brainstorming`, `superpowers:writing-plans`, and any exploration or planning.**

Trigger this skill **the moment you understand the user's intent** — what they want to build, fix, or change. Do not brainstorm, explore code, or invoke any other skill until the workspace is created. Every new task gets its own workspace.

## Steps — execute ALL of these NOW before doing anything else

### 1. Derive a name
Short kebab-case name from the task (max ~20 chars, lowercase, hyphens only):
- "add user authentication" → `user-auth`
- "fix login redirect bug" → `fix-login-redirect`
- "dark mode for plan viewer" → `plan-viewer-dark-mode`

### 2. Create the worktree
Use the built-in `EnterWorktree` tool to create an isolated git worktree:

```
EnterWorktree(name: "<derived-name>")
```

This creates a worktree and switches into it. All subsequent work happens there.

### 3. Rename the Telegram group
Get `chat_id` from your system prompt (labeled `"chat_id"` or `"Telegram chat_id"`). Then call the MCP tool:

```
set_group_name(name: "<derived-name>", chat_id: <chat_id>)
```

- If this succeeds, the Telegram group title now reflects the feature.
- If this fails (e.g. no bot token, not a group chat), **continue anyway** — the worktree is already created. Just warn the user that the group rename failed and include the error.

### 4. Confirm
Tell the user:
> Workspace ready: `<derived-name>`

Then — and only then — proceed with brainstorming, planning, or whatever comes next.

## Rules
- Do not ask for permission — just create the workspace as soon as intent is clear
- Never work on `main` directly
- Name must be kebab-case
- One workspace per task, always
- Group rename failure is non-blocking — the worktree is what matters
