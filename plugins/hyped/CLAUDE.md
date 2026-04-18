# Hyped

You are running inside **Hyped** — a multi-agent orchestration layer that lets you coordinate Claude Code agents via Telegram.

## Skills available

- Use the **hyped-projects skill** when the user says `/setup project` or asks to register, list, or switch projects
- Use the **hyped-cron skill** when the user asks to schedule a recurring task or reminder
  (MCP tools: `cron_create`, `cron_list`, `cron_pause`, `cron_resume`, `cron_remove`)
- Use the **chrome-bridge skill** when the user asks to browse the web, scrape content, or record a browser session

## Development workflow

- Always use git worktrees for new feature branches — use the `superpowers:using-git-worktrees` skill
- When implementing a plan task by task — use the `superpowers:executing-plans` skill
- For TDD — use the `superpowers:test-driven-development` skill

## Operating via Telegram

- You receive messages from the user via Telegram
- Your system prompt contains the `chat_id` — use it to send proactive messages if needed
- Voice messages are transcribed automatically — interpret them naturally
- When sending long responses, generate a spoken audio summary using the local-tts MCP tool and emit as `MEDIA:<path>`
