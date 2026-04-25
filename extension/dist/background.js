// Hyped Chrome Tool — background service worker

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

// ---- Messages from offscreen doc ----
chrome.runtime.onMessage.addListener((msg) => {
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
  console.error('[bg] startTabHandoff', sessionId)
  const tabId = sessions.get(sessionId)
  console.error('[bg] tabId =', tabId ?? null)
  if (tabId == null) { console.error('[bg] no tabId — abort'); return }
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
    console.error('[bg] streamId =', streamId)
    send({ type: 'event', session_id: sessionId, method: 'Handoff.streamId', params: { streamId } })
    if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen-handoff.html'),
      reasons: ['BLOBS', 'USER_MEDIA'],
      justification: 'Tab capture stream for browser handoff',
    })
    await new Promise(r => setTimeout(r, 200))
    chrome.runtime.sendMessage({ type: 'handoff_start', streamId, signalingUrl, sessionId })
  } catch (e) {
    console.error('[bg] ERROR in startTabHandoff:', e?.message ?? e)
    send({ type: 'event', session_id: sessionId, method: 'Handoff.error', params: { error: String(e?.message ?? e) } })
  }
}

// ---- Daemon message handler ----
async function handleDaemonMessage(msg) {
  switch (msg.type) {
    case 'open_tab': {
      const tab = await chrome.tabs.create({ url: 'about:blank', active: false })
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
      await startTabHandoff(msg.session_id, msg.signaling_url)
      break
    }
    case 'command': {
      const { session_id, id, method, params } = msg

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
