import { portIsOpen } from './client'
import * as net from 'net'

jest.mock('net')

test('portIsOpen returns true when connection succeeds', async () => {
  const handlers: Record<string, () => void> = {}
  const mockSocket = {
    once: jest.fn((event: string, cb: () => void) => { handlers[event] = cb }),
    destroy: jest.fn(),
  }
  ;(net.createConnection as jest.Mock).mockReturnValue(mockSocket)
  const p = portIsOpen(9222)
  handlers['connect']?.()
  expect(await p).toBe(true)
})

test('portIsOpen returns false when connection fails', async () => {
  const handlers: Record<string, () => void> = {}
  const mockSocket = {
    once: jest.fn((event: string, cb: () => void) => { handlers[event] = cb }),
    destroy: jest.fn(),
  }
  ;(net.createConnection as jest.Mock).mockReturnValue(mockSocket)
  const p = portIsOpen(9222)
  handlers['error']?.()
  expect(await p).toBe(false)
})
