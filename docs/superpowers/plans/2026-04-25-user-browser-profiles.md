# User-Browser Profile Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chrome profile selection to the `user-browser` MCP — list profiles, open Chrome with a chosen profile, and kill only that instance when done.

**Architecture:** Three new MCP tools (`list_profiles`, `open_browser`, `close_browser`) are added to the daemon. The daemon tracks the PID of the Chrome it launches and kills it on `close_browser`. All errors are returned as text content so the LLM can reason and recover. The skill is updated to guide Claude through the lifecycle automatically.

**Tech Stack:** TypeScript, Bun, Node.js `child_process`, `ws` WebSocket, JSON (Chrome Local State)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `mcp/user-browser/profiles.ts` | **Create** | Parse Chrome's Local State and return `ChromeProfile[]` |
| `mcp/user-browser/profiles.test.ts` | **Create** | Unit tests for `listChromeProfiles()` |
| `mcp/user-browser/chrome.ts` | **Modify** | Add optional `profileDir` param to `launchChrome()` |
| `mcp/user-browser/types.ts` | **Modify** | Add `open_browser`, `close_browser`, `list_profiles` to `ClientToDaemon`; add `browser_opened`, `browser_closed`, `profiles` to `DaemonToClient` |
| `mcp/user-browser/daemon.ts` | **Modify** | Add PID registry, kill-with-retry, `open_browser`/`close_browser`/`list_profiles` handlers; remove 3s timer; auto-launch Default on join fallback |
| `mcp/user-browser/client.ts` | **Modify** | Add `openBrowser(profile?)`, `closeBrowser()`, `listProfiles()` methods to `DaemonClient` |
| `mcp/user-browser/tools.ts` | **Modify** | Add 3 new tool definitions and route them to client methods |
| `skills/user-browser/SKILL.md` | **Modify** | Update workflow to list → ask (if >1 profile) → open → work → close |

---

### Task 1: `profiles.ts` — Parse Chrome profiles

**Files:**
- Create: `mcp/user-browser/profiles.ts`
- Create: `mcp/user-browser/profiles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mcp/user-browser/profiles.test.ts
import { listChromeProfiles } from './profiles'
import { vol } from 'memfs'

jest.mock('fs', () => require('memfs').fs)

const LOCAL_STATE = JSON.stringify({
  profile: {
    info_cache: {
      Default:   { name: 'Person 1' },
      'Profile 1': { name: 'Work' },
      'Profile 2': { name: 'Personal' },
    },
  },
})

test('returns all profiles with name and directory', () => {
  vol.fromJSON({
    '/Users/test/Library/Application Support/Google/Chrome/Local State': LOCAL_STATE,
  })
  // We'll need to override homedir — tested via integration below
  const profiles = listChromeProfiles('/Users/test')
  expect(profiles).toEqual([
    { directory: 'Default',   name: 'Person 1' },
    { directory: 'Profile 1', name: 'Work' },
    { directory: 'Profile 2', name: 'Personal' },
  ])
})

test('returns empty array if Local State missing', () => {
  vol.reset()
  const profiles = listChromeProfiles('/nonexistent')
  expect(profiles).toEqual([])
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/galperetz/.hyped/plugins/claude-plugins-hyped/mcp/user-browser
bun test profiles.test.ts
```

Expected: FAIL — `Cannot find module './profiles'`

- [ ] **Step 3: Create `profiles.ts`**

```ts
// mcp/user-browser/profiles.ts
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface ChromeProfile {
  name: string
  directory: string
}

export function listChromeProfiles(home = homedir()): ChromeProfile[] {
  const localStatePath = join(
    home,
    'Library/Application Support/Google/Chrome/Local State'
  )
  try {
    const data = JSON.parse(readFileSync(localStatePath, 'utf8'))
    const infoCache = data?.profile?.info_cache ?? {}
    return Object.entries(infoCache).map(([dir, info]: [string, any]) => ({
      directory: dir,
      name: (info.name as string) ?? dir,
    }))
  } catch {
    return []
  }
}

/** Resolves a user-visible profile name (e.g. "Work") to a directory (e.g. "Profile 1").
 *  Returns null if no match found. */
export function resolveProfileDir(name: string, profiles: ChromeProfile[]): string | null {
  // Exact directory match (e.g. "Default", "Profile 1")
  const byDir = profiles.find(p => p.directory === name)
  if (byDir) return byDir.directory
  // Case-insensitive display name match
  const byName = profiles.find(p => p.name.toLowerCase() === name.toLowerCase())
  if (byName) return byName.directory
  return null
}
```

- [ ] **Step 4: Install memfs dev dependency**

```bash
cd /Users/galperetz/.hyped/plugins/claude-plugins-hyped/mcp/user-browser
bun add -d memfs
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
bun test profiles.test.ts
```

Expected: PASS — 2 tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/galperetz/.hyped/plugins/claude-plugins-hyped/mcp/user-browser
git add profiles.ts profiles.test.ts package.json bun.lock
git commit -m "feat(user-browser): add profiles.ts — list and resolve Chrome profiles"
```

---

### Task 2: `chrome.ts` — Profile directory flag

**Files:**
- Modify: `mcp/user-browser/chrome.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Add to chrome.test.ts (create if it doesn't exist)
// mcp/user-browser/chrome.test.ts
import { launchChrome } from './chrome'
import { spawn } from 'child_process'

jest.mock('child_process', () => ({ spawn: jest.fn(() => ({ unref: jest.fn() })) }))
jest.mock('fs', () => ({ existsSync: () => true }))

test('launchChrome passes --profile-directory=Default by default', () => {
  launchChrome('/ext/path')
  const args = (spawn as jest.Mock).mock.calls[0][1] as string[]
  expect(args).toContain('--profile-directory=Default')
})

test('launchChrome passes the given profile directory', () => {
  (spawn as jest.Mock).mockClear()
  launchChrome('/ext/path', 'Profile 1')
  const args = (spawn as jest.Mock).mock.calls[0][1] as string[]
  expect(args).toContain('--profile-directory=Profile 1')
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bun test chrome.test.ts
```

Expected: FAIL — `--profile-directory` not in args

- [ ] **Step 3: Update `launchChrome()` in `chrome.ts`**

Replace the existing `launchChrome` function:

```ts
export function launchChrome(extensionPath: string, profileDir = 'Default'): ChildProcess {
  const chromePath = findChrome()
  const proc = spawn(chromePath, [
    `--load-extension=${extensionPath}`,
    `--profile-directory=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: false, stdio: 'ignore' })
  proc.unref()
  return proc
}
```

- [ ] **Step 4: Run tests**

```bash
bun test chrome.test.ts
```

Expected: PASS — 2 tests pass

- [ ] **Step 5: Commit**

```bash
git add chrome.ts chrome.test.ts
git commit -m "feat(user-browser): launchChrome accepts profileDir param"
```

---

### Task 3: `types.ts` — New message types

**Files:**
- Modify: `mcp/user-browser/types.ts`

- [ ] **Step 1: Add new variants to `ClientToDaemon` and `DaemonToClient`**

In `types.ts`, replace the two type definitions (keep `ExtToDaemon`, `DaemonToExt`, and `BrowserClient` unchanged):

```ts
// Messages: MCP client → daemon
export type ClientToDaemon =
  | { type: 'join';         session_id: string }
  | { type: 'focus';        session_id: string }
  | { type: 'command';      session_id: string; id: number; method: string; params: Record<string, unknown> }
  | { type: 'leave';        session_id: string }
  | { type: 'open_browser'; profile?: string }
  | { type: 'close_browser' }
  | { type: 'list_profiles' }

// Messages: daemon → MCP client
export type DaemonToClient =
  | { type: 'ready' }
  | { type: 'response';       id: number; result: unknown }
  | { type: 'event';          method: string; params: Record<string, unknown> }
  | { type: 'error';          message: string }
  | { type: 'browser_opened' }
  | { type: 'browser_closed' }
  | { type: 'profiles';       profiles: import('./profiles').ChromeProfile[] }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat(user-browser): add open_browser/close_browser/list_profiles message types"
```

---

### Task 4: `daemon.ts` — Lifecycle control

**Files:**
- Modify: `mcp/user-browser/daemon.ts`

- [ ] **Step 1: Add imports and PID tracking state**

At the top of `daemon.ts`, add the import for profiles and a kill helper. Add `launchedChromePid` state variable:

```ts
// Add after existing imports
import { listChromeProfiles, resolveProfileDir } from './profiles'

// Add after the sessions/extensionSocket declarations
let launchedChromePid: number | null = null

async function killChrome(pid: number): Promise<void> {
  try { process.kill(pid, 'SIGTERM') } catch { return } // already dead
  for (let i = 0; i < 3; i++) {
    await new Promise<void>(r => setTimeout(r, 1000))
    try { process.kill(pid, 0) } catch { return } // dead
  }
  try { process.kill(pid, 'SIGKILL') } catch { /* ignore */ }
}
```

- [ ] **Step 2: Remove the 3-second auto-launch timer**

Delete these lines at the bottom of `daemon.ts`:

```ts
// Launch Chrome if extension doesn't connect within 3s
setTimeout(() => {
  if (!extensionSocket) {
    console.error('[daemon] no extension — launching Chrome')
    try { launchChrome(EXTENSION_PATH) } catch (e) {
      console.error('[daemon] Chrome launch failed:', e)
    }
  }
}, 3000)
```

- [ ] **Step 3: Update the `join` handler fallback in `handleClient`**

In the `join` branch inside `handleClient`, replace the `else` clause:

```ts
// Before (in the join handler):
if (extensionSocket?.readyState === WebSocket.OPEN) {
  sendExt({ type: 'open_tab', session_id: sessionId })
} else {
  sendClient(ws, { type: 'error', message: 'Browser not connected' })
}

// After:
if (extensionSocket?.readyState === WebSocket.OPEN) {
  sendExt({ type: 'open_tab', session_id: sessionId })
} else {
  // Fallback: auto-launch with Default profile if Chrome isn't open yet
  console.error('[daemon] no extension on join — auto-launching Default profile')
  try {
    const proc = launchChrome(EXTENSION_PATH, 'Default')
    if (proc.pid) launchedChromePid = proc.pid
  } catch (e) {
    sendClient(ws, { type: 'error', message: `Chrome launch failed: ${(e as Error).message}` })
  }
}
```

- [ ] **Step 4: Add `open_browser`, `close_browser`, `list_profiles` handlers in `handleClient`**

Inside the `ws.on('message', ...)` handler in `handleClient`, add these cases before the final closing brace (alongside existing `join`, `command`, `leave` handlers):

```ts
if (msg.type === 'list_profiles') {
  const profiles = listChromeProfiles()
  sendClient(ws, { type: 'profiles', profiles })
  return
}

if (msg.type === 'open_browser') {
  const profiles = listChromeProfiles()
  let profileDir = 'Default'

  if (msg.profile) {
    const resolved = resolveProfileDir(msg.profile, profiles)
    if (!resolved) {
      const names = profiles.map(p => `"${p.name}" (${p.directory})`).join(', ')
      sendClient(ws, {
        type: 'error',
        message: `Profile "${msg.profile}" not found. Available profiles: ${names}`,
      })
      return
    }
    profileDir = resolved
  }

  // Kill existing Chrome first if already open
  if (launchedChromePid !== null) {
    await killChrome(launchedChromePid)
    launchedChromePid = null
  }

  try {
    const proc = launchChrome(EXTENSION_PATH, profileDir)
    if (proc.pid) launchedChromePid = proc.pid
    sendClient(ws, { type: 'browser_opened' })
  } catch (e) {
    sendClient(ws, { type: 'error', message: `Chrome launch failed: ${(e as Error).message}` })
  }
  return
}

if (msg.type === 'close_browser') {
  if (launchedChromePid === null) {
    sendClient(ws, { type: 'browser_closed' })
    return
  }
  await killChrome(launchedChromePid)
  launchedChromePid = null
  sendClient(ws, { type: 'browser_closed' })
  return
}
```

> **Note:** The `ws.on('message')` callback must be `async` for `await killChrome(...)` to work. Change the signature: `ws.on('message', async (raw) => {`

- [ ] **Step 5: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add daemon.ts
git commit -m "feat(user-browser): daemon — PID tracking, open/close/list_profiles handlers, remove auto-launch timer"
```

---

### Task 5: `client.ts` — New methods

**Files:**
- Modify: `mcp/user-browser/client.ts`

- [ ] **Step 1: Add `openBrowser`, `closeBrowser`, `listProfiles` to `DaemonClient`**

In `client.ts`, add the import for `ChromeProfile` at the top:

```ts
import type { ChromeProfile } from './profiles'
```

Then add these three methods to the `DaemonClient` class, after the existing `focus()` method:

```ts
async openBrowser(profile?: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onMessage = (raw: import('ws').RawData) => {
      const msg = JSON.parse(raw.toString()) as import('./types').DaemonToClient
      if (msg.type === 'browser_opened') {
        this.ws.off('message', onMessage)
        resolve()
      } else if (msg.type === 'error') {
        this.ws.off('message', onMessage)
        reject(new Error(msg.message))
      }
    }
    this.ws.on('message', onMessage)
    this.ws.send(JSON.stringify({ type: 'open_browser', profile } satisfies import('./types').ClientToDaemon))
  })
}

async closeBrowser(): Promise<void> {
  return new Promise<void>((resolve) => {
    const onMessage = (raw: import('ws').RawData) => {
      const msg = JSON.parse(raw.toString()) as import('./types').DaemonToClient
      if (msg.type === 'browser_closed' || msg.type === 'error') {
        this.ws.off('message', onMessage)
        resolve()
      }
    }
    this.ws.on('message', onMessage)
    this.ws.send(JSON.stringify({ type: 'close_browser' } satisfies import('./types').ClientToDaemon))
  })
}

async listProfiles(): Promise<ChromeProfile[]> {
  return new Promise<ChromeProfile[]>((resolve) => {
    const onMessage = (raw: import('ws').RawData) => {
      const msg = JSON.parse(raw.toString()) as import('./types').DaemonToClient
      if (msg.type === 'profiles') {
        this.ws.off('message', onMessage)
        resolve(msg.profiles)
      }
    }
    this.ws.on('message', onMessage)
    this.ws.send(JSON.stringify({ type: 'list_profiles' } satisfies import('./types').ClientToDaemon))
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add client.ts
git commit -m "feat(user-browser): client — openBrowser, closeBrowser, listProfiles methods"
```

---

### Task 6: `tools.ts` — Wire up new tools

**Files:**
- Modify: `mcp/user-browser/tools.ts`

- [ ] **Step 1: Update `executeTool` signature to accept the full `DaemonClient`**

The three new tools need access to `openBrowser`, `closeBrowser`, and `listProfiles` which are on `DaemonClient` but not on the `BrowserClient` interface. Add a second interface:

In `tools.ts`, add after the `Focusable` interface:

```ts
export interface BrowserLifecycle {
  openBrowser(profile?: string): Promise<void>
  closeBrowser(): Promise<void>
  listProfiles(): Promise<import('./profiles').ChromeProfile[]>
}
```

Update `executeTool`'s signature:

```ts
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  client: BrowserClient & Partial<Focusable> & Partial<BrowserLifecycle>,
  sessionId?: string,
): Promise<{ content: Array<{ type: string; [k: string]: unknown }> }>
```

- [ ] **Step 2: Add 3 new tool definitions to `toolDefinitions`**

Append to the `toolDefinitions` array:

```ts
{
  name: 'list_profiles',
  description: 'List all available Chrome profiles. Call this before open_browser to let the user choose a profile.',
  inputSchema: { type: 'object', properties: {} },
},
{
  name: 'open_browser',
  description: 'Launch Chrome with a specific profile. If no profile is given, uses the Default profile. If already open, kills the existing Chrome instance first.',
  inputSchema: {
    type: 'object',
    properties: {
      profile: {
        type: 'string',
        description: 'Profile display name (e.g. "Work") or directory (e.g. "Profile 1"). Omit for Default.',
      },
    },
  },
},
{
  name: 'close_browser',
  description: 'Kill the Chrome instance that was launched by open_browser.',
  inputSchema: { type: 'object', properties: {} },
},
```

- [ ] **Step 3: Add cases to `executeTool` switch**

Inside the `switch (name)` block, add before the `default` case:

```ts
case 'list_profiles': {
  if (!client.listProfiles) return text('list_profiles not available')
  const profiles = await client.listProfiles()
  if (profiles.length === 0) return text('No Chrome profiles found.')
  const lines = profiles.map(p => `- ${p.name} (directory: ${p.directory})`).join('\n')
  return text(`Available Chrome profiles:\n${lines}`)
}

case 'open_browser': {
  if (!client.openBrowser) return text('open_browser not available')
  const profile = args.profile as string | undefined
  try {
    await client.openBrowser(profile)
    return text(`Chrome opened${profile ? ` with profile "${profile}"` : ' with Default profile'}`)
  } catch (e) {
    return text(`Failed to open browser: ${(e as Error).message}`)
  }
}

case 'close_browser': {
  if (!client.closeBrowser) return text('close_browser not available')
  await client.closeBrowser()
  return text('Chrome closed')
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run full test suite**

```bash
bun test
```

Expected: all existing tests pass

- [ ] **Step 6: Commit**

```bash
git add tools.ts
git commit -m "feat(user-browser): tools — list_profiles, open_browser, close_browser"
```

---

### Task 7: `skills/user-browser/SKILL.md` — Update workflow

**Files:**
- Modify: `skills/user-browser/SKILL.md`

- [ ] **Step 1: Replace the Full Workflow section**

Open `skills/user-browser/SKILL.md` and replace the `## Full Workflow` section with:

```markdown
## Full Workflow

```
1. list_profiles()                          → get available profiles
   - If only "Default" exists: skip asking, go to step 3 with no profile arg
   - Otherwise: show user the list and ask which profile to use
2. [User picks a profile]
3. open_browser({ profile: "Work" })        → launches Chrome with that profile
   OR open_browser()                        → launches with Default
4. navigate / screenshot / interact ...
5. close_browser()                          → kills that Chrome instance
```

> If `open_browser` returns a "Profile not found" error, call `list_profiles()` again to show current options and ask the user to pick one.
```

- [ ] **Step 2: Update the Tool Reference table**

Add the three new tools to the Tool Reference table:

```markdown
| `list_profiles` | — | Array of `{name, directory}` for all Chrome profiles |
| `open_browser` | `profile?` (display name or dir) | Launches Chrome; kills existing instance first if open |
| `close_browser` | — | Kills the Chrome instance launched by `open_browser` |
```

- [ ] **Step 3: Commit**

```bash
cd /Users/galperetz/.hyped/plugins/claude-plugins-hyped
git add skills/user-browser/SKILL.md
git commit -m "feat(user-browser): skill — add profile lifecycle workflow"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| R1 — `list_profiles` reads Local State | Task 1 |
| R2 — `open_browser(profile?)` launches Chrome, tracks PID | Task 4 |
| R3 — `close_browser` kills only launched PID | Task 4 |
| R4 — Auto-launch fallback on join | Task 4, Step 3 |
| R5 — `launchChrome()` accepts `profileDir` | Task 2 |
| R6 — Skill guides list → ask → open → close | Task 7 |
| R8 — Unknown profile returns error with list | Task 4, Step 4 |
| R9 — `open_browser` twice kills first | Task 4, Step 4 |
| R10 — SIGTERM + poll 3x + SIGKILL | Task 4, Step 1 |
| R11 — Errors as text content | Task 6, Step 3 |
| R12 — Skip profile question if only Default | Task 7, Step 1 |

All requirements covered. ✓
