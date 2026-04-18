# hyped-cron — Schedule Recurring Tasks

Use this skill when the user asks to schedule a recurring task, set a reminder, or automate something on a timer.

## When to Trigger

- "remind me to X every day at Y"
- "schedule X every N hours"
- "run X automatically every morning"
- "set up a daily/weekly task"

## Step 1 — Determine the schedule

Convert natural language to one of these formats:

| User says | Schedule JSON |
|-----------|--------------|
| "every day at 2pm" | `{"type":"cron","expr":"0 14 * * *"}` |
| "every 2 hours" | `{"type":"every","seconds":7200}` |
| "weekdays at 9am" | `{"type":"cron","expr":"0 9 * * 1-5"}` |
| "once on May 1st at 9am UTC" | `{"type":"once","at":"2026-05-01T09:00:00Z"}` |

Cron expressions are 5-field UTC: `minute hour day-of-month month day-of-week`.

## Step 2 — Get the chat_id

Your system prompt contains: "The Telegram chat_id for this conversation is <id>". Copy that exact integer.

## Step 3 — Read the jobs file

Read `.hyped/cron/jobs.json` relative to the working directory. If the file does not exist, treat it as an empty array `[]`.

## Step 4 — Build the new job entry

```json
{
  "id": "<generate a fresh lowercase UUIDv4>",
  "name": "<short human-friendly name, e.g. 'practice reminder'>",
  "prompt": "<self-contained prompt the scheduler will send to a fresh Claude session — no conversation history>",
  "schedule": <schedule JSON from Step 1>,
  "chat_id": <integer from Step 2>,
  "thread_id": null,
  "enabled": true,
  "next_run": "<next occurrence in RFC3339 UTC>",
  "last_run": null,
  "created_at": "<now in RFC3339 UTC>"
}
```

## Step 5 — Write the updated jobs file

Append the new entry to the array read in Step 3 and write it back to `.hyped/cron/jobs.json`.

IMPORTANT: Do NOT use `CronCreate` or any built-in scheduling tool. The hyped-cron scheduler in the daemon reads this file on disk — that is the only correct mechanism.

## Step 6 — Confirm to the user

Reply with a short confirmation: job name, schedule in plain English, and next run time in the user's local context (use UTC if unknown). Do not mention "session-based", "7-day limit", or any Claude Code scheduling internals — those do not apply here.
