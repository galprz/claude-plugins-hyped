import { listChromeProfiles, resolveProfileDir } from './profiles'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const LOCAL_STATE = JSON.stringify({
  profile: {
    info_cache: {
      Default: { name: 'Person 1' },
      'Profile 1': { name: 'Work' },
      'Profile 2': { name: 'Personal' },
    },
  },
})

function makeHome(): string {
  const home = join(tmpdir(), `chrome-profiles-test-${Date.now()}`)
  const dir = join(home, 'Library/Application Support/Google/Chrome')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'Local State'), LOCAL_STATE)
  return home
}

test('returns all profiles with name and directory', () => {
  const home = makeHome()
  try {
    const profiles = listChromeProfiles(home)
    expect(profiles).toEqual([
      { directory: 'Default', name: 'Person 1' },
      { directory: 'Profile 1', name: 'Work' },
      { directory: 'Profile 2', name: 'Personal' },
    ])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('returns empty array if Local State missing', () => {
  const profiles = listChromeProfiles('/nonexistent-home-dir')
  expect(profiles).toEqual([])
})

test('resolveProfileDir finds by directory name', () => {
  const profiles = [
    { directory: 'Default', name: 'Person 1' },
    { directory: 'Profile 1', name: 'Work' },
  ]
  expect(resolveProfileDir('Default', profiles)).toBe('Default')
  expect(resolveProfileDir('Profile 1', profiles)).toBe('Profile 1')
})

test('resolveProfileDir finds by display name case-insensitively', () => {
  const profiles = [
    { directory: 'Default', name: 'Person 1' },
    { directory: 'Profile 1', name: 'Work' },
  ]
  expect(resolveProfileDir('work', profiles)).toBe('Profile 1')
  expect(resolveProfileDir('WORK', profiles)).toBe('Profile 1')
})

test('resolveProfileDir returns null for unknown name', () => {
  const profiles = [{ directory: 'Default', name: 'Person 1' }]
  expect(resolveProfileDir('Nonexistent', profiles)).toBeNull()
})
