import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule: Schedule;
  chat_id: number;
  thread_id: number | null;
  enabled: boolean;
  status: 'active' | 'paused' | 'completed' | 'disabled';
  timezone: string | null;
  created_by_user_id: number;
  next_run: string;
  last_run: string | null;
  consecutive_errors: number;
  last_error: string | null;
  created_at: string;
  project_dir: string | null;  // null = use job home dir at ~/.hyped/cron/jobs/{id}/
  is_heartbeat: boolean;
}

export type Schedule =
  | { type: 'cron'; expr: string }
  | { type: 'every'; seconds: number }
  | { type: 'once'; at: string };

function globalJobsPath(): string {
  return join(homedir(), '.hyped', 'cron', 'jobs.json');
}

export function loadJobs(): CronJob[] {
  try {
    const raw: CronJob[] = JSON.parse(readFileSync(globalJobsPath(), 'utf8'));
    return raw.map(j => ({ ...j, is_heartbeat: j.is_heartbeat ?? false }));
  } catch {
    return [];
  }
}

export function saveJobs(jobs: CronJob[]): void {
  const path = globalJobsPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf8');
  renameSync(tmp, path);
}
