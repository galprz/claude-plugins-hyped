chrome.storage.local.get(['status', 'activeSessions'], ({ status, activeSessions }) => {
  const dot     = document.getElementById('dot')
  const label   = document.getElementById('label')
  const detail  = document.getElementById('detail')
  const hint    = document.getElementById('hint')

  if (status === 'connected') {
    dot.className   = 'dot connected'
    label.className = 'status-label connected'
    label.textContent = 'Connected'
    detail.textContent = activeSessions
      ? `${activeSessions} active session${activeSessions > 1 ? 's' : ''}`
      : 'Ready — no active sessions'
    hint.textContent = 'This browser can be controlled by Hyped agents.'
  } else {
    dot.className   = 'dot disconnected'
    label.className = 'status-label disconnected'
    label.textContent = 'Disconnected'
    detail.textContent = 'Daemon not running'
    hint.textContent = 'Start the Hyped daemon to allow agents to control this browser.'
  }
})
