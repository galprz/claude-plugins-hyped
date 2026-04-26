# Incognito Browser MCP — Design Spec

## Goal

Add a headless Playwright-backed browser MCP (`incognito-browser`) as the default browser tool, alongside the existing user-session-based `user-browser` (formerly `chrome-tool`).

## Architecture

Use `@playwright/mcp`'s `createConnection(config, contextGetter)` as the foundation — it provides all standard tools (navigate, click, type, scroll, eval, screenshot) via its `core` + `vision` capabilities. A thin wrapper in `index.ts` adds `record_start` and `record_stop` by injecting a custom `contextGetter` that creates a Playwright `BrowserContext` with `recordVideo` enabled when recording is active. `recorder.ts` manages the context lifecycle and WebM→MP4 conversion via ffmpeg.

## KISS Constraints

- No edge case handling — if ffmpeg isn't installed, let it crash with a clear error
- No retry logic, no timeout wrappers, no graceful degradation
- No multi-page / multi-context management — one browser, one page at a time
- record_start/stop is fire-and-forget — no progress tracking, no partial video recovery
- If the MCP SDK doesn't support appending handlers, use the simplest proxy that works — no abstraction layers

## Requirements

| # | Requirement |
|---|-------------|
| R1 | New MCP server `incognito-browser` in `mcp/incognito-browser/` |
| R2 | Standard tools (navigate, click, type, key, scroll, eval, screenshot) provided by `@playwright/mcp` with `capabilities: ['core', 'vision']` |
| R3 | `screenshot` saves to `outputDir` automatically — verify during implementation whether `@playwright/mcp`'s outputDir config handles this or if a custom `save_to` wrapper is needed |
| R4 | `record_start({ output_path })` — closes any existing context, creates a fresh Playwright context with `recordVideo` enabled. **Browser state is reset** — navigate after calling `record_start`, not before |
| R5 | `record_stop()` — closes the recording context (flushes WebM), converts to MP4 via ffmpeg, returns MP4 path |
| R6 | Headless by default; `INCOGNITO_HEADLESS=false` env var makes browser visible |
| R7 | `chrome-tool` MCP server renamed to `user-browser` in `.mcp.json` and all skill/CLAUDE.md references |
| R8 | `skills/incognito-browser/SKILL.md` — documents full orchestration: when to use, step-by-step workflows for screenshot, scraping, and recording, tool call sequences, and how to deliver output to Telegram |
| R9 | CLAUDE.md updated with both MCPs and the decision rule |
| OUT | Tab management tools (`get_tabs`, `switch_tab`, `focus_tab`) — not needed for headless |
| OUT | Persistent browser profiles — incognito always starts fresh |
| OUT | Authentication / cookie injection — that's `user-browser`'s job |

## Definition of Done

- [ ] `bun run start` in `mcp/incognito-browser/` starts the MCP server without errors
- [ ] `navigate` + `screenshot` works end-to-end in a test
- [ ] `record_start` → interact → `record_stop` produces a valid MP4 at the specified path
- [ ] `user-browser` rename reflected in `.mcp.json`, `skills/`, and `CLAUDE.md`
- [ ] `skills/incognito-browser/SKILL.md` written
- [ ] All tests pass

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `mcp/incognito-browser/package.json` | create | deps: `@playwright/mcp`, `playwright`, `@modelcontextprotocol/sdk` |
| `mcp/incognito-browser/index.ts` | create | MCP entry point — calls `createConnection` with config + contextGetter, registers record tools |
| `mcp/incognito-browser/recorder.ts` | create | manages recording context lifecycle + WebM→MP4 via ffmpeg |
| `mcp/incognito-browser/index.test.ts` | create | integration tests for navigate, screenshot, record |
| `skills/incognito-browser/SKILL.md` | create | when/how to use the MCP |
| `skills/chrome-bridge/SKILL.md` | rename/update | rename to `skills/user-browser/SKILL.md`, update descriptions |
| `CLAUDE.md` | update | add `incognito-browser`, rename `chrome-bridge` → `user-browser`, add decision rule |
| `.mcp.json` | update | add `incognito-browser` server, rename `chrome-tool` → `user-browser` |

## Tasks

### Task 1 — `recorder.ts`
- Write failing test: `record_start` creates context with recordVideo, `record_stop` returns MP4 path
- Implement: `RecordingSession` class — holds `BrowserContext` + `Page`, `start(outputPath)` creates context with `recordVideo: { dir }`, `stop()` closes context + runs ffmpeg, returns MP4
- Verify GREEN
- Full suite check

### Task 2 — `index.ts` + `package.json`
- Write failing test: MCP server starts, `tools/list` includes both `@playwright/mcp` tools and record tools
- Implement: own MCP server that calls `createConnection(config, contextGetter)` for standard tools, and registers `record_start` + `record_stop` as additional tool handlers. If the MCP SDK doesn't support appending handlers to an existing server, run `@playwright/mcp` as a proxied child process and add record tools on top
- Verify GREEN

### Task 3 — Rename + docs
- Rename `skills/chrome-bridge/` → `skills/user-browser/`, update all descriptions with "use when you need the user's existing cookies or session"
- Create `skills/incognito-browser/SKILL.md`
- Update `CLAUDE.md` and `.mcp.json`
- Full suite check

## LLM Decision Rule

```
Default: incognito-browser
Exception: user-browser — only when the page requires authentication
           or you need the user's existing cookies/session
```

Tool descriptions in `incognito-browser` end with:
> *"Uses a clean headless browser. Switch to user-browser if authentication is required."*

Tool descriptions in `user-browser` end with:
> *"Uses the user's real browser session with existing cookies. Use incognito-browser for public pages."*

## Skill Orchestration (content for `skills/incognito-browser/SKILL.md`)

The skill must document three concrete workflows with exact tool call sequences:

**Workflow 1 — Screenshot and send to Telegram**
```
1. navigate({ url })
2. screenshot({ save_to: "/tmp/shot.jpg" })
3. <media>/tmp/shot.jpg</media>
```

**Workflow 2 — Scrape page content**
```
1. navigate({ url })
2. eval({ expression: "document.body.innerText" })  → extract data
   or eval({ expression: "..." })                   → structured extraction
```

**Workflow 3 — Record a session and send video**
```
1. record_start({ output_path: "/tmp/session.mp4" })
2. navigate({ url })
3. click / type / scroll as needed
4. record_stop()  → returns MP4 path
5. <media>/tmp/session.mp4</media>
```

The skill must also include the decision table:
```
Use incognito-browser (default)    Use user-browser instead
───────────────────────────────    ────────────────────────
Public pages                       Page requires login
Scraping / screenshots             Need existing cookies
Recording demos                    Interacting with user's open tabs
Autonomous background tasks        Session state matters
```
