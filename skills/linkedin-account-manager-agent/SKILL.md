---
name: linkedin-account-manager-agent
description: Use when acting as a LinkedIn manager — browsing the feed, surfacing interesting posts, saving posts, or performing any authenticated LinkedIn action on behalf of the user.
---

# LinkedIn Account Manager Agent

Manages the user's LinkedIn account via the `agent-browser` CLI connected to the Hyped Chrome profile (authenticated session).

---

## Prerequisites — Hyped Chrome Must Be Running

```bash
# Check
curl -s http://localhost:9223/json/version > /dev/null 2>&1 && echo "running" || echo "not running"

# If not running, launch it
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

Then connect:

```bash
agent-browser connect 9223
```

---

## Action: Open the Feed

```bash
agent-browser open https://www.linkedin.com/feed/
sleep 3
agent-browser screenshot /tmp/linkedin_feed.png
```

---

## How LinkedIn's Feed Works (Lazy Loading)

**Critical architecture facts discovered through live inspection:**

- `<body>` is `overflow: hidden` — the page does NOT scroll
- `<main>` is the real scroller (`overflow: scroll`, scrollHeight grows dynamically)
- LinkedIn uses **IntersectionObserver** on a sentinel element near the bottom of loaded content
- When the sentinel enters the `<main>` viewport, it fires an XHR for the next batch of posts
- Each batch adds ~5000–6000px to scrollHeight (about 5–8 posts)
- The scroll events fired by `scrollTo({behavior: 'smooth'})` are `isTrusted: true` — safe

**Scroll event profile (measured):**
- ~66 events per 600px scroll
- Event interval: 6–16ms (GPU frame cadence)
- Natural ease-in-out curve: [0.5, 1, 3, 6.5, 11...38...11, 6.5, 3, 1] px/frame
- All events: `isTrusted: true`

**Bot detection signals (verified safe in Hyped Chrome):**
- `navigator.webdriver` → `false` ✓
- `navigator.plugins.length` → 5 ✓
- `navigator.hardwareConcurrency` → 14 ✓
- `isTrusted` on scroll events → `true` ✓

---

## Action: Human-Like Scrolling (Anti-Detection)

**Never use `agent-browser scroll down X` for feed browsing** — it fires no detectable scroll events on `<main>` and may look robotic. Instead, inject the human scroll engine:

### Step 1 — Install the engine (once per session)

```bash
agent-browser eval "
;(function() {
  const main = document.querySelector('main')
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  async function humanScroll(totalDistance) {
    let scrolled = 0
    const startTop = main.scrollTop

    while (scrolled < totalDistance) {
      const remaining = totalDistance - scrolled
      const chunkMin = Math.min(200, remaining)
      const chunkMax = Math.min(700, remaining)
      const chunk = randInt(chunkMin, chunkMax)

      // Slow down near sentinel zone to let lazy loading fire cleanly
      const distToBottom = main.scrollHeight - main.scrollTop - main.clientHeight
      const amount = distToBottom < 800 ? Math.min(chunk, distToBottom - 100) : chunk
      if (amount <= 0) break

      // Smooth scroll with native browser easing (isTrusted: true)
      main.scrollTo({ top: main.scrollTop + amount, behavior: 'smooth' })
      scrolled += amount

      // Wait for smooth scroll animation to complete
      await sleep(600 + randInt(0, 200))

      // 10% chance: scroll back a little (humans re-read)
      if (Math.random() < 0.10) {
        main.scrollTo({ top: main.scrollTop - randInt(50, 150), behavior: 'smooth' })
        await sleep(400 + randInt(0, 300))
        scrolled -= 100
      }

      // Reading pause — longer for larger chunks (simulates reading)
      await sleep(randInt(1500, Math.min(6000, 1500 + chunk * 5)))
    }

    return { finalScrollTop: main.scrollTop, covered: main.scrollTop - startTop }
  }

  window.humanScroll = humanScroll
  window.getPostTexts = function() {
    return document.body.innerText.split('Feed post').slice(1).map(p => p.slice(0, 400).trim())
  }
  return 'engine ready, scrollTop=' + main.scrollTop
})()"
```

### Step 2 — Scroll and collect posts

```bash
# Scroll 2000px in a human-like way (takes ~20-30 seconds with reading pauses)
agent-browser eval "humanScroll(2000).then(r => { window.__scrollResult = r })"
sleep 25

# Collect results
agent-browser eval "JSON.stringify({ result: window.__scrollResult, posts: window.getPostTexts().length })"

# Read all post text
agent-browser eval "JSON.stringify(window.getPostTexts())"
```

**Typical output:** 15–20 posts per 2000px of scroll, scrollHeight grows automatically as lazy loading fires.

---

## Action: Read Feed Posts

After scrolling, extract all posts:

```bash
agent-browser eval "
document.body.innerText
  .split('Feed post')
  .slice(1)
  .map((p, i) => (i+1) + '. ' + p.slice(0, 300))
  .join('\n---\n')
"
```

Parse the result for: author name, post content, reaction count ("X others reacted").

---

## Action: Save a Post

LinkedIn's save flow uses the `...` control menu on each post.

**Step 1 — Find the menu button ref:**

```bash
agent-browser snapshot 2>&1 | grep -i "control menu\|save"
```

Returns refs like:
```
- button "Open control menu for post by Maor Shlomo" [expanded=false, ref=e40]
  menuitem "Save" [ref=e208]
```

**Step 2 — Click the control menu:**

```bash
agent-browser click @e40
sleep 1
```

**Step 3 — Click Save:**

```bash
agent-browser snapshot 2>&1 | grep -i "save"
# → menuitem "Save" [ref=e208]
agent-browser click @e208
sleep 1
```

Each post has its own `Open control menu for post by [Author]` button. Re-snapshot after each page update — refs change.

---

## Action: Screenshot and Send to Telegram

```bash
agent-browser screenshot /tmp/linkedin_shot.png
```

```
<media>/tmp/linkedin_shot.png</media>
```

---

## Digest Workflow

1. Open the feed
2. Install human scroll engine (Step 1 above)
3. Run `humanScroll(3000)` and wait ~35 seconds
4. Call `getPostTexts()` — returns all loaded posts
5. Rank by relevance to user's interests: AI, engineering, startups, Israel tech scene, LangTalks/language learning
6. Present top 3–5 with: **author**, **topic**, **why interesting**, **reaction count**
7. Save the top 1–2 picks using the save flow above

---

## Quick Reference

| Action | Method |
|---|---|
| Connect to Chrome | `agent-browser connect 9223` |
| Open feed | `agent-browser open https://www.linkedin.com/feed/` |
| Human scroll | `humanScroll(2000)` via eval (see engine above) |
| Read posts | `window.getPostTexts()` via eval |
| Find post menus | `agent-browser snapshot \| grep "control menu"` |
| Save post | Click `Open control menu` → `menuitem "Save"` |
| Screenshot | `agent-browser screenshot /tmp/shot.png` |

---

## Common Mistakes

- **Using `agent-browser scroll` for feed reading** — fires no scroll events on `<main>`, may miss lazy loading. Use `humanScroll()` via eval instead.
- **Not waiting after humanScroll** — sleep 25+ seconds after triggering the async scroll before reading posts.
- **Stale refs** — `@eN` refs reset after every scroll/update. Always re-snapshot before clicking.
- **Assuming content loaded** — check `window.getPostTexts().length` before parsing; if 0, scroll more.
- **Launching Chrome via agent-browser** — always launch manually with the flags above. agent-browser-launched Chrome adds `--enable-automation` which breaks Google login.
- **Scrolling too fast past sentinel** — LinkedIn needs ~500ms after the sentinel enters view to fire the XHR. The engine handles this automatically by slowing down when `distToBottom < 800`.
