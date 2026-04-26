// Offscreen document: WebRTC host side
// Receives {streamId, signalingUrl, sessionId} from background.js, streams tab to viewer

let pc = null
let dc = null
let currentSessionId = null

function dbg(step, data = {}) {
  const payload = { step, ...data }
  console.error('[offscreen-trace]', JSON.stringify(payload))
  chrome.runtime.sendMessage({ type: 'offscreen_debug', session_id: currentSessionId, params: payload })
  fetch('http://127.0.0.1:9224/debug', { method: 'POST', body: JSON.stringify({ src: 'offscreen', ...payload }) }).catch(() => {})
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'handoff_start') {
    dbg('msg_received', { streamId: msg.streamId, signalingUrl: msg.signalingUrl })
    startHandoff(msg)
  }
  if (msg.type === 'handoff_stop') { pc?.close(); pc = null }
})

async function startHandoff({ streamId, signalingUrl, sessionId }) {
  currentSessionId = sessionId
  dbg('startHandoff', { streamId, signalingUrl, sessionId })

  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      audio: false,
    })
    dbg('getUserMedia_ok', { tracks: stream.getVideoTracks().length })
  } catch (e) {
    dbg('getUserMedia_error', { error: String(e?.message ?? e) })
    return
  }

  dbg('connecting_ws', { signalingUrl })
  const ws = new WebSocket(signalingUrl)
  ws.onerror = (e) => dbg('ws_error', { error: String(e) })
  ws.onclose = (e) => dbg('ws_close', { code: e.code, reason: e.reason })

  pc = new RTCPeerConnection({ iceServers: [] })
  stream.getVideoTracks().forEach(track => pc.addTrack(track, stream))

  dc = pc.createDataChannel('input')
  dc.onmessage = (evt) => {
    const msg = JSON.parse(evt.data)
    if (msg.type === 'handoff_end') {
      pc?.close(); pc = null
      chrome.runtime.sendMessage({ type: 'handoff_complete', session_id: currentSessionId })
      return
    }
    chrome.runtime.sendMessage({ type: 'input_event', session_id: currentSessionId, ...msg })
  }

  pc.onicecandidate = ({ candidate }) => {
    if (candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ice', candidate }))
    }
  }

  pc.oniceconnectionstatechange = () => dbg('ice_state', { state: pc.iceConnectionState })
  pc.onsignalingstatechange = () => dbg('signaling_state', { state: pc.signalingState })

  ws.onopen = async () => {
    dbg('ws_open')
    ws.send(JSON.stringify({ type: 'role', role: 'host' }))
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }))
      dbg('offer_sent')
    } catch (e) {
      dbg('offer_error', { error: String(e?.message ?? e) })
    }
  }

  ws.onmessage = async (evt) => {
    const msg = JSON.parse(evt.data)
    dbg('ws_msg', { type: msg.type })
    if (msg.type === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
      dbg('answer_set')
    } else if (msg.type === 'ice' && msg.candidate) {
      await pc.addIceCandidate(msg.candidate)
    }
  }
}
