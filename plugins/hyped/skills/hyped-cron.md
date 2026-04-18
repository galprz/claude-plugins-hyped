# hyped-cron — Schedule Recurring Tasks

Use this skill when the user asks to schedule a recurring task, set a reminder, or automate something on a timer.

## When to Trigger

- "remind me to X every day at Y"
- "schedule X every N hours"
- "run X automatically every morning"
- "set up a daily/weekly/one-time task"

## How to create a job

Call the `cron_create` MCP tool. Provide:
- `schedule` — converted from natural language:
  - `"every 2h"` / `"every 30m"` / `"every 1d"`
  - `"0 9 * * *"` (5-field cron, minute hour dom month dow)
  - `"in 30m"` / `"in 2h"` (one-shot from now)
- `prompt` — self-contained instruction (no conversation history when it runs)
- `name` — optional short display name
- `timezone` — optional IANA e.g. `"America/New_York"` (when user says a local time)

Do NOT pass chat_id or working_dir — captured automatically from session context.

| User says | schedule value |
|-----------|---------------|
| "every day at 2pm" | `"0 14 * * *"` |
| "every 2 hours" | `"every 2h"` |
| "weekdays at 9am ET" | `"0 9 * * 1-5"` + `timezone: "America/New_York"` |
| "once in 30 minutes" | `"in 30m"` |

## How to manage jobs

- List: call `cron_list`
- Pause: call `cron_pause` with `id`
- Resume: call `cron_resume` with `id`
- Delete: call `cron_remove` with `id`

IDs are shown in `cron_list` output.

## Confirm to the user

Reply with: job name, schedule in plain English, next run time. Keep it short.
