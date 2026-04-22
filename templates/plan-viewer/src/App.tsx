import { useState } from 'react'
import type { Flag } from './types'
import { PLAN } from './plan-data'
import { AudioPlayer } from './AudioPlayer'

type FlagKey = `${string}:${number}`

const FLAG_STYLE = {
  risk:      { bg: 'bg-red-500/10 border-red-500/25',     icon: '⚠', label: 'Risk',      text: 'text-red-400' },
  question:  { bg: 'bg-blue-500/10 border-blue-500/25',   icon: '?', label: 'Open Q',    text: 'text-blue-400' },
  ambiguity: { bg: 'bg-amber-500/10 border-amber-500/25', icon: '~', label: 'Ambiguity', text: 'text-amber-400' },
} as const

function FlagCard({
  flag,
  response,
  onResponse,
}: {
  flag: Flag
  response: string
  onResponse: (v: string) => void
}) {
  const s = FLAG_STYLE[flag.type]
  return (
    <div className={`flex flex-col gap-2 border rounded-lg px-3 py-2.5 ${s.bg}`}>
      <div className="flex gap-2.5">
        <span className={`text-xs font-bold mt-0.5 shrink-0 ${s.text}`}>{s.icon}</span>
        <div className="min-w-0">
          <span className={`text-[10px] font-semibold uppercase tracking-wide mr-1.5 ${s.text}`}>{s.label}</span>
          <span className="text-xs text-gray-300">{flag.text}</span>
        </div>
      </div>
      {flag.suggestions && flag.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flag.suggestions.map(suggestion => (
            <button
              key={suggestion}
              onClick={() => onResponse(suggestion)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                ${response === suggestion
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={response}
        onChange={e => onResponse(e.target.value)}
        placeholder={flag.suggestions ? 'Or write your own…' : 'Your response…'}
        rows={2}
        className="w-full bg-gray-950/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500 transition-colors"
      />
    </div>
  )
}

export default function App() {
  const [active, setActive] = useState(PLAN.tasks[0]?.id ?? '')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [responses, setResponses] = useState<Record<FlagKey, string>>({})
  const [saving, setSaving] = useState<'idle' | 'saving' | 'notifying' | 'done' | 'error'>('idle')

  const params = new URLSearchParams(window.location.search)
  const chatId = params.get('chat_id') ?? ''
  const token = params.get('_token')
  const apiBase = `${window.location.protocol}//${window.location.host}`
  const authHeader = token ? `Basic ${btoa(`hyped:${token}`)}` : undefined
  const activeTask = PLAN.tasks.find(t => t.id === active)
  const totalFlags = PLAN.tasks.reduce((n, t) => n + (t.flags?.length ?? 0), 0)
  const answeredCount = Object.values(responses).filter(v => v.trim()).length

  const setResponse = (taskId: string, flagIdx: number, value: string) => {
    setResponses(prev => ({ ...prev, [`${taskId}:${flagIdx}`]: value }))
  }

  const saveReview = async () => {
    setSaving('saving')
    const payload = {
      plan: PLAN.title,
      reviewed_at: new Date().toISOString(),
      responses: PLAN.tasks.flatMap(t =>
        (t.flags ?? [])
          .map((f, i) => ({
            task: t.title,
            flag: { type: f.type, text: f.text },
            response: responses[`${t.id}:${i}` as FlagKey] ?? '',
          }))
          .filter(r => r.response.trim())
      ),
    }
    try {
      const extraHeaders = authHeader ? { 'Authorization': authHeader } : {}
      await fetch(`${apiBase}/save-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify(payload),
      })
      setSaving('notifying')
      if (chatId) {
        await fetch(`${apiBase}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
          body: JSON.stringify({ chat_id: chatId }),
        })
      }
      setSaving('done')
    } catch {
      setSaving('error')
      setTimeout(() => setSaving('idle'), 3000)
    }
  }

  if (!activeTask) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center text-gray-500">
        No tasks in plan.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col md:flex-row">

      {/* Sidebar */}
      <aside className="md:w-64 md:min-h-screen md:border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-4 pt-5 pb-4 border-b border-gray-800">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">alignment review</div>
          <div className="text-sm font-semibold leading-snug">{PLAN.title}</div>
          <div className="mt-2 text-xs text-gray-400 leading-relaxed">{PLAN.goal}</div>
          {totalFlags > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
              <span>⚠</span>
              <span>{totalFlags} item{totalFlags !== 1 ? 's' : ''} need your attention</span>
            </div>
          )}
        </div>

        <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto md:overflow-y-auto md:flex-1">
          {PLAN.tasks.map(t => {
            const flagCount = t.flags?.length ?? 0
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shrink-0 md:w-full text-left
                  ${active === t.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
              >
                <span className="text-sm whitespace-nowrap md:whitespace-normal truncate flex-1">{t.title}</span>
                {flagCount > 0 && (
                  <span className="shrink-0 w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[10px] flex items-center justify-center font-bold">
                    {flagCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-800 flex flex-col gap-2">
          <button
            onClick={saveReview}
            disabled={saving !== 'idle' || answeredCount === 0}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {saving === 'idle'      ? `Save Review${answeredCount > 0 ? ` (${answeredCount})` : ''}` :
             saving === 'saving'    ? 'Saving…' :
             saving === 'notifying' ? 'Notifying Claude…' :
             saving === 'done'      ? 'Claude notified ✓' :
                                     'Error — try again'}
          </button>
          {saving === 'done' && (
            <p className="text-[11px] text-gray-500 text-center leading-relaxed">
              Claude will reply in this Telegram chat shortly.
            </p>
          )}
          {!chatId && (
            <p className="text-[11px] text-amber-500/70 text-center">
              No chat_id in URL — notification disabled
            </p>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 md:p-8 flex flex-col gap-4 max-w-2xl mx-auto w-full">

        <AudioPlayer />

        {activeTask.flags && activeTask.flags.length > 0 && (
          <div className="flex flex-col gap-2">
            {activeTask.flags.map((f, i) => (
              <FlagCard
                key={i}
                flag={f}
                response={responses[`${active}:${i}` as FlagKey] ?? ''}
                onResponse={v => setResponse(active, i, v)}
              />
            ))}
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
          <div className="text-base font-semibold">{activeTask.title}</div>
          <div className="flex flex-col gap-1">
            {activeTask.steps.map((step, i) => (
              <div key={i}>
                <button
                  onClick={() => step.code ? setExpanded(expanded === i ? null : i) : undefined}
                  className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-colors bg-gray-800/40
                    ${step.code ? 'hover:bg-gray-800/60 cursor-pointer' : 'cursor-default'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0 mt-px" />
                  <span className="text-sm text-gray-200 flex-1">{step.label}</span>
                  {step.code && (
                    <svg className={`w-3.5 h-3.5 text-gray-600 transition-transform shrink-0 ${expanded === i ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 12 12">
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                {step.code && expanded === i && (
                  <pre className="mt-1 mx-2 text-xs bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto text-gray-400 leading-relaxed">
                    <code>{step.code}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {(() => {
            const idx = PLAN.tasks.findIndex(t => t.id === active)
            return (
              <>
                <button
                  onClick={() => idx > 0 && setActive(PLAN.tasks[idx - 1].id)}
                  disabled={idx === 0}
                  className="flex-1 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >← Prev</button>
                <button
                  onClick={() => idx < PLAN.tasks.length - 1 && setActive(PLAN.tasks[idx + 1].id)}
                  disabled={idx === PLAN.tasks.length - 1}
                  className="flex-1 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >Next →</button>
              </>
            )
          })()}
        </div>
      </main>
    </div>
  )
}
