export interface SetGroupNameResult {
  title: string;
}

export async function handleSetGroupName(args: {
  name: string;
  chat_id: number;
}): Promise<string> {
  const daemonUrl = process.env.HYPED_DAEMON_URL ?? 'http://localhost:7891';
  const resp = await fetch(`${daemonUrl}/api/set-group-name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: args.chat_id, name: args.name }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `set_group_name failed (${resp.status}): ${text}`
    );
  }

  const data = await resp.json() as SetGroupNameResult;
  return `Group name set to: ${data.title}`;
}
