const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface WorkspaceResult {
  worktree_path: string;
  branch: string;
  title: string;
}

export async function handleWorkspaceSet(args: {
  name: string;
  chat_id: number;
}): Promise<string> {
  if (!KEBAB_RE.test(args.name)) {
    throw new Error(
      `invalid_name: "${args.name}" is not valid kebab-case. Use only lowercase letters, numbers, and hyphens (e.g. "auth-system", "fix-login"). Choose a valid name and retry.`
    );
  }

  const daemonUrl = process.env.HYPED_DAEMON_URL ?? 'http://localhost:7891';
  const resp = await fetch(`${daemonUrl}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: args.chat_id, name: args.name }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `workspace_set failed (${resp.status}): ${text}. If the name is already taken, choose a different one and retry.`
    );
  }

  const data = await resp.json() as WorkspaceResult;
  return [
    `Workspace ready:`,
    `- Branch: ${data.branch}`,
    `- Path:   ${data.worktree_path}`,
    `- Title:  ${data.title}`,
  ].join('\n');
}
