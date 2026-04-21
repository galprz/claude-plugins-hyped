---
name: chrome-bridge
description: Use when browsing the web, scraping content, or recording a browser session to send via Telegram.
---

# chrome-bridge

## Overview
Controls your real running Chrome via a Chrome extension + relay daemon.
Tools are available directly as MCP tools — no shell commands needed.

**Prerequisite:** Chrome must be open with the Hyped Chrome Tool extension loaded from `tools/chrome-tool/extension/dist/`. The relay daemon auto-starts when any tool is called.

---

## Full Workflow

```
1. navigate({ url: "https://example.com", new_tab: true })  → opens in new tab
2. get_tabs()                                                → find tab IDs
3. switch_tab({ tabId: "123" })                             → attach debugger + focus
4. record_start({ output_path: "/tmp/session.mp4" })
5. screenshot()                           → Read the returned image to see the page
6. scroll({ x: 640, y: 400, deltaY: 500 })
7. click({ x: 640, y: 400 })             → interact
8. type({ text: "search query" })
9. key({ key: "Enter" })
10. eval({ expression: "document.title" }) → extract data
11. focus_tab()                            → bring Chrome window to front
12. record_stop()                          → returns MP4 path
```

Then emit the video using the media tag:
```
<media>/tmp/session.mp4</media>
```

---

## Tool Reference

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `navigate` | `url`, `new_tab` (optional bool) | confirmation string |
| `screenshot` | — | image (base64 JPEG, rendered inline) |
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

---

## Notes
- Use `<media>/path/to/file</media>` to deliver files to Telegram
- If tools return `"browser not connected"` — reload the Hyped Chrome Tool extension in `chrome://extensions`, then retry
- The relay daemon auto-starts if not running; Chrome also launches automatically if not open
