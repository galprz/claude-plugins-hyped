import { describe, expect, test } from 'bun:test';
import { isTimeOfDay, validateTimezone } from './schedule.ts';

describe('isTimeOfDay', () => {
  test('cron with fixed hour is time-of-day', () => expect(isTimeOfDay('0 8 * * *')).toBe(true));
  test('cron with fixed hour and days is time-of-day', () => expect(isTimeOfDay('30 14 * * 1-5')).toBe(true));
  test('cron with wildcard hour is NOT time-of-day', () => expect(isTimeOfDay('* * * * *')).toBe(false));
  test('"every 2h" is NOT time-of-day', () => expect(isTimeOfDay('every 2h')).toBe(false));
  test('"every 30m" is NOT time-of-day', () => expect(isTimeOfDay('every 30m')).toBe(false));
  test('"in 30m" is NOT time-of-day', () => expect(isTimeOfDay('in 30m')).toBe(false));
  test('ISO datetime string is NOT time-of-day', () => expect(isTimeOfDay('2026-05-01T09:00:00Z')).toBe(false));
});

describe('validateTimezone', () => {
  test('America/New_York is valid', () => expect(validateTimezone('America/New_York')).toBe(true));
  test('Europe/London is valid', () => expect(validateTimezone('Europe/London')).toBe(true));
  test('UTC is valid', () => expect(validateTimezone('UTC')).toBe(true));
  test('Foo/Bar is invalid', () => expect(validateTimezone('Foo/Bar')).toBe(false));
  test('empty string is invalid', () => expect(validateTimezone('')).toBe(false));
  test('random word is invalid', () => expect(validateTimezone('EST')).toBe(false));
});
