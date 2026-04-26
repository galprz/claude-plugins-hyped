import { test, expect } from 'bun:test'
import { Session } from './session'

test('getPage launches browser and returns a page', async () => {
  const session = new Session()
  const page = await session.getPage()
  expect(page).toBeDefined()
  expect(typeof page.goto).toBe('function')
  await session.close()
})

test('startRecording resets browser state', async () => {
  const session = new Session()
  const page1 = await session.getPage()
  await session.startRecording('/tmp/test-recording.mp4')
  const page2 = await session.getPage()
  expect(page2).not.toBe(page1) // new page after reset
  await session.close()
})

test('stopRecording produces an MP4 file', async () => {
  const { existsSync, unlinkSync } = await import('fs')
  const outputPath = '/tmp/incognito-test.mp4'
  if (existsSync(outputPath)) unlinkSync(outputPath)

  const session = new Session()
  await session.startRecording(outputPath)
  const page = await session.getPage()
  await page.goto('about:blank')
  const result = await session.stopRecording()

  expect(result).toBe(outputPath)
  expect(existsSync(outputPath)).toBe(true)
  if (existsSync(outputPath)) unlinkSync(outputPath)
})

import { executeTool, toolDefinitions } from './tools'

test('toolDefinitions contains 9 tools', () => {
  const names = toolDefinitions.map(t => t.name)
  expect(names).toContain('navigate')
  expect(names).toContain('screenshot')
  expect(names).toContain('click')
  expect(names).toContain('type')
  expect(names).toContain('key')
  expect(names).toContain('scroll')
  expect(names).toContain('eval')
  expect(names).toContain('record_start')
  expect(names).toContain('record_stop')
  expect(names).toHaveLength(9)
})

test('navigate returns confirmation text', async () => {
  const session = new Session()
  const result = await executeTool('navigate', { url: 'https://example.com' }, session)
  expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('example.com') })
  await session.close()
})

test('screenshot returns inline image', async () => {
  const session = new Session()
  await executeTool('navigate', { url: 'about:blank' }, session)
  const result = await executeTool('screenshot', {}, session)
  expect(result.content[0]).toMatchObject({ type: 'image' })
  await session.close()
})

test('screenshot with save_to writes JPEG to disk', async () => {
  const { existsSync, unlinkSync } = await import('fs')
  const saveTo = '/tmp/incognito-screenshot-test.jpg'
  if (existsSync(saveTo)) unlinkSync(saveTo)

  const session = new Session()
  await executeTool('navigate', { url: 'about:blank' }, session)
  const result = await executeTool('screenshot', { save_to: saveTo }, session)

  expect(existsSync(saveTo)).toBe(true)
  expect(result.content).toHaveLength(2)
  expect(result.content[1]).toMatchObject({ type: 'text', text: expect.stringContaining(saveTo) })
  unlinkSync(saveTo)
  await session.close()
})

test('eval returns page title', async () => {
  const session = new Session()
  await executeTool('navigate', { url: 'about:blank' }, session)
  const result = await executeTool('eval', { expression: 'document.title' }, session)
  expect(result.content[0]).toMatchObject({ type: 'text' })
  await session.close()
})

test('unknown tool returns error text', async () => {
  const session = new Session()
  const result = await executeTool('unknown_tool', {}, session)
  expect(result.content[0].text).toMatch(/Unknown tool/i)
  await session.close()
})
