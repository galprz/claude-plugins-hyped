# Skill: use-local-tunnel

Use this skill when the user asks to **show**, **preview**, **share**, **expose**, or **open** something running locally.

## Available MCP Tools
- `tunnel_open({ local_url, name? })` — opens ngrok tunnel, returns `{ id, url, status }`
- `tunnel_close({ id })` — closes tunnel
- `tunnel_list()` — lists all open tunnels this session
- `tunnel_status({ id })` — checks a specific tunnel

The returned `url` has Basic Auth embedded using configured credentials:
`https://<NGROK_TUNNEL_USERNAME>:<NGROK_TUNNEL_PASSWORD>@<host>.ngrok-free.app`

Default username is `hyped` if `NGROK_TUNNEL_USERNAME` is not set.

## Sending the URL to the user — CRITICAL

**Always send the URL as a plain text message with no markdown or HTML formatting.**

Telegram auto-detects raw URLs and renders them as clickable links, preserving the embedded credentials. Wrapping the URL in markdown (`[text](url)`) or HTML (`<a href="url">`) causes Telegram to sanitize and strip the credentials — the link will appear but won't work.

✅ Correct — plain text only:
```
Here's your tunnel: https://hyped:mypassword@host.ngrok-free.app
```

❌ Wrong — markdown link (credentials get stripped by Telegram):
```
[Open Tunnel](https://hyped:mypassword@host.ngrok-free.app)
```

## One-Shot Pattern
Use for temporary previews (static files, quick demos):

1. Start the local server (e.g. `bun run start`, `python -m http.server 8080`)
2. Call `tunnel_open({ local_url: "http://localhost:<port>" })`
3. Send the raw URL to user as plain text: `Here's your preview: <url>`
4. When user is done, call `tunnel_close({ id })`

## Live Dashboard Pattern
Use for iterative UI work where the user wants to watch updates:

1. Scaffold a UI with the `local-ui` skill
2. Start the dev server: `bun run dev` (default: http://localhost:5173)
3. Call `tunnel_open({ local_url: "http://localhost:5173", name: "dashboard" })`
4. Send the raw URL to user as plain text: `Dashboard live: <url>`
5. Continue editing files — Vite HMR refreshes the browser automatically
6. Leave tunnel open until user explicitly asks to close it

## Rules
- Always pass the full URL with scheme: `http://localhost:PORT`
- Save the `id` from `tunnel_open` — you'll need it to close the tunnel later
- Tunnels only persist for the current Claude session
- If `NGROK_AUTHTOKEN` missing → tell user: "Add `NGROK_AUTHTOKEN=<your-token>` to `~/.hyped/.env`. Should I restart the daemon now?" — only run `launchctl kickstart -k gui/$(id -u)/com.hyped.daemon` after the user confirms
- If `NGROK_TUNNEL_PASSWORD` missing → tell user: "Add `NGROK_TUNNEL_PASSWORD=<password>` (and optionally `NGROK_TUNNEL_USERNAME=<username>`) to `~/.hyped/.env`. Should I restart the daemon now?"
- Get a free ngrok token at: https://dashboard.ngrok.com/get-started/your-authtoken
- Prefer one-shot for temporary previews; live dashboard for iterative UI work
