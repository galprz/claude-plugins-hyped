import { findChrome } from './chrome'
import * as fs from 'fs'

jest.mock('fs')
jest.mock('child_process', () => ({
  execSync: jest.fn(() => { throw new Error('mdfind not available') }),
  spawn: jest.fn(),
}))

const mockExistsSync = fs.existsSync as jest.Mock

beforeEach(() => {
  mockExistsSync.mockReset()
  delete process.env.CHROME_PATH
})

test('findChrome returns CHROME_PATH env var when set', () => {
  process.env.CHROME_PATH = '/custom/chrome'
  expect(findChrome()).toBe('/custom/chrome')
})

test('findChrome returns first existing path on macOS', () => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  mockExistsSync.mockImplementation((p: string) =>
    p === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  )
  expect(findChrome()).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
})

test('findChrome throws when nothing found on linux', () => {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  mockExistsSync.mockReturnValue(false)
  expect(() => findChrome()).toThrow('Chrome not found')
})
