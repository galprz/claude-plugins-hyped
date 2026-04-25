import { writeFileSync } from 'fs'
import type { Session } from './session'

export const toolDefinitions = [
  {
    name: 'navigate',
    description: 'Navigate to a URL in a clean headless browser. Use user-browser instead if the page requires authentication or existing cookies.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot. Pass save_to to write JPEG to disk for Telegram delivery. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: {
        save_to: { type: 'string', description: 'Optional file path e.g. /tmp/shot.jpg' },
      },
    },
  },
  {
    name: 'click',
    description: 'Click at x/y coordinates. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'type',
    description: 'Type text into the focused element. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'key',
    description: 'Press a key (e.g. Enter, Tab, Escape). Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll at x/y coordinates by deltaY pixels. Use user-browser instead if authentication is required.',
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
    name: 'eval',
    description: 'Evaluate JavaScript and return the result. Use user-browser instead if authentication is required.',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    },
  },
  {
    name: 'record_start',
    description: 'Start recording browser session to MP4. WARNING: resets browser state — call navigate AFTER this, not before.',
    inputSchema: {
      type: 'object',
      properties: {
        output_path: { type: 'string', description: 'Output MP4 path e.g. /tmp/session.mp4' },
      },
      required: ['output_path'],
    },
  },
  {
    name: 'record_stop',
    description: 'Stop recording and return the MP4 file path.',
    inputSchema: { type: 'object', properties: {} },
  },
]

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] }
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  session: Session,
): Promise<{ content: Array<{ type: string; [k: string]: unknown }> }> {
  try {
    switch (name) {
      case 'navigate': {
        const page = await session.getPage()
        await page.goto(args.url as string, { waitUntil: 'load' })
        return text(`Navigated to ${args.url}`)
      }

      case 'screenshot': {
        const page = await session.getPage()
        const data = await page.screenshot({ type: 'jpeg', quality: 80 })
        const saveTo = args.save_to as string | undefined
        if (saveTo) {
          writeFileSync(saveTo, data)
          return {
            content: [
              { type: 'image' as const, data: data.toString('base64'), mimeType: 'image/jpeg' },
              { type: 'text' as const, text: `Screenshot saved to ${saveTo}` },
            ],
          }
        }
        return { content: [{ type: 'image' as const, data: data.toString('base64'), mimeType: 'image/jpeg' }] }
      }

      case 'click': {
        const page = await session.getPage()
        await page.mouse.click(args.x as number, args.y as number)
        return text(`Clicked (${args.x}, ${args.y})`)
      }

      case 'type': {
        const page = await session.getPage()
        await page.keyboard.type(args.text as string)
        return text(`Typed "${args.text}"`)
      }

      case 'key': {
        const page = await session.getPage()
        await page.keyboard.press(args.key as string)
        return text(`Pressed ${args.key}`)
      }

      case 'scroll': {
        const page = await session.getPage()
        await page.mouse.move(args.x as number, args.y as number)
        await page.mouse.wheel(0, args.deltaY as number)
        return text(`Scrolled ${args.deltaY}px at (${args.x}, ${args.y})`)
      }

      case 'eval': {
        const page = await session.getPage()
        const result = await page.evaluate(args.expression as string)
        return text(JSON.stringify(result))
      }

      case 'record_start': {
        await session.startRecording(args.output_path as string)
        return text(`Recording started → ${args.output_path}`)
      }

      case 'record_stop': {
        const path = await session.stopRecording()
        return text(`Recording saved → ${path}`)
      }

      default:
        return text(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return text(`Error: ${(e as Error).message}`)
  }
}
