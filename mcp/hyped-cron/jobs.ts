import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
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
  workspace_mode: 'project' | 'isolated';
  job_working_dir: string | null;
}

export type Schedule =
  | { type: 'cron'; expr: string }
  | { type: 'every'; seconds: number }
  | { type: 'once'; at: string };

function jobsPath(workingDir: string): string {
  return join(workingDir, '.hyped', 'cron', 'jobs.json');
}

export function loadJobs(workingDir: string): CronJob[] {
  const path = jobsPath(workingDir);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

export function saveJobs(workingDir: string, jobs: CronJob[]): void {
  const path = jobsPath(workingDir);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf8');
  renameSync(tmp, path);
}
