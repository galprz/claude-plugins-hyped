// Hyped Chrome Tool — background service worker
console.log('🟢 BG v4 loaded', Date.now()) // v4: URL polling fix

const sessions = new Map() // session_id → tabId
let extSocket = null

// ---- Offscreen keepalive ----
async function ensureOffscreen(reasons = ['BLOBS'], url = 'keepalive.html', justification = 'Keep service worker alive') {
  if (await chrome.offscreen.hasDocument()) return
  await chrome.offscreen.createDocument({ url: chrome.runtime.getURL(url), reasons, justification })
}

// ---- Status badge ----
function setStatus(connected, sessionCount = 0) {
  chrome.storage.local.set({ status: connected ? 'connected' : 'disconnected', activeSessions: sessionCount })
  chrome.action.setBadgeText({ text: connected ? '●' : '○' })
  chrome.action.setBadgeBackgroundColor({ color: connected ? '#22c55e' : '#ef4444' })
  chrome.action.setTitle({ title: connected ? `Connected — ${sessionCount} active session(s)` : 'Disconnected from Hyped' })
}

// ---- Send to daemon ----
function send(msg) {
  if (extSocket?.readyState === WebSocket.OPEN) extSocket.send(JSON.stringify(msg))
}

// ---- Debug trace (works even if extSocket is null) ----
function dbg(step, data = {}) {
  const payload = JSON.stringify({ step, extSocketState: extSocket?.readyState ?? 'null', ...data })
  console.error('[bg-trace]', payload)
  fetch('http://127.0.0.1:9224/debug', { method: 'POST', body: payload }).catch(() => {})
}

// ---- Input events + offscreen debug relay + handoff_complete ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'offscreen_debug') {
    send({ type: 'event', session_id: msg.session_id ?? 'offscreen', method: 'Handoff.debug', params: msg.params })
    return
  }
  if (msg.type === 'input_event') {
    const tabId = sessions.get(msg.session_id) ?? [...sessions.values()][0]
    if (tabId == null) return
    const isClick = msg.event === 'click'
    chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: isClick ? 'mousePressed' : msg.event === 'mousedown' ? 'mousePressed' : 'mouseReleased',
      x: msg.x, y: msg.y, button: 'left', clickCount: 1,
    })
    if (isClick) {
      chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: msg.x, y: msg.y, button: 'left', clickCount: 1,
      })
    }
  }
  if (msg.type === 'handoff_complete') {
    send({ type: 'handoff_complete', session_id: msg.session_id })
    chrome.offscreen.closeDocument().then(() => ensureOffscreen())
  }
})

// ---- Tab handoff via tabCapture ----
async function startTabHandoff(sessionId, signalingUrl) {
  dbg('startTabHandoff', { sessionId, sessions: [...sessions.keys()] })
  const tabId = sessions.get(sessionId)
  dbg('tabId', { tabId: tabId ?? null })
  if (tabId == null) { dbg('abort_no_tabId'); return }
  try {
    // tabCapture cannot capture chrome:// or about: pages — poll until real URL
    let tabUrl = ''
    for (let i = 0; i < 20; i++) {
      const tab = await chrome.tabs.get(tabId)
      tabUrl = tab.url ?? ''
      dbg('poll_url', { i, tabUrl })
      if (tabUrl.startsWith('http')) break
      await new Promise(r => setTimeout(r, 300))
    }
    if (!tabUrl.startsWith('http')) {
      dbg('abort_bad_url', { tabUrl })
      send({ type: 'event', session_id: sessionId, method: 'Handoff.error', params: { error: 'Tab not at capturable URL: ' + tabUrl } })
      return
    }
    dbg('getMediaStreamId_start', { tabId, tabUrl })
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
    dbg('getMediaStreamId_done', { streamId })
    send({ type: 'event', session_id: sessionId, method: 'Handoff.debug', params: { step: 'streamId', value: streamId } })
    const hasDoc = await chrome.offscreen.hasDocument()
    dbg('offscreen_hasDoc', { hasDoc })
    if (hasDoc) await chrome.offscreen.closeDocument()
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen-handoff.html'),
      reasons: ['BLOBS', 'USER_MEDIA'],
      justification: 'Tab capture stream for browser handoff',
    })
    dbg('offscreen_created')
    await new Promise(r => setTimeout(r, 200))
    dbg('sending_handoff_start_to_offscreen', { streamId, signalingUrl, sessionId })
    chrome.runtime.sendMessage({ type: 'handoff_start', streamId, signalingUrl, sessionId })
  } catch (e) {
    dbg('error', { error: String(e?.message ?? e) })
    send({ type: 'event', session_id: sessionId, method: 'Handoff.error', params: { error: String(e?.message ?? e) } })
  }
}

// ---- Daemon message handler ----
async function handleDaemonMessage(msg) {
  dbg('handleDaemonMessage', { type: msg.type, session_id: msg.session_id ?? null })
  switch (msg.type) {
    case 'open_tab': {
      // Find the newest Chrome window (highest ID) — this is the one open_browser just created
      const allWindows = await chrome.windows.getAll({ windowTypes: ['normal'] })
      const targetWindow = allWindows.reduce((a, b) => a.id > b.id ? a : b)
      const tab = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: targetWindow.id })
      await chrome.debugger.attach({ tabId: tab.id }, '1.3')
      sessions.set(msg.session_id, tab.id)
      chrome.debugger.onEvent.addListener((src, method, params) => {
        if (src.tabId === tab.id) send({ type: 'event', session_id: msg.session_id, method, params: params ?? {} })
      })
      send({ type: 'tab_ready', session_id: msg.session_id, tab_id: tab.id })
      setStatus(true, sessions.size)
      break
    }
    case 'focus_tab': {
      const tabId = sessions.get(msg.session_id)
      if (tabId != null) {
        const tab = await chrome.tabs.update(tabId, { active: true })
        if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true })
      }
      break
    }
    case 'close_tab': {
      const tabId = sessions.get(msg.session_id)
      if (tabId != null) {
        try { await chrome.debugger.detach({ tabId }) } catch {}
        try { await chrome.tabs.remove(tabId) } catch {}
        sessions.delete(msg.session_id)
      }
      setStatus(extSocket?.readyState === WebSocket.OPEN, sessions.size)
      break
    }
    case 'handoff_start': {
      send({ type: 'event', session_id: msg.session_id, method: 'Handoff.debug', params: { step: 'case_hit', extSocketState: extSocket?.readyState ?? 'null', sessions: [...sessions.keys()] } })
      await startTabHandoff(msg.session_id, msg.signaling_url)
      break
    }
    case 'command': {
      const { session_id, id, method, params } = msg

      // Virtual commands handled here (not via chrome.debugger)
      if (method === 'Target.getTargets') {
        const tabs = (await chrome.tabs.query({}))
          .filter(t => !t.url?.startsWith('chrome://') && !t.url?.startsWith('chrome-extension://'))
          .map(t => ({ targetId: String(t.id), type: 'page', title: t.title ?? '', url: t.url ?? '' }))
        send({ type: 'response', session_id, id, result: { targetInfos: tabs } })
        return
      }
      if (method === 'Tabs.create') {
        const tab = await chrome.tabs.create({ url: params.url, active: true })
        if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true })
        send({ type: 'response', session_id, id, result: { tabId: tab.id } })
        return
      }
      if (method === 'Target.activateTarget') {
        const newTabId = parseInt(params.targetId, 10)
        if (!isNaN(newTabId)) {
          const oldTabId = sessions.get(session_id)
          if (oldTabId != null && oldTabId !== newTabId) {
            try { await chrome.debugger.detach({ tabId: oldTabId }) } catch {}
          }
          try { await chrome.debugger.attach({ tabId: newTabId }, '1.3') } catch {}
          sessions.set(session_id, newTabId)
          chrome.debugger.onEvent.addListener((src, method, params) => {
            if (src.tabId === newTabId) send({ type: 'event', session_id, method, params: params ?? {} })
          })
          const tab = await chrome.tabs.update(newTabId, { active: true })
          if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true })
        }
        send({ type: 'response', session_id, id, result: {} })
        return
      }

      // Forward to chrome.debugger
      const tabId = sessions.get(session_id)
      if (tabId == null) { send({ type: 'response', session_id, id, result: { error: 'tab not found' } }); return }
      try {
        const result = await chrome.debugger.sendCommand({ tabId }, method, params)
        send({ type: 'response', session_id, id, result })
      } catch (e) {
        send({ type: 'response', session_id, id, result: { error: e.message } })
      }
      break
    }
  }
}

// ---- WS connection to daemon ----
function connect() {
  const ws = new WebSocket('ws://127.0.0.1:9222/extension')
  ws.addEventListener('open', async () => {
    extSocket = ws
    ws.send(JSON.stringify({ type: 'hello' }))
    await ensureOffscreen()
    setStatus(true, sessions.size)
  })
  ws.addEventListener('message', ({ data }) => handleDaemonMessage(JSON.parse(data)).catch(console.error))
  ws.addEventListener('close', () => { extSocket = null; setStatus(false); setTimeout(connect, 3000) })
  ws.addEventListener('error', () => ws.close())
}

chrome.runtime.onStartup.addListener(connect)
chrome.runtime.onInstalled.addListener(connect)
connect()
