// Offscreen document: WebRTC host side
// Receives {streamId, signalingUrl, sessionId} from background.js, streams tab to viewer

let pc = null
let dc = null
let currentSessionId = null

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'handoff_start') startHandoff(msg)
  if (msg.type === 'handoff_stop') { pc?.close(); pc = null }
})

async function startHandoff({ streamId, signalingUrl, sessionId }) {
  currentSessionId = sessionId
  console.error('[offscreen] startHandoff', { streamId, signalingUrl, sessionId })

  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      audio: false,
    })
    console.error('[offscreen] getUserMedia ok, tracks:', stream.getVideoTracks().length)
  } catch (e) {
    console.error('[offscreen] getUserMedia error:', e?.message ?? e)
    return
  }

  const ws = new WebSocket(signalingUrl)
  pc = new RTCPeerConnection({ iceServers: [] }) // Tailscale — no STUN needed

  stream.getVideoTracks().forEach(track => pc.addTrack(track, stream))

  // DataChannel for touch events from viewer
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

  pc.oniceconnectionstatechange = () => console.error('[offscreen] ICE state:', pc.iceConnectionState)

  ws.onerror = (e) => console.error('[offscreen] ws error', e)
  ws.onclose = (e) => console.error('[offscreen] ws close', e.code, e.reason)

  ws.onopen = async () => {
    console.error('[offscreen] ws open — sending role + offer')
    ws.send(JSON.stringify({ type: 'role', role: 'host' }))
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }))
      console.error('[offscreen] offer sent')
    } catch (e) {
      console.error('[offscreen] offer error:', e?.message ?? e)
    }
  }

  ws.onmessage = async (evt) => {
    const msg = JSON.parse(evt.data)
    if (msg.type === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
      console.error('[offscreen] answer set')
    } else if (msg.type === 'ice' && msg.candidate) {
      await pc.addIceCandidate(msg.candidate)
    }
  }
}
