import { randomUUID } from 'crypto';
import { type CronJob, loadJobs, saveJobs } from './jobs.ts';
import { computeNextRun, isTimeOfDay, parseSchedule, scheduleDisplay, validateTimezone } from './schedule.ts';
import { createIsolatedWorkspace, type AgentDef } from './workspace.ts';

function getContext(): { chatId: number; threadId: number | null; pluginRoot: string } {
  const chatIdStr = process.env.HYPED_CHAT_ID;
  if (!chatIdStr) throw new Error('HYPED_CHAT_ID must be set');
  const chatId = parseInt(chatIdStr, 10);
  if (isNaN(chatId)) throw new Error(`Invalid HYPED_CHAT_ID: ${chatIdStr}`);
  const threadIdStr = process.env.HYPED_THREAD_ID;
  const threadId = threadIdStr && threadIdStr !== '' ? parseInt(threadIdStr, 10) : null;
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? '';
  return { chatId, threadId, pluginRoot };
}

export async function handleCronCreate(args: {
  schedule: string;
  prompt: string;
  name?: string;
  timezone?: string;
  project_dir?: string;
  tools?: string[];
  instructions?: string;
  agents?: AgentDef[];
  is_heartbeat?: boolean;
}): Promise<string> {
  // Timezone enforcement — runs before any env/fs access
  if (isTimeOfDay(args.schedule) && !args.timezone) {
    throw new Error(
      `timezone_required: Schedule "${args.schedule}" fires at a specific time of day. ` +
      `Ask the user: "What timezone are you in? (e.g. America/New_York, Europe/London, Asia/Tokyo)" ` +
      `then retry cron_create with timezone: "<their answer>".`
    );
  }
  if (args.timezone && !validateTimezone(args.timezone)) {
    throw new Error(
      `invalid_timezone: "${args.timezone}" is not a valid IANA timezone. ` +
      `Common examples: America/New_York, Europe/London, Asia/Tokyo, Australia/Sydney.`
    );
  }

  const { chatId, threadId, pluginRoot } = getContext();
  const schedule = parseSchedule(args.schedule);
  const nextRun = computeNextRun(schedule, args.timezone);
  const id = randomUUID().replace(/-/g, '').slice(0, 8);
  const name = args.name ?? args.prompt.slice(0, 40);

  // Always provision the job workspace
  const jobWorkspacePath = await createIsolatedWorkspace(
    id,
    name,
    args.schedule,
    args.tools ?? [],
    args.instructions ?? '',
    pluginRoot,
    args.agents ?? [],
  );

  const job: CronJob = {
    id,
    name,
    prompt: args.prompt,
    schedule,
    chat_id: chatId,
    thread_id: threadId,
    enabled: true,
    status: 'active',
    timezone: args.timezone ?? null,
    created_by_user_id: 0,
    next_run: nextRun,
    last_run: null,
    consecutive_errors: 0,
    last_error: null,
    created_at: new Date().toISOString(),
    project_dir: args.project_dir ?? null,
    is_heartbeat: args.is_heartbeat ?? false,
  };

  // POST to daemon so it lands in the in-memory scheduler store
  const daemonUrl = process.env.HYPED_DAEMON_URL ?? 'http://localhost:7891';
  try {
    const res = await fetch(`${daemonUrl}/api/cron/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
    if (!res.ok) {
      // Daemon rejected it — fall back to direct file write so job isn't lost
      const jobs = loadJobs();
      jobs.push(job);
      saveJobs(jobs);
    }
  } catch {
    // Daemon unreachable — fall back to direct file write
    const jobs = loadJobs();
    jobs.push(job);
    saveJobs(jobs);
  }

  const contextInfo = args.project_dir
    ? `Project: ${args.project_dir}`
    : `Workspace: ${jobWorkspacePath}`;

  return [
    `✅ Job "${name}" created — ${scheduleDisplay(schedule)}`,
    `ID: ${id}`,
    `Next run: ${new Date(nextRun).toUTCString()}`,
    contextInfo,
  ].join('\n');
}

export async function handleCronList(): Promise<string> {
  const { chatId } = getContext();
  const jobs = loadJobs().filter(
    j => j.chat_id === chatId && j.status !== 'completed'
  );

  if (jobs.length === 0) {
    return 'No cron jobs for this chat. Use cron_create to add one.';
  }

  const lines = jobs.map(j => {
    const icon = j.status === 'active' ? '▶️' : j.status === 'paused' ? '⏸' : '❌';
    const next = new Date(j.next_run).toUTCString();
    const ctx = j.project_dir ? ` [project: ${j.project_dir}]` : ' [isolated]';
    return `${icon} [${j.id}] ${j.name}${ctx} — ${scheduleDisplay(j.schedule)}\n  Next: ${next}`;
  });

  return `Cron jobs for this chat:\n\n${lines.join('\n\n')}`;
}

export async function handleCronPause(id: string): Promise<string> {
  const { chatId } = getContext();
  // Resolve partial ID against current jobs
  const job = loadJobs().find(j => j.id.startsWith(id) && j.chat_id === chatId);
  if (!job) throw new Error(`Job "${id}" not found in this chat`);
  const daemonUrl = process.env.HYPED_DAEMON_URL ?? 'http://localhost:7891';
  const res = await fetch(`${daemonUrl}/api/cron/jobs/${job.id}/pause`, { method: 'POST' });
  if (!res.ok) throw new Error(`Daemon returned ${res.status}`);
  return `⏸ Job "${job.name}" paused.`;
}

export async function handleCronResume(id: string): Promise<string> {
  const { chatId } = getContext();
  const job = loadJobs().find(j => j.id.startsWith(id) && j.chat_id === chatId);
  if (!job) throw new Error(`Job "${id}" not found in this chat`);
  const daemonUrl = process.env.HYPED_DAEMON_URL ?? 'http://localhost:7891';
  const res = await fetch(`${daemonUrl}/api/cron/jobs/${job.id}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error(`Daemon returned ${res.status}`);
  return `▶️ Job "${job.name}" resumed.`;
}

export async function handleCronRemove(id: string): Promise<string> {
  const { chatId } = getContext();
  const job = loadJobs().find(j => j.id.startsWith(id) && j.chat_id === chatId);
  if (!job) throw new Error(`Job "${id}" not found in this chat`);
  const daemonUrl = process.env.HYPED_DAEMON_URL ?? 'http://localhost:7891';
  const res = await fetch(`${daemonUrl}/api/cron/jobs/${job.id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Daemon returned ${res.status}`);
  return `🗑 Job "${job.name}" deleted.`;
}

export async function handleCronRun(id: string): Promise<string> {
  const daemonUrl = process.env.HYPED_DAEMON_URL ?? 'http://localhost:7891';
  let res: Response;
  try {
    res = await fetch(`${daemonUrl}/api/cron/jobs/${id}/run`, { method: 'POST' });
  } catch (e) {
    throw new Error(`Daemon unreachable at ${daemonUrl}: ${e}`);
  }
  if (res.status === 404) throw new Error(`Job "${id}" not found`);
  if (!res.ok) throw new Error(`Daemon returned ${res.status}`);
  return `▶️ Job "${id}" fired immediately.`;
}
