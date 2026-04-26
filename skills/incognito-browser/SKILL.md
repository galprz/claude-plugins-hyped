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
| `navigate` | `url` | waits for page load |
| `screenshot` | `save_to?` | inline image + saved file if save_to provided |
| `click` | `x`, `y` | coordinates |
| `type` | `text` | types into focused element |
| `key` | `key` (e.g. `"Enter"`) | keyboard press |
| `scroll` | `x`, `y`, `deltaY` | scroll wheel |
| `eval` | `expression` | returns JSON-stringified result |
| `record_start` | `output_path` | resets browser — navigate AFTER |
| `record_stop` | — | returns MP4 path |
