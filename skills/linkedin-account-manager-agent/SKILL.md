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

## Action: Read Feed Posts

Extract visible post text with:

```bash
agent-browser eval "document.body.innerText.slice(0, 5000)"
```

Repeat after scrolling to get more posts. Parse the result for author, content, and reaction counts to surface interesting items.

---

## Action: Scroll the Feed

```bash
agent-browser scroll down 1200
sleep 2
# Then read or screenshot again
```

Scroll in increments of 800–1500px. Use `sleep 2` after each scroll to allow lazy-loaded content to render.

---

## Action: Save a Post

LinkedIn's save flow uses the `...` control menu on each post.

**Step 1 — Get a snapshot to find the menu button ref:**

```bash
agent-browser snapshot 2>&1 | grep -i "control menu\|save"
```

This returns refs like:
```
- button "Open control menu for post by Maor Shlomo" [expanded=false, ref=e40]
```

**Step 2 — Click the control menu:**

```bash
agent-browser click @e40
sleep 1
```

**Step 3 — Click Save from the dropdown:**

```bash
# Find the Save menuitem ref
agent-browser snapshot 2>&1 | grep -i "save"
# Returns: menuitem "Save" [ref=e208]

agent-browser click @e208
sleep 1
```

Each post has its own `Open control menu for post by [Author]` button. Use `snapshot` + `grep` to locate the right ref per post.

---

## Action: Take a Screenshot and Send to Telegram

```bash
agent-browser screenshot /tmp/linkedin_shot.png
```

Then wrap in a media tag to deliver to Telegram:

```
<media>/tmp/linkedin_shot.png</media>
```

---

## Digest Workflow

When asked to surface interesting posts:

1. Open the feed
2. Read post text via `eval`
3. Scroll 2–3 times, collecting more posts each time
4. Identify posts relevant to user's interests (AI, engineering, startups, Israel tech scene)
5. Summarize the top 3–5 as a digest with: **author**, **topic**, **why it's interesting**, **reaction count**
6. Optionally save the most relevant ones

---

## Quick Reference

| Action | Command |
|---|---|
| Connect to Chrome | `agent-browser connect 9223` |
| Open feed | `agent-browser open https://www.linkedin.com/feed/` |
| Scroll down | `agent-browser scroll down 1200` |
| Read visible text | `agent-browser eval "document.body.innerText.slice(0, 5000)"` |
| Find post menus | `agent-browser snapshot 2>&1 \| grep -i "control menu"` |
| Open post menu | `agent-browser click @eN` |
| Save post | Click `Open control menu` → find `menuitem "Save"` → click it |
| Screenshot | `agent-browser screenshot /tmp/shot.png` |

---

## Common Mistakes

- **Wrong tab active** — after `connect`, always explicitly navigate to `https://www.linkedin.com/feed/`. Don't assume the current tab is the feed.
- **Stale refs** — snapshot refs (`@eN`) change after scrolling or page updates. Always re-snapshot before clicking.
- **No sleep after scroll** — LinkedIn lazy-loads content. Always `sleep 2` after scrolling before reading or snapshotting.
- **Launching Chrome via agent-browser** — never do this. Always launch Chrome manually with the flags above, then `connect`. Letting agent-browser launch Chrome adds `--enable-automation` which breaks Google login.
