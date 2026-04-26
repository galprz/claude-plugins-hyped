# Incognito Browser MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `incognito-browser` MCP — a headless Playwright-backed browser that is the default for all browser tasks, with `user-browser` (renamed from `chrome-tool`) used only when existing auth/cookies are required.

**Architecture:** Own MCP server built directly with `playwright` and `@modelcontextprotocol/sdk` (same pattern as `chrome-tool`). A single `session.ts` manages the browser/page lifecycle and recording state. `tools.ts` defines and executes the 9 tools. `index.ts` wires the MCP server.

**Tech Stack:** Bun, TypeScript, Playwright, `@modelcontextprotocol/sdk`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `mcp/incognito-browser/package.json` | create | deps + start script |
| `mcp/incognito-browser/session.ts` | create | browser/page/recording lifecycle |
| `mcp/incognito-browser/tools.ts` | create | tool definitions + execution |
| `mcp/incognito-browser/index.ts` | create | MCP server entry point |
| `mcp/incognito-browser/index.test.ts` | create | integration tests |
| `skills/incognito-browser/SKILL.md` | create | LLM orchestration guide |
| `skills/chrome-bridge/SKILL.md` | update | rename skill to `user-browser`, update descriptions |
| `CLAUDE.md` | update | add `incognito-browser`, rename chrome-bridge → user-browser, add decision rule |
| `.mcp.json` | update | add incognito-browser server, rename chrome-tool → user-browser |

---

## Task 1: `session.ts` — browser and recording lifecycle

**Files:**
- Create: `mcp/incognito-browser/session.ts`
- Test: `mcp/incognito-browser/index.test.ts`

- [ ] **Step 1: Create `mcp/incognito-browser/` and write the failing test**

```bash
mkdir -p /path/to/mcp/incognito-browser
```

Create `mcp/incognito-browser/index.test.ts`:

```typescript
import { test, expect } from 'bun:test'
import { Session } from './session'

test('getPage launches browser and returns a page', async () => {
  const session = new Session()
  const page = await session.getPage()
  expect(page).toBeDefined()
  expect(typeof page.goto).toBe('function')
  await session.close()
})

test('startRecording resets browser state', async () => {
  const session = new Session()
  const page1 = await session.getPage()
  await session.startRecording('/tmp/test-recording.mp4')
  const page2 = await session.getPage()
  expect(page2).not.toBe(page1) // new page after reset
  await session.close()
})

test('stopRecording produces an MP4 file', async () => {
  const { existsSync, unlinkSync } = await import('fs')
  const outputPath = '/tmp/incognito-test.mp4'
  if (existsSync(outputPath)) unlinkSync(outputPath)

  const session = new Session()
  await session.startRecording(outputPath)
  const page = await session.getPage()
  await page.goto('about:blank')
  const result = await session.stopRecording()

  expect(result).toBe(outputPath)
  expect(existsSync(outputPath)).toBe(true)
  if (existsSync(outputPath)) unlinkSync(outputPath)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd mcp/incognito-browser && bun test index.test.ts 2>&1 | head -20
```

Expected: `Cannot find module './session'`

- [ ] **Step 3: Create `mcp/incognito-browser/package.json`**

```json
{
  "name": "incognito-browser",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "start": "bun install --no-summary && bun index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "playwright": "^1.43.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

```bash
cd mcp/incognito-browser && bun install --no-summary
```

- [ ] **Step 4: Create `mcp/incognito-browser/session.ts`**

```typescript
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { execSync } from 'child_process'
import { dirname } from 'path'

export class Session {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private recordingOutputPath: string | null = null

  private headless(): boolean {
    return process.env.INCOGNITO_HEADLESS !== 'false'
  }

  private async init(contextOptions: Parameters<Browser['newContext']>[0] = {}): Promise<void> {
    if (this.browser) await this.browser.close()
    this.browser = await chromium.launch({ headless: this.headless() })
    this.context = await this.browser.newContext(contextOptions)
    this.page = await this.context.newPage()
  }

  async getPage(): Promise<Page> {
    if (!this.page) await this.init()
    return this.page!
  }

  async startRecording(outputPath: string): Promise<void> {
    this.recordingOutputPath = outputPath
    await this.init({ recordVideo: { dir: dirname(outputPath) } })
  }

  async stopRecording(): Promise<string> {
    if (!this.page || !this.context || !this.browser || !this.recordingOutputPath) {
      throw new Error('No recording in progress')
    }
    const video = this.page.video()!
    await this.context.close()
    const webmPath = await video.path()
    await this.browser.close()
    execSync(`ffmpeg -i "${webmPath}" -c:v copy "${this.recordingOutputPath}" -y`)
    const result = this.recordingOutputPath
    this.browser = null
    this.context = null
    this.page = null
    this.recordingOutputPath = null
    return result
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close()
    this.browser = null
    this.context = null
    this.page = null
    this.recordingOutputPath = null
  }
}
```

- [ ] **Step 5: Run tests to verify GREEN**

```bash
cd mcp/incognito-browser && bun test index.test.ts 2>&1
```

Expected:
```
(pass) getPage launches browser and returns a page
(pass) startRecording resets browser state
(pass) stopRecording produces an MP4 file
3 pass, 0 fail
```

- [ ] **Step 6: Commit**

```bash
git add mcp/incognito-browser/
git commit -m "feat(incognito-browser): add session lifecycle with recording support"
```

---

## Task 2: `tools.ts` — tool definitions and execution

**Files:**
- Create: `mcp/incognito-browser/tools.ts`
- Modify: `mcp/incognito-browser/index.test.ts`

- [ ] **Step 1: Add tool execution tests**

Append to `mcp/incognito-browser/index.test.ts`:

```typescript
import { executeTool, toolDefinitions } from './tools'

test('toolDefinitions contains 9 tools', () => {
  const names = toolDefinitions.map(t => t.name)
  expect(names).toContain('navigate')
  expect(names).toContain('screenshot')
  expect(names).toContain('click')
  expect(names).toContain('type')
  expect(names).toContain('key')
  expect(names).toContain('scroll')
  expect(names).toContain('eval')
  expect(names).toContain('record_start')
  expect(names).toContain('record_stop')
  expect(names).toHaveLength(9)
})

test('navigate returns confirmation text', async () => {
  const session = new Session()
  const result = await executeTool('navigate', { url: 'https://example.com' }, session)
  expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('example.com') })
  await session.close()
})

test('screenshot returns inline image', async () => {
  const session = new Session()
  await executeTool('navigate', { url: 'about:blank' }, session)
  const result = await executeTool('screenshot', {}, session)
  expect(result.content[0]).toMatchObject({ type: 'image' })
  await session.close()
})

test('screenshot with save_to writes JPEG to disk', async () => {
  const { existsSync, unlinkSync } = await import('fs')
  const saveTo = '/tmp/incognito-screenshot-test.jpg'
  if (existsSync(saveTo)) unlinkSync(saveTo)

  const session = new Session()
  await executeTool('navigate', { url: 'about:blank' }, session)
  const result = await executeTool('screenshot', { save_to: saveTo }, session)

  expect(existsSync(saveTo)).toBe(true)
  expect(result.content).toHaveLength(2)
  expect(result.content[1]).toMatchObject({ type: 'text', text: expect.stringContaining(saveTo) })
  unlinkSync(saveTo)
  await session.close()
})

test('eval returns page title', async () => {
  const session = new Session()
  await executeTool('navigate', { url: 'about:blank' }, session)
  const result = await executeTool('eval', { expression: 'document.title' }, session)
  expect(result.content[0]).toMatchObject({ type: 'text' })
  await session.close()
})

test('unknown tool returns error text', async () => {
  const session = new Session()
  const result = await executeTool('unknown_tool', {}, session)
  expect(result.content[0].text).toMatch(/Unknown tool/i)
  await session.close()
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd mcp/incognito-browser && bun test index.test.ts 2>&1 | grep -E "pass|fail"
```

Expected: 3 pass (session tests), 6 fail (tools tests)

- [ ] **Step 3: Create `mcp/incognito-browser/tools.ts`**

```typescript
import { writeFileSync } from 'fs'
import type { Session } from './session'

export const toolDefinitions = [
  {
    name: 'navigate',
    description: 'Navigate to a URL in a clean headless browser. Use user-browser instead if the page requires authentication or existing cookies.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot. Pass save_to to write JPEG to disk for Telegram delivery. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: {
        save_to: { type: 'string', description: 'Optional file path e.g. /tmp/shot.jpg' },
      },
    },
  },
  {
    name: 'click',
    description: 'Click at x/y coordinates. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'type',
    description: 'Type text into the focused element. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'key',
    description: 'Press a key (e.g. Enter, Tab, Escape). Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll at x/y coordinates by deltaY pixels. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        deltaY: { type: 'number' },
      },
      required: ['x', 'y', 'deltaY'],
    },
  },
  {
    name: 'eval',
    description: 'Evaluate JavaScript and return the result. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    },
  },
  {
    name: 'record_start',
    description: 'Start recording browser session to MP4. WARNING: resets browser state — call navigate AFTER this, not before.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: { type: 'string', description: 'Output MP4 path e.g. /tmp/session.mp4' },
      },
      required: ['output_path'],
    },
  },
  {
    name: 'record_stop',
    description: 'Stop recording and return the MP4 file path.',
    inputSchema: { type: 'object', properties: {} },
  },
]

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] }
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  session: Session,
): Promise<{ content: Array<{ type: string; [k: string]: unknown }> }> {
  try {
    switch (name) {
      case 'navigate': {
        const page = await session.getPage()
        await page.goto(args.url as string, { waitUntil: 'networkidle' })
        return text(`Navigated to ${args.url}`)
      }

      case 'screenshot': {
        const page = await session.getPage()
        const data = await page.screenshot({ type: 'jpeg', quality: 80 })
        const saveTo = args.save_to as string | undefined
        if (saveTo) {
          writeFileSync(saveTo, data)
          return {
            content: [
              { type: 'image' as const, data: data.toString('base64'), mimeType: 'image/jpeg' },
              { type: 'text' as const, text: `Screenshot saved to ${saveTo}` },
            ],
          }
        }
        return { content: [{ type: 'image' as const, data: data.toString('base64'), mimeType: 'image/jpeg' }] }
      }

      case 'click': {
        const page = await session.getPage()
        await page.mouse.click(args.x as number, args.y as number)
        return text(`Clicked (${args.x}, ${args.y})`)
      }

      case 'type': {
        const page = await session.getPage()
        await page.keyboard.type(args.text as string)
        return text(`Typed "${args.text}"`)
      }

      case 'key': {
        const page = await session.getPage()
        await page.keyboard.press(args.key as string)
        return text(`Pressed ${args.key}`)
      }

      case 'scroll': {
        const page = await session.getPage()
        await page.mouse.move(args.x as number, args.y as number)
        await page.mouse.wheel(0, args.deltaY as number)
        return text(`Scrolled ${args.deltaY}px at (${args.x}, ${args.y})`)
      }

      case 'eval': {
        const page = await session.getPage()
        const result = await page.evaluate(args.expression as string)
        return text(JSON.stringify(result))
      }

      case 'record_start': {
        await session.startRecording(args.output_path as string)
        return text(`Recording started → ${args.output_path}`)
      }

      case 'record_stop': {
        const path = await session.stopRecording()
        return text(`Recording saved → ${path}`)
      }

      default:
        return text(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return text(`Error: ${(e as Error).message}`)
  }
}
```

- [ ] **Step 4: Run all tests to verify GREEN**

```bash
cd mcp/incognito-browser && bun test index.test.ts 2>&1
```

Expected:
```
9 pass, 0 fail
```

- [ ] **Step 5: Commit**

```bash
git add mcp/incognito-browser/tools.ts mcp/incognito-browser/index.test.ts
git commit -m "feat(incognito-browser): add tool definitions and execution"
```

---

## Task 3: `index.ts` — MCP server entry point

**Files:**
- Create: `mcp/incognito-browser/index.ts`

- [ ] **Step 1: Create `mcp/incognito-browser/index.ts`**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { Session } from './session'
import { toolDefinitions, executeTool } from './tools'

const session = new Session()

const server = new Server(
  { name: 'incognito-browser', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  return executeTool(name, args ?? {}, session)
})

const transport = new StdioServerTransport()
await server.connect(transport)

process.on('SIGINT', async () => { await session.close(); process.exit(0) })
process.on('SIGTERM', async () => { await session.close(); process.exit(0) })
```

- [ ] **Step 2: Verify the server starts**

```bash
cd mcp/incognito-browser && echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | bun index.ts 2>/dev/null
```

Expected: JSON response with 9 tools listed including `navigate`, `screenshot`, `record_start`, `record_stop`.

- [ ] **Step 3: Commit**

```bash
git add mcp/incognito-browser/index.ts
git commit -m "feat(incognito-browser): add MCP server entry point"
```

---

## Task 4: Rename, skill docs, and wiring

**Files:**
- Create: `skills/incognito-browser/SKILL.md`
- Modify: `skills/chrome-bridge/SKILL.md` (update skill name + descriptions)
- Modify: `CLAUDE.md`
- Modify: `.mcp.json`

- [ ] **Step 1: Create `skills/incognito-browser/SKILL.md`**

```markdown
---
name: incognito-browser
description: Use for all browser tasks by default — scraping, screenshots, recording. Switch to user-browser only when the page requires authentication or existing cookies.
---

# incognito-browser

**Default browser tool.** Clean headless Playwright session — no cookies, no existing state.

## When to use which

| Use incognito-browser (default) | Use user-browser instead |
|---------------------------------|--------------------------|
| Public pages | Page requires login |
| Scraping / screenshots | Need existing cookies |
| Recording demos | Interacting with user's open tabs |
| Autonomous background tasks | Session state matters |

## Workflow 1 — Screenshot and send to Telegram

```
1. navigate({ url: "https://example.com" })
2. screenshot({ save_to: "/tmp/shot.jpg" })
3. <media>/tmp/shot.jpg</media>
```

## Workflow 2 — Scrape page content

```
1. navigate({ url: "https://example.com" })
2. eval({ expression: "document.body.innerText" })
   or eval({ expression: "JSON.stringify([...document.querySelectorAll('h2')].map(h => h.textContent))" })
```

## Workflow 3 — Record a session and send video

```
1. record_start({ output_path: "/tmp/session.mp4" })   ← resets browser state
2. navigate({ url: "https://example.com" })
3. click / type / scroll as needed
4. record_stop()                                        ← returns MP4 path
5. <media>/tmp/session.mp4</media>
```

## Tool Reference

| Tool | Key params | Notes |
|------|-----------|-------|
| `navigate` | `url` | waits for networkidle |
| `screenshot` | `save_to?` | inline image + saved file if save_to provided |
| `click` | `x`, `y` | coordinates |
| `type` | `text` | types into focused element |
| `key` | `key` (e.g. `"Enter"`) | keyboard press |
| `scroll` | `x`, `y`, `deltaY` | scroll wheel |
| `eval` | `expression` | returns JSON-stringified result |
| `record_start` | `output_path` | resets browser — navigate AFTER |
| `record_stop` | — | returns MP4 path |
```

- [ ] **Step 2: Update `skills/chrome-bridge/SKILL.md` — change skill name and add decision note**

At the top of `skills/chrome-bridge/SKILL.md`, update the frontmatter:

```markdown
---
name: user-browser
description: Use when the page requires authentication or you need the user's existing cookies/session. Use incognito-browser for public pages.
---

# user-browser
```

Also update the first line of the Overview section to:
```
Controls your real running Chrome with the user's existing session and cookies.
Use incognito-browser for public pages that don't require authentication.
```

- [ ] **Step 3: Update `CLAUDE.md`**

Replace the existing `chrome-bridge` entry with:

```markdown
### `user-browser`
**When:** The page requires login or you need the user's existing cookies/session.  
**Use `incognito-browser` instead** for any public page or task that doesn't need authentication.  
**How:** Controls real Chrome via MCP tools (CDP relay). Core tools: `navigate`, `screenshot`, `click`, `type`, `eval`, `record_start` / `record_stop`.
```

Add after `user-browser`:

```markdown
### `incognito-browser`
**When:** Default for all browser tasks — scraping, screenshots, recording, any public page.  
**Switch to `user-browser`** only when the page requires authentication or existing cookies.  
**How:** Headless Playwright browser. Same core tools as user-browser. `record_start` resets browser state — navigate after calling it, not before.
```

- [ ] **Step 4: Update `.mcp.json`**

```json
{
  "mcpServers": {
    "hyped-cron": {
      "command": "bun",
      "args": ["run", "--cwd", "${CLAUDE_PLUGIN_ROOT}/mcp/hyped-cron", "--silent", "start"]
    },
    "user-browser": {
      "command": "bun",
      "args": ["run", "--cwd", "${CLAUDE_PLUGIN_ROOT}/mcp/chrome-tool", "--silent", "start"],
      "env": {
        "CHROME_TOOL_PORT": "9222"
      }
    },
    "incognito-browser": {
      "command": "bun",
      "args": ["run", "--cwd", "${CLAUDE_PLUGIN_ROOT}/mcp/incognito-browser", "--silent", "start"]
    },
    "local-tts": {
      "command": "uv",
      "args": ["run", "--project", "${CLAUDE_PLUGIN_ROOT}/mcp/local-tts", "local-tts-mcp"]
    },
    "local-tunnel": {
      "command": "bun",
      "args": ["run", "--cwd", "${CLAUDE_PLUGIN_ROOT}/mcp/local-tunnel", "--silent", "start"]
    }
  }
}
```

- [ ] **Step 5: Run full test suite**

```bash
cd mcp/incognito-browser && bun test 2>&1
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add skills/incognito-browser/ skills/chrome-bridge/SKILL.md CLAUDE.md .mcp.json
git commit -m "feat(incognito-browser): wire MCP, update skills, rename chrome-bridge to user-browser"
```
