import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'

const mockClose = mock(() => Promise.resolve())
const mockForward = mock(() =>
  Promise.resolve({ url: () => 'https://abc123.ngrok.io', close: mockClose })
)

mock.module('@ngrok/ngrok', () => ({ forward: mockForward }))

const { TunnelManager } = await import('./tunnel.ts')

describe('TunnelManager.open', () => {
  beforeEach(() => {
    mockForward.mockClear()
    mockForward.mockImplementation(() =>
      Promise.resolve({ url: () => 'https://abc123.ngrok.io', close: mockClose })
    )
    mockClose.mockClear()
    process.env.NGROK_AUTHTOKEN = 'test-token'
    process.env.NGROK_TUNNEL_USERNAME = 'testuser'
  })
  afterEach(() => {
    delete process.env.NGROK_AUTHTOKEN
    delete process.env.NGROK_TUNNEL_USERNAME
  })

  test('returns id, url with basic auth embedded, status open', async () => {
    const m = new TunnelManager()
    const r = await m.open('http://localhost:3000')
    expect(r.status).toBe('open')
    expect(r.id).toBeTruthy()
    expect(r.url).toMatch(/^https:\/\/testuser:[^@]+@abc123\.ngrok\.io$/)
  })

  test('generates a unique random password per tunnel', async () => {
    const m = new TunnelManager()
    const r1 = await m.open('http://localhost:3000')
    const r2 = await m.open('http://localhost:4000')
    const pass1 = r1.url.match(/testuser:([^@]+)@/)?.[1]
    const pass2 = r2.url.match(/testuser:([^@]+)@/)?.[1]
    expect(pass1).toBeTruthy()
    expect(pass2).toBeTruthy()
    expect(pass1).not.toBe(pass2)
  })

  test('defaults username to "hyped" when NGROK_TUNNEL_USERNAME is not set', async () => {
    delete process.env.NGROK_TUNNEL_USERNAME
    const m = new TunnelManager()
    const r = await m.open('http://localhost:3000')
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

  test('throws and closes listener when url() returns null', async () => {
    mockForward.mockImplementation(() =>
      Promise.resolve({ url: () => null, close: mockClose })
    )
    const m = new TunnelManager()
    await expect(m.open('http://localhost:3000')).rejects.toThrow('no URL')
    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})

describe('TunnelManager.close', () => {
  beforeEach(() => {
    mockForward.mockClear()
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
    mockForward.mockClear()
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
    mockForward.mockClear()
    mockForward.mockImplementation(() =>
      Promise.resolve({ url: () => 'https://abc123.ngrok.io', close: mockClose })
    )
    process.env.NGROK_AUTHTOKEN = 'test-token'
  })
  afterEach(() => { delete process.env.NGROK_AUTHTOKEN })

  test('returns tunnel state with embedded credentials', async () => {
    const m = new TunnelManager()
    const { id } = await m.open('http://localhost:3000', 'myapp')
    const s = m.status(id)
    expect(s.id).toBe(id)
    expect(s.port).toBe('http://localhost:3000')
    expect(s.status).toBe('open')
    expect(s.url).toMatch(/^https:\/\/hyped:[^@]+@abc123\.ngrok\.io$/)
  })

  test('throws for unknown id', () => {
    expect(() => new TunnelManager().status('nope')).toThrow('nope')
  })
})
