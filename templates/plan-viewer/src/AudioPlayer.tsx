import { useState, useRef } from 'react'

export function AudioPlayer() {
  const [playing, setPlaying] = useState(false)
  const ref = useRef<HTMLAudioElement>(null)

  const toggle = () => {
    if (!ref.current) return
    playing ? ref.current.pause() : ref.current.play()
    setPlaying(!playing)
  }

  return (
    <div className="flex items-center gap-3 bg-indigo-950/50 border border-indigo-500/20 rounded-xl px-4 py-3">
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shrink-0 transition-colors"
      >
        {playing
          ? <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12"><rect x="2" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/></svg>
          : <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 12 12"><path d="M2 1l9 5-9 5V1z"/></svg>
        }
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-indigo-300">Before you approve</div>
        <div className="text-xs text-indigo-400/60 truncate">Key risks · open questions · ambiguities</div>
      </div>
      <audio ref={ref} src="/walkthrough.opus" onEnded={() => setPlaying(false)} />
    </div>
  )
}
