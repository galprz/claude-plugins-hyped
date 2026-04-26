import { writeFileSync } from 'fs'
import type { BrowserClient } from './types'
import { RecordingManager } from './recording'

export interface Focusable {
  focus(): void
}

export interface BrowserLifecycle {
  openBrowser(profile?: string): Promise<void>
  closeBrowser(): Promise<void>
  closeAll(): Promise<void>
  listProfiles(): Promise<import('./profiles').ChromeProfile[]>
}

const recorder = new RecordingManager()

function timeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ])
}

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] }
}

function image(data: string) {
  return { content: [{ type: 'image' as const, data, mimeType: 'image/jpeg' }] }
}

export const toolDefinitions = [
  {
    name: 'navigate',
    description: 'Navigate to a URL. Use new_tab: true to open in a new Chrome tab.',
    inputSchema: {
      type: 'object',
      properties: {
        url:     { type: 'string',  description: 'URL to navigate to' },
        new_tab: { type: 'boolean', description: 'Open in a new tab instead of the current session tab' },
      },
      required: ['url'],
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page. Pass save_to to also write the JPEG to a file (e.g. /tmp/shot.jpg) so it can be sent via Telegram.',
    inputSchema: {
      type: 'object',
      properties: {
        save_to: { type: 'string', description: 'Optional file path to save the screenshot (e.g. /tmp/shot.jpg)' },
      },
    },
  },
  {
    name: 'eval',
    description: 'Evaluate JavaScript in the page',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    },
  },
  {
    name: 'click',
    description: 'Click at coordinates',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'type',
    description: 'Type text into the focused element',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'key',
    description: 'Press a key (e.g. Enter, Tab, Escape)',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll at coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        deltaY: { type: 'number' },
      },
      required: ['x', 'y', 'deltaY'],
    },
  },
  {
    name: 'get_tabs',
    description: 'List all open browser tabs',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'switch_tab',
    description: 'Switch to a different tab by targetId',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'string' } },
      required: ['tabId'],
    },
  },
  {
    name: 'record_start',
    description: 'Start recording the browser tab to MP4',
    inputSchema: {
      type: 'object',
      properties: { output_path: { type: 'string' } },
      required: ['output_path'],
    },
  },
  {
    name: 'record_stop',
    description: 'Stop recording and return the MP4 file path',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'focus_tab',
    description: 'Bring the browser window to the foreground and focus the session tab',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_profiles',
    description: 'List all available Chrome profiles. Call this before open_browser to let the user choose a profile.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'open_browser',
    description: 'Launch Chrome with a specific profile. If no profile is given, uses the Default profile. If already open, kills the existing Chrome instance first.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          description: 'Profile display name (e.g. "Work") or directory (e.g. "Profile 1"). Omit for Default.',
        },
      },
    },
  },
  {
    name: 'close_browser',
    description: 'Close the browser tabs opened by this session. Does not quit Chrome itself.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'close_all',
    description: 'Quit Chrome entirely — closes all windows and profiles.',
    inputSchema: { type: 'object', properties: {} },
  },
]

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  client: BrowserClient & Partial<Focusable> & Partial<BrowserLifecycle>,
  sessionId?: string,
): Promise<{ content: Array<{ type: string; [k: string]: unknown }> }> {
  try {
    switch (name) {
      case 'navigate': {
        const url = args.url as string
        const newTab = args.new_tab as boolean | undefined

        if (newTab) {
          return await timeout(10000, async () => {
            await client.sendCommand('Tabs.create', { url })
            return text(`Opened ${url} in a new tab`)
          })
        }

        return await timeout(15000, async () => {
          await client.sendCommand('Page.enable', {})
          const loaded = new Promise<void>(res => {
            const off = client.onEvent('Page.loadEventFired', () => { off(); res() })
            setTimeout(res, 15000)
          })
          await client.sendCommand('Page.navigate', { url })
          await loaded
          return text(`Navigated to ${url}`)
        })
      }

      case 'screenshot': {
        return await timeout(10000, async () => {
          const res = await client.sendCommand('Page.captureScreenshot', {
            format: 'jpeg',
            quality: 80,
          }) as { data: string }
          const saveTo = args.save_to as string | undefined
          if (saveTo) {
            writeFileSync(saveTo, Buffer.from(res.data, 'base64'))
            return {
              content: [
                { type: 'image' as const, data: res.data, mimeType: 'image/jpeg' },
                { type: 'text' as const, text: `Screenshot saved to ${saveTo}` },
              ],
            }
          }
          return image(res.data)
        })
      }

      case 'eval': {
        return await timeout(10000, async () => {
          const res = await client.sendCommand('Runtime.evaluate', {
            expression: args.expression as string,
            returnByValue: true,
            awaitPromise: true,
          }) as { result: { value: unknown }; exceptionDetails?: { text: string } }
          if (res.exceptionDetails) return text(`Error: ${res.exceptionDetails.text}`)
          return text(JSON.stringify(res.result.value))
        })
      }

      case 'click': {
        return await timeout(5000, async () => {
          const { x, y } = args as { x: number; y: number }
          await client.sendCommand('Input.dispatchMouseEvent', {
            type: 'mousePressed', x, y, button: 'left', clickCount: 1,
          })
          await client.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
          })
          return text(`Clicked (${x}, ${y})`)
        })
      }

      case 'type': {
        return await timeout(10000, async () => {
          const str = args.text as string
          for (const char of str) {
            await client.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', text: char })
            await client.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', text: char })
          }
          return text(`Typed "${str}"`)
        })
      }

      case 'key': {
        return await timeout(5000, async () => {
          const key = args.key as string
          await client.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key })
          await client.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key })
          return text(`Pressed ${key}`)
        })
      }

      case 'scroll': {
        return await timeout(5000, async () => {
          const { x, y, deltaY } = args as { x: number; y: number; deltaY: number }
          await client.sendCommand('Runtime.evaluate', {
            expression: `
              (function() {
                // Try window first, then find the tallest scrollable container
                if (document.scrollingElement && document.scrollingElement.scrollHeight > window.innerHeight) {
                  document.scrollingElement.scrollBy({ top: ${deltaY}, behavior: 'smooth' });
                  return 'window';
                }
                const all = document.querySelectorAll('*');
                let best = null, bestH = 0;
                for (const el of all) {
                  const s = getComputedStyle(el);
                  if ((s.overflow === 'auto' || s.overflow === 'scroll' || s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight && el.clientHeight > bestH) {
                    best = el; bestH = el.clientHeight;
                  }
                }
                if (best) { best.scrollBy({ top: ${deltaY}, behavior: 'smooth' }); return best.tagName; }
                window.scrollBy({ top: ${deltaY}, behavior: 'smooth' });
                return 'window-fallback';
              })()
            `,
            returnByValue: true,
          })
          return text(`Scrolled ${deltaY}px at (${x}, ${y})`)
        })
      }

      case 'get_tabs': {
        return await timeout(10000, async () => {
          const res = await client.sendCommand('Target.getTargets', {}) as {
            targetInfos: Array<{ type: string; targetId: string; title: string; url: string }>
          }
          const pages = res.targetInfos.filter(t => t.type === 'page')
          return text(JSON.stringify(pages, null, 2))
        })
      }

      case 'switch_tab': {
        return await timeout(10000, async () => {
          await client.sendCommand('Target.activateTarget', { targetId: args.tabId as string })
          return text(`Switched to tab ${args.tabId}`)
        })
      }

      case 'record_start': {
        const outputPath = args.output_path as string
        recorder.start(
          sessionId ?? 'default',
          outputPath,
          async () => {
            const res = await client.sendCommand('Page.captureScreenshot', {
              format: 'jpeg',
              quality: 60,
            }) as { data: string }
            return Buffer.from(res.data, 'base64')
          }
        )
        return text(`Recording started → ${outputPath}`)
      }

      case 'record_stop': {
        return await timeout(10000, async () => {
          const path = await recorder.stop(sessionId ?? 'default')
          return text(`Recording saved → ${path}`)
        })
      }

      case 'focus_tab': {
        client.focus?.()
        return text('Browser window focused')
      }

      case 'list_profiles': {
        if (!client.listProfiles) return text('list_profiles not available')
        const profiles = await client.listProfiles()
        if (profiles.length === 0) return text('No Chrome profiles found.')
        const lines = profiles.map(p => `- ${p.name} (directory: ${p.directory})`).join('\n')
        return text(`Available Chrome profiles:\n${lines}`)
      }

      case 'open_browser': {
        if (!client.openBrowser) return text('open_browser not available')
        const profile = args.profile as string | undefined
        try {
          await client.openBrowser(profile)
          return text(`Chrome opened${profile ? ` with profile "${profile}"` : ' with Default profile'}`)
        } catch (e) {
          return text(`Failed to open browser: ${(e as Error).message}`)
        }
      }

      case 'close_browser': {
        if (!client.closeBrowser) return text('close_browser not available')
        await client.closeBrowser()
        return text('Chrome closed')
      }

      case 'close_all': {
        if (!client.closeAll) return text('close_all not available')
        await client.closeAll()
        return text('All Chrome windows closed')
      }

      default:
        return text(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return text(`Error: ${(e as Error).message}`)
  }
}
