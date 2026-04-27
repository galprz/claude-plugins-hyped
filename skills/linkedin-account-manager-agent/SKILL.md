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

## Action: Record a Human-Like Scroll Session

Use this to produce a video of natural feed browsing (looks indistinguishable from a real user).

```bash
# 1. Start recording
agent-browser connect 9223
agent-browser record start /tmp/linkedin_scroll.webm

# 2. Open the feed
agent-browser open https://www.linkedin.com/feed/
# wait 4 seconds for feed to render (important — content loads async)
```

Then install and trigger the humanScroll engine (async):

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
      const chunk = randInt(Math.min(200, remaining), Math.min(700, remaining))
      const distToBottom = main.scrollHeight - main.scrollTop - main.clientHeight
      const amount = distToBottom < 800 ? Math.min(chunk, distToBottom - 100) : chunk
      if (amount <= 0) break
      main.scrollTo({ top: main.scrollTop + amount, behavior: 'smooth' })
      scrolled += amount
      await sleep(600 + randInt(0, 200))
      if (Math.random() < 0.10) {
        main.scrollTo({ top: main.scrollTop - randInt(50, 150), behavior: 'smooth' })
        await sleep(400 + randInt(0, 300))
        scrolled -= 100
      }
      await sleep(randInt(1500, Math.min(6000, 1500 + chunk * 5)))
    }
    window.__done = { finalScrollTop: main.scrollTop, covered: main.scrollTop - startTop }
  }
  humanScroll(3500)
})()"
```

Wait for scroll to finish, then stop recording and convert:

```bash
# Poll until scroll completes (takes 40-90 seconds for 3500px)
until agent-browser eval "JSON.stringify(!!window.__done)" | grep -q "true"; do sleep 3; done

agent-browser record stop

# Convert webm → mp4 (Telegram requires mp4)
ffmpeg -i /tmp/linkedin_scroll.webm -c:v libx264 -preset fast -crf 23 -c:a aac /tmp/linkedin_scroll.mp4 -y
```

Send to Telegram:
```
<media>/tmp/linkedin_scroll.mp4</media>
```

**Result:** ~4.5MB mp4, looks like a real human browsing — smooth easing, variable pauses, occasional back-scrolls, lazy loading firing naturally.

---

## Post Quality Filter — Valuable vs Agenda

Before including any post in the digest, score it against these rules. **A post must pass the value checklist AND fail the agenda checklist to be included.**

### Value signals (need at least 2)
- ✅ Author is a **practitioner** — engineer, PM, researcher, operator — NOT the founder/CEO of the product they're discussing
- ✅ Contains **honest limitations or failures** ("the first approach failed", "this didn't work as expected")
- ✅ **Technical specificity** — real experiment, comparison, numbers, before/after, architecture decision
- ✅ **Curating someone else's work** with genuine synthesis (not just resharing with "great post!")
- ✅ **Strong contrarian opinion** with reasoning, not just a hot take
- ✅ Written in **first person about their own direct experience** (not about their company's success)

### Agenda signals (any one = reject)
- ❌ Author is **founder/CEO talking about their own product** — even if the insight sounds real
- ❌ **"We just shipped / proud to announce / thrilled to share"** — product launch framing
- ❌ **Company page post** — always agenda, never value
- ❌ **"Follow me for more"** or engagement bait at the end
- ❌ **Inspirational journey story** — "it took us X years to get here...", milestone posts, "we just expanded to the US"
- ❌ **Startup CEO personal narrative** — any CEO/founder sharing their company's growth, struggles, or achievements as a story, even when written in first person and emotionally resonant
- ❌ **Promoted / Suggested** label — paid placement, skip always
- ❌ **Numbered list of generic wisdom** with no specifics — "5 rules for success as a CEO"
- ❌ **VC/fund promoting their own report or portfolio**

### Real examples (calibrated from user feedback)

| Post | Verdict | Why |
|------|---------|-----|
| Gal Vered (Checksum founder) on background agents | ❌ Agenda | Founder subtly positioning own product, even though insight sounds real |
| Zohar Einy (Port.io CEO) on skills library | ❌ Agenda | "How WE built it" = case study = marketing |
| Anthony Kroeger (engineer @ Lyra) on GPT 5.5 vs Opus | ✅ Value | Practitioner, honest comparison, no product to sell, strong specific take |
| Roi Shikler (PM @ Band) summarizing Claude CAD experiment | ✅ Value | Curating someone else's work, honest about failure, technical depth |
| Maor Shlomo (Base44 founder) on SEO/GEO launch | ❌ Agenda | Founder announcing own product |
| Endrit Restelica (8M followers) on AI democratizing building | ❌ Agenda | Personal brand fluff, "follow me for more" |
| Abrem A. (Police Captain) on Axon DFR | ❌ Out of interest | Field-relevant but public safety ops not in user's interest zone |
| Ori Nurieli (CEO @ StudyWise) "TLV to San Diego took 14 hours, for us 2 years" | ❌ Agenda | Startup CEO milestone story — emotionally written but purely self-promotional narrative |

---

## Digest Workflow

1. Open the feed
2. Install human scroll engine (Step 1 above)
3. Run `humanScroll(3000)` and wait ~35 seconds
4. Call `getPostTexts()` — returns all loaded posts
5. Apply the **Post Quality Filter** above to every post — reject anything with even one agenda signal
6. From what passes, rank by relevance: AI agents, LLMs, dev tools, engineering, Israel tech scene, NLP/language learning
7. Present top 3–5 with: **author + role**, **key insight in 2 sentences**, **why it's valuable**, **reaction count**
8. Save the top 1–2 picks using the save flow above

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
