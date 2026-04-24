import { existsSync, readFileSync, unlinkSync } from 'fs'
import { executeTool } from './tools'

const mockClient = {
  sendCommand: jest.fn(),
  onEvent: jest.fn(() => () => {}),
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('navigate calls Page.enable then Page.navigate', async () => {
  mockClient.sendCommand.mockResolvedValue({})
  ;(mockClient.onEvent as jest.Mock).mockImplementation((_method: string, handler: (p: Record<string, unknown>) => void) => {
    setTimeout(() => handler({}), 10)
    return () => {}
  })
  const result = await executeTool('navigate', { url: 'https://example.com' }, mockClient as any)
  expect(mockClient.sendCommand).toHaveBeenCalledWith('Page.enable', {})
  expect(mockClient.sendCommand).toHaveBeenCalledWith('Page.navigate', { url: 'https://example.com' })
  expect(result).toMatchObject({ content: [{ type: 'text' }] })
})

test('screenshot returns image content', async () => {
  mockClient.sendCommand.mockResolvedValue({ data: 'base64data' })
  const result = await executeTool('screenshot', {}, mockClient as any)
  expect(result).toMatchObject({ content: [{ type: 'image', data: 'base64data' }] })
})

test('screenshot with save_to writes JPEG to file and returns image + path', async () => {
  mockClient.sendCommand.mockResolvedValue({ data: 'base64data' })
  const saveTo = '/tmp/chrome-tool-test-shot.jpg'
  if (existsSync(saveTo)) unlinkSync(saveTo)
  const result = await executeTool('screenshot', { save_to: saveTo }, mockClient as any)
  expect(existsSync(saveTo)).toBe(true)
  expect(readFileSync(saveTo)).toEqual(Buffer.from('base64data', 'base64'))
  unlinkSync(saveTo)
  expect(result.content).toHaveLength(2)
  expect(result.content[0]).toMatchObject({ type: 'image' })
  expect(result.content[1]).toMatchObject({ type: 'text', text: expect.stringContaining(saveTo) })
})

test('eval returns stringified result', async () => {
  mockClient.sendCommand.mockResolvedValue({ result: { value: 42 } })
  const result = await executeTool('eval', { expression: '21 + 21' }, mockClient as any)
  expect(result.content[0]).toMatchObject({ type: 'text', text: '42' })
})

test('click dispatches mousePressed and mouseReleased', async () => {
  mockClient.sendCommand.mockResolvedValue({})
  await executeTool('click', { x: 100, y: 200 }, mockClient as any)
  expect(mockClient.sendCommand).toHaveBeenCalledWith('Input.dispatchMouseEvent',
    expect.objectContaining({ type: 'mousePressed', x: 100, y: 200 }))
  expect(mockClient.sendCommand).toHaveBeenCalledWith('Input.dispatchMouseEvent',
    expect.objectContaining({ type: 'mouseReleased', x: 100, y: 200 }))
})

test('unknown tool returns error text', async () => {
  const result = await executeTool('unknown_tool', {}, mockClient as any)
  expect(result.content[0].text).toMatch(/Unknown tool/i)
})
