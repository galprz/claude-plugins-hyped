---
name: user-browser
description: Use when the page requires authentication or you need the user's existing cookies/session. Use incognito-browser for public pages.
---

# user-browser

## Overview
Controls your real running Chrome with the user's existing session and cookies.
Use incognito-browser for public pages that don't require authentication.
Tools are available directly as MCP tools — no shell commands needed.

**Prerequisite:** The Hyped Chrome extension must be loaded from `tools/chrome-tool/extension/dist/`. The relay daemon auto-starts when any tool is called.

---

## Full Workflow

```
1. list_profiles()                          → get available profiles
   - If only "Default" exists: skip asking, go to step 3 with no profile arg
   - Otherwise: show user the list and ask which profile to use
2. [User picks a profile]
3. open_browser({ profile: "Work" })        → launches Chrome with that profile
   OR open_browser()                        → launches with Default profile
4. navigate({ url: "https://example.com", new_tab: true })  → opens in new tab
5. get_tabs()                               → find tab IDs
6. switch_tab({ tabId: "123" })             → attach debugger + focus
7. screenshot()                             → Read the returned image to see the page
8. scroll / click / type / key / eval ...   → interact with the page
9. focus_tab()                              → bring Chrome window to front
10. close_browser()                         → kills that Chrome instance
```

> If `open_browser` returns a "Profile not found" error, call `list_profiles()` again to show current options and ask the user to pick one.

For recording, wrap steps 4–9 with:
```
record_start({ output_path: "/tmp/session.mp4" })
... interact ...
record_stop()   → returns MP4 path
<media>/tmp/session.mp4</media>
```

---

## Tool Reference

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `list_profiles` | — | Text list of `{name, directory}` for all Chrome profiles |
| `open_browser` | `profile?` (display name or dir, e.g. `"Work"`) | Launches Chrome; kills existing instance first if open |
| `close_browser` | — | Kills the Chrome instance launched by `open_browser` |
| `navigate` | `url`, `new_tab` (optional bool) | confirmation string |
| `screenshot` | `save_to?` (e.g. `/tmp/shot.jpg`) | image (base64 JPEG, rendered inline); if `save_to` provided, also writes JPEG to that path — use `<media>` tag to send it to Telegram |
| `eval` | `expression` | JSON result string |
| `click` | `x`, `y` | confirmation string |
| `type` | `text` | confirmation string |
| `key` | `key` (e.g. `"Enter"`, `"Tab"`) | confirmation string |
| `scroll` | `x`, `y`, `deltaY` | confirmation string |
| `get_tabs` | — | JSON array of `{targetId, title, url}` (excludes chrome:// tabs) |
| `switch_tab` | `tabId` | re-attaches debugger to tab + focuses it |
| `focus_tab` | — | brings Chrome window to foreground |
| `record_start` | `output_path` | confirmation string |
| `record_stop` | — | MP4 file path |

---

## Key Behaviours

**Tabs opened with `new_tab: true`** are NOT under debugger control until you call `switch_tab` on them. Always `switch_tab` before using `scroll`, `click`, `eval`, etc.

**`switch_tab`** does three things at once: detaches debugger from old tab, attaches to new tab, and focuses the window. After calling it, all CDP commands go to the new tab.

**`navigate` without `new_tab`** navigates within the current session tab. Use this when you want to stay in one tab.

**`open_browser` called twice** kills the existing Chrome instance before launching the new one — no dangling processes.

---

## Notes
- Use `<media>/path/to/file</media>` to deliver files to Telegram
- If tools return `"browser not connected"` — call `open_browser()` to launch Chrome, then retry
- The relay daemon auto-starts if not running
