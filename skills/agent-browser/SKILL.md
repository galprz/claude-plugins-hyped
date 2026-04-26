---
name: agent-browser
description: The only browser tool. Use for all browser tasks — authenticated pages, scraping, screenshots, recording. Two modes: Hyped profile (user's real session with injected cookies) or headless (clean, no state).
---

# agent-browser

**The single browser tool for all tasks.** Replaces both `user-browser` and `incognito-browser`.

Uses the `agent-browser` CLI directly via shell — no MCP server, no Chrome extension, no daemon.

---

## Which mode to use

| Use **Hyped mode** | Use **Headless mode** |
|---|---|
| Page requires login | Public page / scraping |
| Need user's cookies/session | Autonomous background tasks |
| Interacting as the user | Clean isolated session |
| Recording authenticated flows | One-off screenshots |

---

## Mode 1 — Hyped Profile (authenticated)

The Hyped profile lives at `~/.hyped-browser/` — a dedicated Chrome user-data-dir with cookies imported from Arc/Chrome via the key manager wizard.

### Step 1 — Ensure Hyped Chrome is running

```bash
# Check if Chrome is up on CDP port 9223
curl -s http://localhost:9223/json/version > /dev/null 2>&1
```

**If NOT running** — launch it:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9223 \
  --remote-allow-origins="*" \
  --user-data-dir="$HOME/.hyped-browser" \
  --no-first-run \
  --no-default-browser-check \
  > /dev/null 2>&1 &

# Wait for CDP
for i in $(seq 1 20); do
  curl -s http://localhost:9223/json/version > /dev/null 2>&1 && break
  sleep 0.5
done
```

> **NEVER launch Chrome with `--enable-automation`, `--use-mock-keychain`, or `--disable-extensions`** — these flags cause Google to block sign-in with "Couldn't sign you in".

### Step 2 — Check if onboarding is needed

If `~/.hyped-browser/Default/Cookies` is missing or empty, cookies haven't been imported yet. Run the key manager wizard:

```bash
ls ~/.hyped-browser/Default/Cookies 2>/dev/null || bash ~/hyped-browser/key-manager/run.sh
```

The wizard (at `http://localhost:7474`) walks through:
1. Enter macOS password → unlocks Keychain, derives AES keys for Arc + Chrome
2. Pick browser profiles and domains to import
3. Click Import → injects cookies via CDP into Hyped Chrome
4. Click Launch → wizard closes

Wait for the user to complete the wizard before continuing.

### Step 3 — Connect agent-browser

```bash
agent-browser connect 9223
```

This attaches agent-browser to the running Hyped Chrome **without relaunching it** (no automation flags injected). All subsequent commands go to that Chrome window.

### Step 4 — Use normally

```bash
agent-browser open https://linkedin.com
agent-browser screenshot /tmp/shot.png
agent-browser snapshot           # accessibility tree for AI navigation
agent-browser click @e3
agent-browser type @e5 "hello"
agent-browser eval "document.title"
```

---

## Mode 2 — Headless (clean session)

No profile, no cookies, no state. Default is headless — browser is invisible.

```bash
# Navigate and screenshot
agent-browser open https://example.com
agent-browser screenshot /tmp/shot.png

# Headed (visible window) — useful for debugging
agent-browser --headed open https://example.com

# Scrape content
agent-browser open https://example.com
agent-browser eval "document.body.innerText"

# Record a session
agent-browser record start /tmp/session.webm
agent-browser open https://example.com
agent-browser click @e2
agent-browser record stop
```

> Headless mode starts a fresh Chromium instance automatically — no setup needed.

---

## Common Patterns

### Screenshot and send to Telegram
```bash
agent-browser open https://example.com
agent-browser screenshot /tmp/shot.png
# Then: <media>/tmp/shot.png</media>
```

### Scrape structured data
```bash
agent-browser open https://example.com
agent-browser eval "JSON.stringify([...document.querySelectorAll('h2')].map(h => h.textContent))"
```

### Record a session (WebM, ~10fps)
```bash
agent-browser record start /tmp/session.webm
agent-browser open https://example.com
# ... interact ...
agent-browser record stop
# Then: <media>/tmp/session.webm</media>
```

### Navigate with AI-readable snapshot
```bash
agent-browser open https://example.com
agent-browser snapshot        # returns accessibility tree with @eN refs
agent-browser click @e4       # click by ref
agent-browser fill @e7 "text" # fill input by ref
```

---

## Full Command Reference

```bash
# Navigation
agent-browser open <url>
agent-browser back / forward / reload

# Connection
agent-browser connect <port|url>     # attach to existing Chrome
agent-browser close [--all]          # close session or all browsers

# Interaction
agent-browser click <sel|@ref|x,y>
agent-browser type <sel|@ref> <text>
agent-browser fill <sel|@ref> <text> # clear then fill
agent-browser press <key>            # Enter, Tab, Escape, Control+a ...
agent-browser scroll <up|down> [px]
agent-browser hover <sel|@ref>

# Inspection
agent-browser snapshot               # accessibility tree with @eN refs
agent-browser screenshot [path]      # PNG/JPEG, inline if no path
agent-browser eval <js>              # run JS, returns JSON
agent-browser get url / title / text / html

# Recording
agent-browser record start <path>    # WebM video
agent-browser record stop

# Flags
--headed                             # visible window (default: headless)
--cdp <port>                         # connect to specific CDP port
--profile <name|path>                # use Chrome profile
--session-name <name>                # persist/restore auth state by name
```

---

## Key Rules

1. **Hyped Chrome = connect, never launch via agent-browser** — always start Chrome yourself with the flags above, then `agent-browser connect 9223`. If you let agent-browser launch it, it adds `--enable-automation` which breaks Google.

2. **Check CDP before connecting** — if `curl -s http://localhost:9223/json/version` fails, Chrome isn't running yet. Launch it first.

3. **One-time Google login** — Google uses Device Bound Session Credentials (DBSC); cookies alone don't restore Google sessions. Sign in once manually in the Hyped Chrome window. All other sites (LinkedIn, GitHub, Notion, etc.) work via cookie import automatically.

4. **Headless is the default** — for public pages and background tasks, skip the Hyped Chrome setup entirely and just run `agent-browser open <url>` directly.

5. **Snapshots beat coordinates** — prefer `agent-browser snapshot` + `@eN` refs over pixel coordinates. Refs survive layout changes; coordinates don't.
