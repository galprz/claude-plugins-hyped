setInterval(() => chrome.runtime.sendMessage({ type: 'keepalive' }), 20000)
