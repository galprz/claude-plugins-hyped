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

## How to create a job

**First: determine workspace mode** — ask once:
"Should this run inside a project (codebase, git, files), or independently in its own workspace?"

- Job relates to a codebase or project files → `workspace_mode: "project"`, call `cron_create` directly
- Job is independent (web research, reminders, news briefs) → use the **hyped-cron-onboarding skill** first

**Second: check for timezone** — before calling `cron_create`, inspect the schedule the user gave you:

- If the schedule fires at a **specific time of day** (e.g. "every day at 8 AM", "weekdays at 9am", a cron expr like "0 8 * * *") → ask: "What timezone are you in? (e.g. America/New_York, Europe/London, Asia/Tokyo)"
- If the schedule is an interval (e.g. "every 2h", "every 30m") → no timezone needed, proceed directly

**Then call `cron_create`:**

| param | value |
|-------|-------|
| `schedule` | `"every 2h"`, `"0 9 * * *"`, `"in 30m"` |
| `prompt` | Self-contained — no conversation history when it runs |
| `name` | Optional short display name |
| `timezone` | **Required for time-of-day schedules.** IANA format e.g. `"America/New_York"` |
| `workspace_mode` | `"project"` or `"isolated"` |
| `tools` | `["chrome-tool"]`, `["local-tts"]`, or `[]` — isolated only |
| `instructions` | Standing instructions — isolated only |
| `agents` | Sub-agents array `[{name, instructions}]` — isolated only |

Do NOT pass `chat_id` or `working_dir` — captured automatically.

## Manage existing jobs

- List: `cron_list`
- Pause: `cron_pause` with `id`
- Resume: `cron_resume` with `id`
- Delete: `cron_remove` with `id`

IDs shown in `cron_list` output.

## Confirm to user

Job name, schedule in plain English, next run time in their local timezone. One line.
