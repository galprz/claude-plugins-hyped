---
name: hyped-cron
description: Use when the user asks to schedule a recurring task, set a reminder, or automate something on a timer
---

# hyped-cron — Schedule Recurring Tasks

## When to Trigger

- "remind me to X every day at Y"
- "schedule X every N hours"
- "run X automatically every morning"
- "set up a daily/weekly/one-time task"
- "change the schedule of X job"
- "update the prompt/instructions of X job"
- "delete/remove X job"

## How to create a job

**Step 1 — determine workspace mode** — ask once:
"Should this run inside a project (codebase, git, files), or independently in its own workspace?"

- Job relates to a codebase or project files → `workspace_mode: "project"`, call `cron_create` directly
- Job is independent (web research, reminders, news briefs) → use the **hyped-cron-onboarding skill** first

**Step 2 — check for timezone** — inspect the schedule the user gave you:

- If the schedule fires at a **specific time of day** (e.g. "every day at 8 AM", "weekdays at 9am", a cron expr like "0 8 * * *") → ask: "What timezone are you in? (e.g. America/New_York, Europe/London, Asia/Tokyo)"
- If the schedule is an interval (e.g. "every 2h", "every 30m") → no timezone needed, proceed directly

**Step 3 — ask about inline mode** — ask once:
"Should this job run inside your current chat session, or in a fresh standalone session each time?"

- **Inline** (`inline: true`): the job runs inside this chat's live Claude Code session. It shares your conversation history, can see recent context, and feels like a natural continuation of the chat. Best for jobs that follow up on ongoing work (e.g. "check if that PR was reviewed", "summarize what you did today").
- **Standalone** (`inline: false`, default): the job gets a brand-new isolated session each time. No memory of previous runs or this chat. Best for independent recurring tasks (e.g. morning briefings, automated checks).

**Step 4 — call `cron_create`:**

| param | value |
|-------|-------|
| `schedule` | `"every 2h"`, `"0 9 * * *"`, `"in 30m"` |
| `prompt` | Self-contained — no conversation history when it runs |
| `name` | Optional short display name |
| `timezone` | **Required for time-of-day schedules.** IANA format e.g. `"America/New_York"` |
| `workspace_mode` | `"project"` or `"isolated"` |
| `inline` | `true` or `false` (default) — see Step 2 |
| `tools` | `["user-browser"]`, `["local-tts"]`, or `[]` — isolated only |
| `instructions` | Standing instructions — isolated only |
| `agents` | Sub-agents array `[{name, instructions}]` — isolated only |

Do NOT pass `chat_id` or `working_dir` — captured automatically.

## Manage existing jobs

- List: `cron_list`
- Pause: `cron_pause` with `id`
- Resume: `cron_resume` with `id`
- Delete: `cron_remove` with `id`

IDs shown in `cron_list` output.

## Edit a job (schedule or prompt)

**⚠️ NEVER edit `jobs.json` directly to change a schedule.** The daemon overwrites the file on every tick — direct edits race and get lost within 60 seconds.

### Changing the schedule → delete + recreate

1. Call `cron_list` to get the job's current prompt, instructions, tools, and workspace_mode
2. Call `cron_remove` with the job ID
3. Call `cron_create` with the same prompt/instructions/tools but the new schedule

This is the only reliable way to change a schedule.

### Changing only the prompt or instructions (not schedule)

There is no `cron_update` tool. For prompt/instruction-only changes, edit the workspace files directly — the daemon reads these fresh each run, not from jobs.json:

**Isolated jobs** — edit the workspace CLAUDE.md:
```
{job_working_dir}/CLAUDE.md   (path is in job's job_working_dir field from cron_list)
```

**Project jobs** — edit the prompt in `~/.hyped/cron/jobs.json`. For prompt-only edits the race window is acceptable since the daemon only uses the prompt at run time, not on every tick.

## Trigger a job manually

To run a job immediately without waiting for its schedule:

```bash
curl -s -X POST http://127.0.0.1:7891/api/cron/jobs/<id>/run
```

Get the `<id>` from `cron_list` or `~/.hyped/cron/jobs.json`.

## Confirm to user

Job name, schedule in plain English, next run time in their local timezone. One line.
