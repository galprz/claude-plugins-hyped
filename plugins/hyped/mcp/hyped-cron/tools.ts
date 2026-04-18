import { randomUUID } from 'crypto';
import { type CronJob, loadJobs, saveJobs } from './jobs.ts';
import { computeNextRun, parseSchedule, scheduleDisplay } from './schedule.ts';

function getContext(): { chatId: number; threadId: number | null; workingDir: string } {
  const chatIdStr = process.env.HYPED_CHAT_ID;
  const workingDir = process.env.HYPED_WORKING_DIR;
  if (!chatIdStr || !workingDir) {
    throw new Error('HYPED_CHAT_ID and HYPED_WORKING_DIR must be set');
  }
  const chatId = parseInt(chatIdStr, 10);
  if (isNaN(chatId)) throw new Error(`Invalid HYPED_CHAT_ID: ${chatIdStr}`);
  const threadIdStr = process.env.HYPED_THREAD_ID;
  const threadId = threadIdStr && threadIdStr !== '' ? parseInt(threadIdStr, 10) : null;
  return { chatId, threadId, workingDir };
}

export async function handleCronCreate(args: {
  schedule: string;
  prompt: string;
  name?: string;
  timezone?: string;
}): Promise<string> {
  const { chatId, threadId, workingDir } = getContext();
  const schedule = parseSchedule(args.schedule);
  const nextRun = computeNextRun(schedule, args.timezone);
  const id = randomUUID().replace(/-/g, '').slice(0, 8);
  const name = args.name ?? args.prompt.slice(0, 40);

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
  };

  const jobs = loadJobs(workingDir);
  jobs.push(job);
  saveJobs(workingDir, jobs);

  return `✅ Job "${name}" created — ${scheduleDisplay(schedule)}\nID: ${id}\nNext run: ${new Date(nextRun).toUTCString()}`;
}

export async function handleCronList(): Promise<string> {
  const { chatId, workingDir } = getContext();
  const jobs = loadJobs(workingDir).filter(
    j => j.chat_id === chatId && j.status !== 'completed'
  );

  if (jobs.length === 0) {
    return 'No cron jobs for this chat. Use cron_create to add one.';
  }

  const lines = jobs.map(j => {
    const icon = j.status === 'active' ? '▶️' : j.status === 'paused' ? '⏸' : '❌';
    const next = new Date(j.next_run).toUTCString();
    return `${icon} [${j.id}] ${j.name} — ${scheduleDisplay(j.schedule)}\n  Next: ${next}`;
  });

  return `Cron jobs for this chat:\n\n${lines.join('\n\n')}`;
}

export async function handleCronPause(id: string): Promise<string> {
  const { chatId, workingDir } = getContext();
  const jobs = loadJobs(workingDir);
  const job = jobs.find(j => j.id.startsWith(id) && j.chat_id === chatId);
  if (!job) throw new Error(`Job "${id}" not found in this chat`);
  job.status = 'paused';
  job.enabled = false;
  saveJobs(workingDir, jobs);
  return `⏸ Job "${job.name}" paused.`;
}

export async function handleCronResume(id: string): Promise<string> {
  const { chatId, workingDir } = getContext();
  const jobs = loadJobs(workingDir);
  const job = jobs.find(j => j.id.startsWith(id) && j.chat_id === chatId);
  if (!job) throw new Error(`Job "${id}" not found in this chat`);
  job.status = 'active';
  job.enabled = true;
  job.consecutive_errors = 0; // reset on manual resume
  saveJobs(workingDir, jobs);
  return `▶️ Job "${job.name}" resumed.`;
}

export async function handleCronRemove(id: string): Promise<string> {
  const { chatId, workingDir } = getContext();
  const jobs = loadJobs(workingDir);
  const idx = jobs.findIndex(j => j.id.startsWith(id) && j.chat_id === chatId);
  if (idx === -1) throw new Error(`Job "${id}" not found in this chat`);
  const name = jobs[idx].name;
  jobs.splice(idx, 1);
  saveJobs(workingDir, jobs);
  return `🗑 Job "${name}" deleted.`;
}
