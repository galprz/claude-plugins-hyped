# Hyped Plugin for Claude Code

The official Claude Code plugin for [Hyped](https://github.com/galprz/hyped) — a multi-agent orchestration layer that lets you coordinate Claude Code agents via Telegram.

## What this plugin adds

- **`hyped-projects` skill** — register and switch between projects via guided voice-friendly flow
- **`hyped-cron` skill** — schedule recurring tasks and reminders
- **`chrome-bridge` skill** — browse the web, scrape content, record browser sessions
- **`/setup` command** — guided project registration without typing paths
- **`CLAUDE.md`** — tells Claude it's running inside Hyped and how to use the skills

## Installation

```bash
claude plugin install hyped@galprz/claude-plugins-hyped
```

Or install via the hyped one-liner installer:

```bash
curl -fsSL https://raw.githubusercontent.com/galprz/hyped/main/install.sh | bash
```

## Requirements

- [Hyped daemon](https://github.com/galprz/hyped) running on your machine
- [superpowers plugin](https://github.com/anthropics/claude-plugins-official) recommended

## Usage

Once installed and the hyped daemon is running, message your Telegram bot:

- `/setup project` — register a new project (guided flow, voice-friendly)
- `/project switch <name>` — switch active project context
- `/project list` — see all registered projects
- Ask to schedule anything — hyped-cron handles it
- Ask to browse the web — chrome-bridge handles it
