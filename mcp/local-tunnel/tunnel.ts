import * as ngrok from '@ngrok/ngrok'
import { randomBytes } from 'crypto'

interface TunnelState {
  id: string
  local_url: string
  name: string
  token: string
  url: string
  listener: Awaited<ReturnType<typeof ngrok.forward>>
}

export class TunnelManager {
  private tunnels = new Map<string, TunnelState>()

  async open(local_url: string, name?: string): Promise<{ id: string; url: string; status: 'open' }> {
    if (!process.env.NGROK_AUTHTOKEN) {
      throw new Error('NGROK_AUTHTOKEN is not set. Add it to ~/.hyped/.env and restart the daemon.')
    }
    const id = randomBytes(8).toString('hex')
    const token = randomBytes(9).toString('base64url').slice(0, 12)
    const listener = await ngrok.forward({
      addr: local_url,
      authtoken_from_env: true,
      basic_auth: [`hyped:${token}`],
    })
    const rawUrl = listener.url()
    if (!rawUrl) {
      await listener.close()
      throw new Error(`ngrok.forward() returned a listener with no URL for ${local_url}`)
    }
    const url = `https://hyped:${token}@${new URL(rawUrl).host}`
    this.tunnels.set(id, { id, local_url, name: name ?? local_url, token, url, listener })
    return { id, url, status: 'open' }
  }

  async close(id: string): Promise<{ ok: boolean }> {
    const state = this.tunnels.get(id)
    if (!state) throw new Error(`Tunnel ${id} not found`)
    await state.listener.close()
    this.tunnels.delete(id)
    return { ok: true }
  }

  list() {
    return Array.from(this.tunnels.values()).map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      port: s.local_url,
      status: 'open' as const,
    }))
  }

  status(id: string) {
    const state = this.tunnels.get(id)
    if (!state) throw new Error(`Tunnel ${id} not found`)
    return { id: state.id, url: state.url, port: state.local_url, status: 'open' as const }
  }
}
