# User-Browser Profile Support Design

## Goal

Add Chrome profile selection to the `user-browser` MCP — list available profiles, launch Chrome with a chosen profile, and kill that specific Chrome instance when done.

## Architecture

The daemon gains a Chrome PID registry. Three new MCP tools are added: `list_profiles`, `open_browser`, and `close_browser`. The existing auto-launch fallback (Default profile) is kept as a safety net. The skill is updated to always guide Claude through the explicit open → work → close lifecycle.

## Requirements

| ID | Requirement |
|----|-------------|
| R1 | `list_profiles` tool reads `~/Library/Application Support/Google/Chrome/Local State` and returns all profiles as `{name, directory}[]` |
| R2 | `open_browser(profile?)` launches Chrome with `--profile-directory=<dir>`, tracks the PID, defaults to `"Default"` if no profile specified |
| R3 | `close_browser()` kills only the Chrome PID that was launched by this daemon instance |
| R4 | If a session joins and no Chrome is connected, the daemon auto-launches with Default profile (existing fallback, unchanged) |
| R5 | `launchChrome()` in `chrome.ts` accepts an optional `profileDir` string and passes `--profile-directory=<profileDir>` |
| R6 | The `user-browser` skill instructs Claude to: call `list_profiles` → ask user → call `open_browser` → do work → call `close_browser` |
| R8 | If `open_browser` receives an unknown profile name, the tool returns an error string (not an exception) including the list of available profiles so the LLM can re-ask the user |
| R9 | If `open_browser` is called while Chrome is already open, kill the existing instance first, then launch the new one |
| R10 | `close_browser` sends SIGTERM, then polls up to 3 times (1s apart); if process still alive, sends SIGKILL |
| R11 | All MCP tool errors are returned as text content (not thrown), so the LLM can reason and recover |
| R12 | The skill skips the profile question and calls `open_browser()` with no arg if `list_profiles` returns only the Default profile |
| R7 | **Out of scope:** Linux Chrome profile path, multiple simultaneous Chrome instances, persistent profile preference |

## Definition of Done

- [ ] `list_profiles` returns correct profile names from a real Chrome installation
- [ ] `open_browser({ profile: "Work" })` launches Chrome with that profile visible in the title bar
- [ ] `open_browser()` with no arg launches with Default profile
- [ ] `close_browser()` kills only the launched Chrome, leaves other Chrome windows untouched
- [ ] Auto-launch fallback still works when tools are used without calling `open_browser` first
- [ ] Skill workflow guides Claude to list → ask → open → close in the correct order

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `mcp/user-browser/chrome.ts` | modify | Add `profileDir?` param to `launchChrome()`, pass `--profile-directory` flag |
| `mcp/user-browser/daemon.ts` | modify | Store launched Chrome PID; handle `open_browser`, `list_profiles`, `close_browser` client messages; remove auto-launch timer |
| `mcp/user-browser/types.ts` | modify | Add `open_browser`, `list_profiles`, `close_browser` to `ClientToDaemon` and `DaemonToClient` message types |
| `mcp/user-browser/client.ts` | modify | Add `openBrowser(profile?)`, `closeBrowser()`, `listProfiles()` methods to `DaemonClient` |
| `mcp/user-browser/tools.ts` | modify | Wire up 3 new tool definitions and handlers |
| `skills/user-browser/SKILL.md` | modify | Update workflow to include list → ask → open → close lifecycle |

## Tasks

### Task 1 — Extend `chrome.ts` with profile support

**Implement:** Add optional `profileDir` to `launchChrome()`:
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

**Verify:** Existing call sites still compile (pass no second arg → `"Default"`).

---

### Task 2 — Add `list_profiles` logic

**Implement:** New file or function `profiles.ts`:
```ts
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface ChromeProfile { name: string; directory: string }

export function listChromeProfiles(): ChromeProfile[] {
  const localState = join(homedir(), 'Library/Application Support/Google/Chrome/Local State')
  const data = JSON.parse(readFileSync(localState, 'utf8'))
  const infos = data?.profile?.info_cache ?? {}
  return Object.entries(infos).map(([dir, info]: [string, any]) => ({
    directory: dir,
    name: info.name ?? dir,
  }))
}
```

**Verify:** Returns at least `{ name: "Person 1", directory: "Default" }` on a real Chrome install.

---

### Task 3 — Update types

**Implement:** Add to `ClientToDaemon`:
```ts
| { type: 'open_browser'; profile?: string }
| { type: 'close_browser' }
| { type: 'list_profiles' }
```

Add to `DaemonToClient`:
```ts
| { type: 'browser_opened' }
| { type: 'browser_closed' }
| { type: 'profiles'; profiles: ChromeProfile[] }
```

---

### Task 4 — Update daemon

**Implement:**
- Store `let launchedChromePid: number | null = null`
- Remove the 3s auto-launch timer
- Add handlers:
  - `open_browser` → resolve profile dir from name, call `launchChrome(extensionPath, profileDir)`, store PID, respond `browser_opened`
  - `close_browser` → `process.kill(launchedChromePid)`, clear PID, respond `browser_closed`
  - `list_profiles` → call `listChromeProfiles()`, respond `profiles`
- Keep fallback: the existing `sendClient(ws, { type: 'error', message: 'Browser not connected' })` path in the `join` handler is replaced with an auto-launch of Default profile — same behavior as before, just no longer driven by a timer

---

### Task 5 — Update client + tools

**Implement in `client.ts`:** Each method sends the corresponding `ClientToDaemon` message and awaits the matching `DaemonToClient` response via a one-shot promise (same pattern as `ready`):
```ts
async openBrowser(profile?: string): Promise<void>  // sends open_browser, awaits browser_opened
async closeBrowser(): Promise<void>                  // sends close_browser, awaits browser_closed
async listProfiles(): Promise<ChromeProfile[]>       // sends list_profiles, awaits profiles
```

**Implement in `tools.ts`:** Register 3 new tool definitions with proper JSON schema and wire to client methods.

**Full suite check:** `bun test`

---

### Task 6 — Update skill

**Implement:** Update `skills/user-browser/SKILL.md` workflow section:
```
1. list_profiles()                          → show user the available profiles
2. [ask user which profile to use]
3. open_browser({ profile: "Work" })        → launches Chrome with that profile
4. navigate / screenshot / interact ...
5. close_browser()                          → kills that Chrome instance
```

Add note: if user doesn't specify a profile, use `open_browser()` with no arg (Default).
