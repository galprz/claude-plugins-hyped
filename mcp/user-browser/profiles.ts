import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface ChromeProfile {
  name: string
  directory: string
}

export function listChromeProfiles(home = homedir()): ChromeProfile[] {
  const localStatePath = join(
    home,
    'Library/Application Support/Google/Chrome/Local State'
  )
  try {
    const data = JSON.parse(readFileSync(localStatePath, 'utf8'))
    const infoCache = data?.profile?.info_cache ?? {}
    return Object.entries(infoCache).map(([dir, info]: [string, any]) => ({
      directory: dir,
      name: (info.name as string) ?? dir,
    }))
  } catch {
    return []
  }
}

/** Resolves a user-visible profile name (e.g. "Work") to a directory (e.g. "Profile 1").
 *  Returns null if no match found. */
export function resolveProfileDir(name: string, profiles: ChromeProfile[]): string | null {
  const byDir = profiles.find(p => p.directory === name)
  if (byDir) return byDir.directory
  const byName = profiles.find(p => p.name.toLowerCase() === name.toLowerCase())
  if (byName) return byName.directory
  return null
}
