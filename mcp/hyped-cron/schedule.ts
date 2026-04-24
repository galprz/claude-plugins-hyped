import type { Schedule } from './jobs.ts';

const DURATION_RE = /^(\d+)(s|m|h|d)$/;

function parseDuration(s: string): number | null {
  const m = DURATION_RE.exec(s);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n === 0) return null;
  const unit = m[2];
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  if (unit === 'd') return n * 86400;
  return null;
}

const CRON_RE = /^(\S+\s+){4}\S+$/;

export function parseSchedule(s: string): Schedule {
  s = s.trim();

  // "in Xm/h/d" — one-shot
  if (s.startsWith('in ')) {
    const secs = parseDuration(s.slice(3).trim());
    if (secs === null) throw new Error(`Invalid duration: ${s}`);
    const at = new Date(Date.now() + secs * 1000).toISOString();
    return { type: 'once', at };
  }

  // "every Xm/h/d"
  if (s.startsWith('every ')) {
    const secs = parseDuration(s.slice(6).trim());
    if (secs === null) throw new Error(`Invalid interval: ${s}`);
    return { type: 'every', seconds: secs };
  }

  // ISO datetime
  if (s.includes('T') && !isNaN(Date.parse(s))) {
    return { type: 'once', at: new Date(s).toISOString() };
  }

  // 5-field cron
  if (CRON_RE.test(s)) {
    return { type: 'cron', expr: s };
  }

  throw new Error(`Cannot parse schedule: "${s}". Use "every 2h", "0 9 * * *", or "in 30m".`);
}

export function computeNextRun(schedule: Schedule, timezone?: string | null): string {
  const now = new Date();

  if (schedule.type === 'once') {
    return schedule.at;
  }

  if (schedule.type === 'every') {
    return new Date(now.getTime() + schedule.seconds * 1000).toISOString();
  }

  // Cron — use simple next-minute approximation (daemon handles real scheduling)
  // The daemon's Rust cron parser computes accurate next_run on load
  // We just need a reasonable placeholder here
  const next = new Date(now.getTime() + 60 * 1000);
  return next.toISOString();
}

export function scheduleDisplay(schedule: Schedule): string {
  if (schedule.type === 'once') {
    return `once at ${new Date(schedule.at).toUTCString()}`;
  }
  if (schedule.type === 'every') {
    const s = schedule.seconds;
    if (s % 86400 === 0) return `every ${s / 86400}d`;
    if (s % 3600 === 0) return `every ${s / 3600}h`;
    if (s % 60 === 0) return `every ${s / 60}m`;
    return `every ${s}s`;
  }
  return `cron: ${schedule.expr}`;
}

// A schedule fires at a specific time-of-day if it is a 5-field cron expr
// with a non-wildcard hour field (field index 1).
// Interval ("every Xh"), one-shot ("in Xm"), and ISO datetimes are not time-of-day.
export function isTimeOfDay(s: string): boolean {
  s = s.trim();
  if (s.startsWith('every ') || s.startsWith('in ') || s.includes('T')) return false;
  const parts = s.split(/\s+/);
  if (parts.length !== 5) return false;
  const hour = parts[1];
  return hour !== '*';
}

// Validate IANA timezone using the runtime's built-in list.
export function validateTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] })
      .supportedValuesOf('timeZone')
      .includes(tz);
  } catch {
    return false;
  }
}
