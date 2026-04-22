---
name: restart-daemon
description: Use when the user asks to restart the daemon, rebuild hyped, or restart hyped
---

# restart-daemon

## How to restart

Run `restart.sh` from the hyped project root:

```bash
cd "${HYPED_ROOT:-$HOME/projects/hyped}" && bash restart.sh
```

This script:
1. Pulls the latest hyped plugin (`~/.hyped/plugins/claude-plugins-hyped`)
2. Builds `hyped-daemon` in release mode
3. Copies the binary to `~/.hyped/bin/hyped-daemon`
4. Restarts via `launchctl` (uses `~/Library/LaunchAgents/com.hyped.daemon.plist`)

## Success check

After the script completes, it prints `✓ hyped-daemon is running`. If it fails, check logs:

```bash
tail -f ~/.hyped/daemon.err
```

## Port

Daemon listens on `127.0.0.1:7891`.
