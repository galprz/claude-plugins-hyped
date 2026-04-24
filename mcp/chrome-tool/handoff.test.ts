import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { detectTailscaleIP, SessionRecorder } from './handoff'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

// ---- detectTailscaleIP ----

describe('detectTailscaleIP', () => {
  test('returns string starting with 100. or null', () => {
    const ip = detectTailscaleIP()
    if (ip !== null) {
      expect(ip).toMatch(/^100\.\d+\.\d+\.\d+$/)
    } else {
      expect(ip).toBeNull()
    }
  })
})

// ---- SessionRecorder ----

describe('SessionRecorder', () => {
  let dir: string
  let recorder: SessionRecorder

  beforeEach(() => {
    dir = join(tmpdir(), `handoff-test-${randomBytes(4).toString('hex')}`)
    recorder = new SessionRecorder(dir)
  })

  afterEach(() => {
    // cleanup handled by OS tmpdir rotation
  })

  test('creates sessionDir on construction', () => {
    expect(existsSync(dir)).toBe(true)
  })

  test('logAction appends timestamped entry to log.txt', () => {
    recorder.logAction('click(100,200)')
    recorder.logAction('type("hello")')
    const log = readFileSync(join(dir, 'log.txt'), 'utf-8')
    expect(log).toContain('click(100,200)')
    expect(log).toContain('type("hello")')
    // Each line has ISO timestamp prefix
    expect(log).toMatch(/\[\d{4}-\d{2}-\d{2}T/)
  })

  test('saveScreenshot writes numbered JPEG file', () => {
    // Minimal 1x1 white JPEG base64
    const tinyJpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8AVX//2Q=='
    recorder.saveScreenshot(tinyJpeg)
    recorder.saveScreenshot(tinyJpeg)
    expect(existsSync(join(dir, 'screenshot-1.jpg'))).toBe(true)
    expect(existsSync(join(dir, 'screenshot-2.jpg'))).toBe(true)
  })

  test('sessionDir is accessible on the recorder', () => {
    expect(recorder.sessionDir).toBe(dir)
  })
})
