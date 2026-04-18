import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'

const CHROME_PATHS_MAC = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

const CHROME_PATHS_LINUX = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

export function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const paths = process.platform === 'darwin' ? CHROME_PATHS_MAC : CHROME_PATHS_LINUX
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  if (process.platform === 'darwin') {
    try {
      const result = execSync(
        'mdfind "kMDItemCFBundleIdentifier == com.google.Chrome"',
        { timeout: 3000 }
      ).toString().trim().split('\n')[0]
      if (result) return `${result}/Contents/MacOS/Google Chrome`
    } catch { /* ignore */ }
  }
  throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH env var.')
}

export function launchChrome(extensionPath: string): ChildProcess {
  const chromePath = findChrome()
  const proc = spawn(chromePath, [
    `--load-extension=${extensionPath}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: false, stdio: 'ignore' })
  proc.unref()
  return proc
}
