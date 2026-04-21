import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'

const mockClose = mock(() => Promise.resolve())
const mockForward = mock(() =>
  Promise.resolve({ url: () => 'https://abc123.ngrok.io', close: mockClose })
)

mock.module('@ngrok/ngrok', () => ({ forward: mockForward }))

const { TunnelManager } = await import('./tunnel.ts')

describe('TunnelManager.open', () => {
  beforeEach(() => {
    mockForward.mockImplementation(() =>
      Promise.resolve({ url: () => 'https://abc123.ngrok.io', close: mockClose })
    )
    mockClose.mockClear()
    process.env.NGROK_AUTHTOKEN = 'test-token'
  })
  afterEach(() => { delete process.env.NGROK_AUTHTOKEN })

  test('returns id, url with basic auth embedded, status open', async () => {
    const m = new TunnelManager()
    const r = await m.open('http://localhost:3000')
    expect(r.status).toBe('open')
    expect(r.id).toBeTruthy()
    expect(r.url).toMatch(/^https:\/\/hyped:[^@]+@abc123\.ngrok\.io$/)
  })

  test('passes name through to list()', async () => {
    const m = new TunnelManager()
    await m.open('http://localhost:3000', 'myapp')
    expect(m.list()[0].name).toBe('myapp')
  })

  test('defaults name to local_url when omitted', async () => {
    const m = new TunnelManager()
    await m.open('http://localhost:3000')
    expect(m.list()[0].name).toBe('http://localhost:3000')
  })

  test('throws when NGROK_AUTHTOKEN is not set', async () => {
    delete process.env.NGROK_AUTHTOKEN
    await expect(new TunnelManager().open('http://localhost:3000')).rejects.toThrow('NGROK_AUTHTOKEN')
  })
})

describe('TunnelManager.close', () => {
  beforeEach(() => {
    mockForward.mockImplementation(() =>
      Promise.resolve({ url: () => 'https://abc123.ngrok.io', close: mockClose })
    )
    mockClose.mockClear()
    process.env.NGROK_AUTHTOKEN = 'test-token'
  })
  afterEach(() => { delete process.env.NGROK_AUTHTOKEN })

  test('calls listener.close and removes tunnel', async () => {
    const m = new TunnelManager()
    const { id } = await m.open('http://localhost:3000')
    const r = await m.close(id)
    expect(r.ok).toBe(true)
    expect(mockClose).toHaveBeenCalledTimes(1)
    expect(m.list()).toHaveLength(0)
  })

  test('throws for unknown id', async () => {
    await expect(new TunnelManager().close('nope')).rejects.toThrow('nope')
  })
})

describe('TunnelManager.list', () => {
  beforeEach(() => {
    mockForward.mockImplementation(() =>
      Promise.resolve({ url: () => 'https://abc123.ngrok.io', close: mockClose })
    )
    process.env.NGROK_AUTHTOKEN = 'test-token'
  })
  afterEach(() => { delete process.env.NGROK_AUTHTOKEN })

  test('returns all open tunnels', async () => {
    const m = new TunnelManager()
    await m.open('http://localhost:3000', 'app')
    await m.open('http://localhost:4000', 'api')
    const list = m.list()
    expect(list).toHaveLength(2)
    expect(list.map(t => t.name)).toEqual(['app', 'api'])
    expect(list[0].port).toBe('http://localhost:3000')
    expect(list[0].status).toBe('open')
  })

  test('returns empty array when no tunnels', () => {
    expect(new TunnelManager().list()).toEqual([])
  })
})

describe('TunnelManager.status', () => {
  beforeEach(() => {
    mockForward.mockImplementation(() =>
      Promise.resolve({ url: () => 'https://abc123.ngrok.io', close: mockClose })
    )
    process.env.NGROK_AUTHTOKEN = 'test-token'
  })
  afterEach(() => { delete process.env.NGROK_AUTHTOKEN })

  test('returns tunnel state', async () => {
    const m = new TunnelManager()
    const { id } = await m.open('http://localhost:3000', 'myapp')
    const s = m.status(id)
    expect(s.id).toBe(id)
    expect(s.port).toBe('http://localhost:3000')
    expect(s.status).toBe('open')
    expect(s.url).toMatch(/^https:\/\/hyped:/)
  })

  test('throws for unknown id', () => {
    expect(() => new TunnelManager().status('nope')).toThrow('nope')
  })
})
