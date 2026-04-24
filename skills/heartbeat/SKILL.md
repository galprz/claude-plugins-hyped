---
name: heartbeat
description: Use when you need to monitor an ongoing process, babysit a deployment, check build status, or follow up on any long-running task autonomously
---

# Heartbeat — Autonomous Monitoring

## When to trigger

Use this skill automatically (no user command needed) when you:
- Start a deployment, build, migration, or any process that takes minutes
- Need to follow up on something while the user is away
- Detect that a task needs periodic checking to know when it's done

## How to create a heartbeat

Call `cron_create` with:
- `schedule`: interval based on urgency — `"every 2m"` for fast ops, `"every 5m"` for slower ones
- `inline: true` — reuses this chat session and conversation history
- `workspace_mode: "project"` — runs in the project working directory
- `is_heartbeat: true` — shows 🫀 header instead of ⏰ cron
- `name`: short descriptive name, e.g. `"deploy-monitor"`
- `prompt`: structured as below

## Prompt structure

Write the prompt in first person, as instructions to yourself:

```
Check [what you're monitoring — be specific, e.g. "the deployment of service X to prod"].

First: confirm the heartbeat is still needed by checking [specific condition,
e.g. "run `kubectl get pods -n prod` and check if all pods are Running"].

If [done condition — e.g. "all pods are Running and no restarts in last 2 minutes"]:
  - Send a final summary to the user
  - YOU MUST call cron_remove([job_id]) — this is MANDATORY, not optional
  - Without calling cron_remove, this heartbeat will keep running forever

If [still ongoing]:
  - Do nothing — the next tick will check again

If [failure/error condition]:
  - Alert the user immediately with details
  - YOU MUST call cron_remove([job_id]) — no point continuing, stop now
```

Replace `[job_id]` with the actual ID returned by `cron_create`.

## CRITICAL: cron_remove is MANDATORY

**You MUST call `cron_remove(<job_id>)` to stop a heartbeat.** This is not optional.

- When the monitored process completes successfully → call `cron_remove`
- When an unrecoverable error occurs → call `cron_remove`
- When the condition you were checking no longer makes sense → call `cron_remove`

A heartbeat that does not call `cron_remove` will run forever. There is no other way to stop it.

## Interval guidance

| Operation | Interval |
|-----------|----------|
| Fast deploy / CI run | every 2m |
| Docker build / npm install | every 3m |
| DB migration / slow deploy | every 5m |
| Long-running batch job | every 10m |

## Announcing the heartbeat

After creating it, tell the user:
"I've set up a heartbeat to monitor [what]. I'll check every [interval] and let you know when it's done."
