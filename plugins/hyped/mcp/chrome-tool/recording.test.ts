import { RecordingManager } from './recording'
import * as cp from 'child_process'
import * as fs from 'fs'

jest.mock('child_process')
jest.mock('fs')

const mockSpawn = cp.spawn as jest.Mock
const mockExistsSync = fs.existsSync as jest.Mock
const mockMkdirSync = fs.mkdirSync as jest.Mock

function makeFakeProc() {
  const listeners: Record<string, Function[]> = {}
  return {
    stdin: { write: jest.fn(), end: jest.fn(), writable: true },
    on: jest.fn((event: string, cb: Function) => {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
    }),
    _emit: (event: string, ...args: unknown[]) => listeners[event]?.forEach(cb => cb(...args)),
  }
}

beforeEach(() => {
  mockExistsSync.mockReturnValue(true)
  mockMkdirSync.mockImplementation(() => {})
})

test('startRecording throws if already recording for session', () => {
  const mgr = new RecordingManager()
  const fakeProc = makeFakeProc()
  mockSpawn.mockReturnValue(fakeProc)
  mgr.start('s1', '/tmp/out.mp4', async () => Buffer.from(''))
  expect(() => mgr.start('s1', '/tmp/other.mp4', async () => Buffer.from(''))).toThrow('already recording')
})

test('stopRecording throws if not recording for session', async () => {
  const mgr = new RecordingManager()
  await expect(mgr.stop('s1')).rejects.toThrow('not recording')
})

test('isRecording reflects state', () => {
  const mgr = new RecordingManager()
  const fakeProc = makeFakeProc()
  mockSpawn.mockReturnValue(fakeProc)
  expect(mgr.isRecording('s1')).toBe(false)
  mgr.start('s1', '/tmp/out.mp4', async () => Buffer.from(''))
  expect(mgr.isRecording('s1')).toBe(true)
})

test('stop resolves with path when ffmpeg exits 0', async () => {
  const mgr = new RecordingManager()
  const fakeProc = makeFakeProc()
  mockSpawn.mockReturnValue(fakeProc)
  mgr.start('s1', '/tmp/out.mp4', async () => Buffer.from(''))
  const stopPromise = mgr.stop('s1')
  fakeProc._emit('exit', 0)
  await expect(stopPromise).resolves.toBe('/tmp/out.mp4')
})
