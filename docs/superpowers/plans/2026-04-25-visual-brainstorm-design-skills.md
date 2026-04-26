# Visual Brainstorm & Design Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `plan-viewer` template with Mermaid diagram and wireframe rendering, then add two new skills (`brainstorm-visual`, `design-visual`) and update `visualize-plan`.

**Architecture:** Add `DiagramBlock` and `WireframeBlock` to `plan-viewer`'s type system and render them in `App.tsx` using Mermaid v10 (in-browser SVG) and sandboxed iframes. Two new skills each carry their own `resources/` directory (Mermaid templates, wireframe component snippets, worked example). `visualize-plan` gets a "NOT for diagrams" note.

**Tech Stack:** React 19, Vite 6, Tailwind v4, Mermaid v11, TypeScript, Bun

---

## Task 1: Extend types.ts + add mermaid dependency

**Files:**
- Modify: `templates/plan-viewer/src/types.ts`
- Modify: `templates/plan-viewer/package.json`

- [ ] **Step 1: Write a type-check test that references the new types**

Create `templates/plan-viewer/src/plan-data.ts` content that uses `DiagramBlock` and `WireframeBlock` — this will fail to compile until the types exist. Add to the *existing* `plan-data.ts`:

```ts
// Temporarily at the top of plan-data.ts — remove after Task 1
import type { DiagramBlock, WireframeBlock } from './types'
const _diagTest: DiagramBlock = { type: 'diagram', diagramType: 'architecture', title: 'T', mermaid: '' }
const _wireTest: WireframeBlock = { type: 'wireframe', title: 'T', alternatives: [] }
void _diagTest; void _wireTest
```

- [ ] **Step 2: Run type-check to verify RED**

```bash
cd ~/projects/claude-plugins-hyped/templates/plan-viewer
bun run build 2>&1 | grep "error TS"
```
Expected: `error TS2305: Module '"./types"' has no exported member 'DiagramBlock'`

- [ ] **Step 3: Add new types to types.ts**

Replace the full contents of `templates/plan-viewer/src/types.ts` with:

```ts
export interface Flag {
  type: 'risk' | 'question' | 'ambiguity'
  text: string
  suggestions?: string[]
}

export interface PlanStep {
  label: string
  code?: string
}

export interface DiagramBlock {
  type: 'diagram'
  diagramType: 'architecture' | 'sequence' | 'flowchart'
  title: string
  mermaid: string
}

export interface WireframeAlternative {
  id: string
  label: string
  description: string
  html: string
}

export interface WireframeBlock {
  type: 'wireframe'
  title: string
  alternatives: WireframeAlternative[]
}

export interface PlanTask {
  id: string
  title: string
  steps: PlanStep[]
  flags?: Flag[]
  blocks?: (DiagramBlock | WireframeBlock)[]
}

export interface PlanData {
  title: string
  goal: string
  tasks: PlanTask[]
}
```

- [ ] **Step 4: Add mermaid to package.json**

```json
"dependencies": {
  "mermaid": "^11.0.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0"
}
```

- [ ] **Step 5: Install and verify GREEN**

```bash
cd ~/projects/claude-plugins-hyped/templates/plan-viewer
bun install --no-summary
bun run build 2>&1 | tail -5
```
Expected: `✓ built in ...ms` (or type errors only from the temp test code — remove the `_diagTest`/`_wireTest` lines from `plan-data.ts` if they cause issues, they were just for RED verification)

- [ ] **Step 6: Remove temp type-check lines from plan-data.ts**

Delete the 4 lines added in Step 1 from `plan-data.ts`, leaving it as it was.

- [ ] **Step 7: Commit**

```bash
cd ~/projects/claude-plugins-hyped
git add templates/plan-viewer/src/types.ts templates/plan-viewer/package.json templates/plan-viewer/bun.lock
git commit -m "feat(plan-viewer): add DiagramBlock and WireframeBlock types + mermaid dep"
```

---

## Task 2: DiagramBlock rendering component

**Files:**
- Modify: `templates/plan-viewer/src/App.tsx`

- [ ] **Step 1: Verify build passes before touching App.tsx**

```bash
cd ~/projects/claude-plugins-hyped/templates/plan-viewer
bun run build 2>&1 | tail -3
```
Expected: clean build.

- [ ] **Step 2: Add DiagramBlock renderer to App.tsx**

Add these imports at the top of `App.tsx` (after existing imports):

```ts
import { useEffect, useId, useState as useSt } from 'react'
import type { DiagramBlock, WireframeBlock, WireframeAlternative } from './types'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'dark' })
```

Then add the `DiagramCard` component before the `FlagCard` function:

```tsx
function DiagramCard({ block }: { block: DiagramBlock }) {
  const uid = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSvg(null)
    setError(null)
    mermaid.render(`mermaid-${uid}`, block.mermaid)
      .then(({ svg: s }) => setSvg(s))
      .catch(e => setError(String(e)))
  }, [block.mermaid, uid])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{block.diagramType} · {block.title}</div>
      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-400 font-mono whitespace-pre-wrap">{error}</div>
      ) : svg ? (
        <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="text-xs text-gray-600 animate-pulse">Rendering…</div>
      )}
    </div>
  )
}
```

Note: The top-level `useState` import is already in App.tsx. Add a second alias `useSt` or just use the existing `useState` — whichever is cleaner given the existing code. Remove `useSt` from the import if you use `useState` directly.

- [ ] **Step 3: Wire DiagramCard into the active task rendering**

In `App.tsx`, find the `{activeTask.flags && ...}` block and add blocks rendering **after** it (before the steps card):

```tsx
{activeTask.blocks && activeTask.blocks.length > 0 && (
  <div className="flex flex-col gap-3">
    {activeTask.blocks.map((block, i) =>
      block.type === 'diagram' ? (
        <DiagramCard key={i} block={block} />
      ) : null
    )}
  </div>
)}
```

(WireframeBlock rendering comes in Task 3 — leave `null` for now.)

- [ ] **Step 4: Verify build GREEN**

```bash
cd ~/projects/claude-plugins-hyped/templates/plan-viewer
bun run build 2>&1 | tail -5
```
Expected: clean build, no TS errors.

- [ ] **Step 5: Quick smoke test — add a diagram to plan-data.ts and verify it renders**

Temporarily add a block to the first task in `plan-data.ts`:

```ts
blocks: [
  {
    type: 'diagram' as const,
    diagramType: 'architecture' as const,
    title: 'Test',
    mermaid: `graph LR\n  A[Claude] --> B[Daemon]\n  B --> C[Git]`,
  }
]
```

Run `bun run dev`, open `http://localhost:5173`, confirm diagram renders. Then run with invalid mermaid (`mermaid: "not valid ~~~"`) and confirm a red error box appears. Remove the temp block after verifying.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/claude-plugins-hyped
git add templates/plan-viewer/src/App.tsx
git commit -m "feat(plan-viewer): add DiagramCard component with mermaid rendering + hard-error on invalid syntax"
```

---

## Task 3: WireframeBlock rendering + save payload extension

**Files:**
- Modify: `templates/plan-viewer/src/App.tsx`

- [ ] **Step 1: Add WireframeCard component to App.tsx**

Add after `DiagramCard`:

```tsx
function WireframeCard({
  taskId,
  block,
  picked,
  onPick,
}: {
  taskId: string
  block: WireframeBlock
  picked: string | null
  onPick: (altId: string) => void
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">wireframe · {block.title}</div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {block.alternatives.map(alt => (
          <div key={alt.id} className="flex flex-col gap-2 shrink-0 w-72">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300">{alt.label}</span>
              <button
                onClick={() => onPick(alt.id)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors
                  ${picked === alt.id
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
              >
                {picked === alt.id ? '✓ Picked' : 'Pick this'}
              </button>
            </div>
            <div className="text-[11px] text-gray-500">{alt.description}</div>
            <iframe
              srcDoc={alt.html}
              sandbox="allow-scripts"
              className="w-full h-48 rounded-lg border border-gray-700 bg-white"
              title={`${block.title} – ${alt.label}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add wireframe picks state to App component**

In `App()`, after the `responses` state, add:

```ts
const [wirePicks, setWirePicks] = useState<Record<string, string>>({})
const pickWireframe = (taskId: string, altId: string) =>
  setWirePicks(prev => ({ ...prev, [taskId]: altId }))
```

- [ ] **Step 3: Wire WireframeCard into the blocks render section**

Replace the current blocks rendering (from Task 2) with:

```tsx
{activeTask.blocks && activeTask.blocks.length > 0 && (
  <div className="flex flex-col gap-3">
    {activeTask.blocks.map((block, i) =>
      block.type === 'diagram' ? (
        <DiagramCard key={i} block={block} />
      ) : (
        <WireframeCard
          key={i}
          taskId={active}
          block={block}
          picked={wirePicks[active] ?? null}
          onPick={altId => pickWireframe(active, altId)}
        />
      )
    )}
  </div>
)}
```

- [ ] **Step 4: Extend saveReview to include wireframe picks**

In the `saveReview` function, extend the `payload` object:

```ts
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
  wireframes: Object.fromEntries(
    Object.entries(wirePicks).map(([taskId, altId]) => [`${taskId}:${altId}`, true])
  ),
}
```

- [ ] **Step 5: Update answeredCount to include wireframe picks**

Replace:
```ts
const answeredCount = Object.values(responses).filter(v => v.trim()).length
```
With:
```ts
const answeredCount = Object.values(responses).filter(v => v.trim()).length + Object.keys(wirePicks).length
```

- [ ] **Step 6: Build GREEN**

```bash
cd ~/projects/claude-plugins-hyped/templates/plan-viewer
bun run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 7: Smoke test wireframes**

Add a wireframe block to `plan-data.ts` first task temporarily:

```ts
{
  type: 'wireframe' as const,
  title: 'Layout options',
  alternatives: [
    {
      id: 'sidebar',
      label: 'Option A',
      description: 'Sidebar navigation',
      html: '<html><body style="font-family:sans-serif;padding:16px"><h3>Sidebar layout</h3><p>Nav on left, content right</p></body></html>',
    },
    {
      id: 'topnav',
      label: 'Option B',
      description: 'Top nav',
      html: '<html><body style="font-family:sans-serif;padding:16px"><h3>Top nav layout</h3><p>Nav on top, content below</p></body></html>',
    },
  ],
}
```

Run dev server, confirm both alternatives render in iframes, "Pick this" button highlights. Remove temp block.

- [ ] **Step 8: Commit**

```bash
cd ~/projects/claude-plugins-hyped
git add templates/plan-viewer/src/App.tsx
git commit -m "feat(plan-viewer): add WireframeCard with pick buttons; extend save payload with wireframes"
```

---

## Task 4: brainstorm-visual skill + resources

**Files:**
- Create: `skills/brainstorm-visual/SKILL.md`
- Create: `skills/brainstorm-visual/resources/mermaid-templates.md`
- Create: `skills/brainstorm-visual/resources/wireframe-components.html`
- Create: `skills/brainstorm-visual/resources/example-plan-data.ts`

- [ ] **Step 1: Create SKILL.md**

Create `~/projects/claude-plugins-hyped/skills/brainstorm-visual/SKILL.md`:

```markdown
# Skill: brainstorm-visual

**Use this skill when:**
- You are mid-brainstorm and a question is inherently visual — layout options, architecture comparisons, component structure, data flow between services
- You have 2–3 candidate designs and the user needs to see them to choose
- A wireframe comparison would resolve a question faster than back-and-forth text

**Do NOT use this skill for:**
- Conceptual questions (tradeoffs, scope, priorities) — answer those in text
- Post-spec design review — use `design-visual` instead
- Post-plan task alignment — use `visualize-plan` instead

---

## Execution Flow

### 1. Read all resources upfront

Before building the UI, read these files in full:
- `~/.hyped/plugins/claude-plugins-hyped/skills/brainstorm-visual/resources/mermaid-templates.md`
- `~/.hyped/plugins/claude-plugins-hyped/skills/brainstorm-visual/resources/wireframe-components.html`
- `~/.hyped/plugins/claude-plugins-hyped/skills/brainstorm-visual/resources/example-plan-data.ts`

Use the templates and components as building blocks — never write Mermaid syntax or wireframe HTML from scratch.

### 2. Set up the project directory

```bash
FEATURE=<kebab-case-feature-name>
PLUGIN_ROOT=~/.hyped/plugins/claude-plugins-hyped
cp -r ${PLUGIN_ROOT}/templates/plan-viewer /tmp/plan-viewer-${FEATURE}
cd /tmp/plan-viewer-${FEATURE}
bun install --no-summary
```

### 3. Populate src/plan-data.ts

Map the open visual questions to tasks. Each task should contain:
- `blocks`: one or more `DiagramBlock` or `WireframeBlock` entries showing the alternatives
- `flags`: open questions / risks that accompany the visual (optional)
- `steps`: brief context lines explaining what this section is about

Use the `example-plan-data.ts` as the format reference.

**Data shape:**
```ts
import type { PlanData } from './types'

export const PLAN: PlanData = {
  title: 'Feature Name — Visual Brainstorm',
  goal: 'Resolve open design questions visually before writing the spec.',
  tasks: [
    {
      id: '1',
      title: 'Architecture Options',
      steps: [{ label: 'Two candidate architectures for the data flow' }],
      blocks: [
        {
          type: 'diagram',
          diagramType: 'architecture',
          title: 'Option A — Event-driven',
          mermaid: `...` // from mermaid-templates.md
        },
      ],
      flags: [
        { type: 'question', text: 'Which approach fits better?', suggestions: ['Option A', 'Option B'] }
      ]
    }
  ]
}
```

### 4. Build validation

```bash
cd /tmp/plan-viewer-${FEATURE}
bun run build
```

Fix any TypeScript or Mermaid syntax errors before proceeding. Invalid Mermaid syntax causes a hard error in the UI — get it right at this step.

### 5. Open tunnel + start dev server

Follow the `use-local-tunnel` skill to expose `http://localhost:5200`.

```bash
lsof -i :5200 | grep LISTEN || echo "5200 is free"
PLAN_TOKEN=<token-from-tunnel> bun run dev --port 5200 --host &
sleep 2
```

### 6. Screenshot and send URL

Screenshot `http://localhost:5200?_token=<token>` with user-browser. Send the tunnel URL as plain text (no markdown). Append `?chat_id=<CHAT_ID>&thread_id=<THREAD_ID>&_token=<token>`.

### 7. After user saves

Read `/tmp/plan-viewer-${FEATURE}/review.json`. Extract wireframe picks and flag responses. Use them to resolve the open design questions and continue the brainstorming flow (write spec → invoke `writing-plans`).

---

## Rules
- Read all resources before populating plan-data.ts
- Never write Mermaid syntax from scratch — adapt from mermaid-templates.md
- Never write wireframe HTML from scratch — compose from wireframe-components.html
- Invalid Mermaid = hard error in UI; validate syntax before serving
- Follow `use-local-tunnel` skill for all tunnel steps
```

- [ ] **Step 2: Create mermaid-templates.md**

Create `~/projects/claude-plugins-hyped/skills/brainstorm-visual/resources/mermaid-templates.md`:

````markdown
# Mermaid Templates

Reference: types.ts `DiagramBlock.diagramType` = `'architecture' | 'sequence' | 'flowchart'`

## Architecture — 3-Tier

```
graph LR
  subgraph Client
    UI[Web / Mobile]
  end
  subgraph API
    GW[API Gateway]
    SVC[Service Layer]
  end
  subgraph Data
    DB[(Database)]
    Cache[(Cache)]
  end
  UI --> GW --> SVC --> DB
  SVC --> Cache
```

## Architecture — Event-Driven

```
graph LR
  P[Producer Service] --> BUS[Message Bus]
  BUS --> C1[Consumer A]
  BUS --> C2[Consumer B]
  BUS --> C3[Consumer C]
  C1 --> DB1[(Store A)]
  C2 --> DB2[(Store B)]
```

## Architecture — Claude → Daemon Flow

```
graph LR
  CC[Claude Code] -->|MCP tool call| MCP[MCP Plugin]
  MCP -->|HTTP POST| D[Daemon :7891]
  D --> GIT[git worktree]
  D --> TG[Telegram API]
  D --> FS[JSON on disk]
  D -->|response| MCP -->|result| CC
```

## Architecture — Microservices

```
graph TB
  GW[API Gateway] --> AUTH[Auth Service]
  GW --> USERS[User Service]
  GW --> NOTIF[Notification Service]
  AUTH --> DB_AUTH[(Auth DB)]
  USERS --> DB_USERS[(Users DB)]
  NOTIF --> QUEUE[Message Queue]
  QUEUE --> EMAIL[Email Worker]
  QUEUE --> PUSH[Push Worker]
```

## Sequence — Auth Flow

```
sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant API as API
  participant DB as Database
  U->>FE: Login (email, password)
  FE->>API: POST /auth/login
  API->>DB: SELECT user WHERE email=?
  DB-->>API: User record
  API-->>FE: JWT token
  FE-->>U: Redirect to dashboard
```

## Sequence — MCP Tool Call

```
sequenceDiagram
  participant C as Claude
  participant MCP as MCP Plugin
  participant D as Daemon
  participant EXT as External (Git/Telegram)
  C->>MCP: tool_call(name, args)
  MCP->>D: POST /api/endpoint
  D->>EXT: Side effect
  EXT-->>D: Result
  D-->>MCP: JSON response
  MCP-->>C: tool_result text
```

## Flowchart — Decision Tree

```
flowchart TD
  START([Start]) --> CHECK{Condition?}
  CHECK -->|Yes| ACTION_A[Do A]
  CHECK -->|No| ACTION_B[Do B]
  ACTION_A --> DONE([Done])
  ACTION_B --> RETRY{Retry?}
  RETRY -->|Yes| CHECK
  RETRY -->|No| ERROR([Error])
```

## Flowchart — CRUD Operations

```
flowchart LR
  API[API Request] --> VALID{Valid?}
  VALID -->|No| ERR[400 Error]
  VALID -->|Yes| AUTH{Authorized?}
  AUTH -->|No| UNAUTH[403 Error]
  AUTH -->|Yes| OP{Operation}
  OP -->|Create| INSERT[INSERT DB]
  OP -->|Read| SELECT[SELECT DB]
  OP -->|Update| UPDATE[UPDATE DB]
  OP -->|Delete| DELETE[DELETE DB]
  INSERT & SELECT & UPDATE & DELETE --> RESP[200 Response]
```
````

- [ ] **Step 3: Create wireframe-components.html**

Create `~/projects/claude-plugins-hyped/skills/brainstorm-visual/resources/wireframe-components.html`:

```html
<!--
  Wireframe Component Library
  Usage: copy relevant snippets into WireframeAlternative.html
  Each snippet is a self-contained HTML document.
  Compose by combining snippets into one <html> document.
-->

<!-- ===== NAVBAR ===== -->
<!--
<nav style="display:flex;align-items:center;gap:16px;padding:12px 20px;background:#1a1a2e;color:#fff;font-family:sans-serif">
  <span style="font-weight:700;font-size:16px">Logo</span>
  <span style="flex:1"></span>
  <a href="#" style="color:#aaa;text-decoration:none;font-size:14px">Home</a>
  <a href="#" style="color:#aaa;text-decoration:none;font-size:14px">Features</a>
  <a href="#" style="color:#aaa;text-decoration:none;font-size:14px">Docs</a>
  <button style="background:#6366f1;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px">Sign in</button>
</nav>
-->

<!-- ===== SIDEBAR LAYOUT ===== -->
<!--
<div style="display:flex;height:100vh;font-family:sans-serif;font-size:13px">
  <aside style="width:200px;background:#111;color:#ccc;padding:16px;display:flex;flex-direction:column;gap:4px">
    <div style="font-weight:700;color:#fff;font-size:15px;margin-bottom:12px">App</div>
    <a href="#" style="color:#fff;background:#6366f1;padding:6px 10px;border-radius:6px;text-decoration:none">Dashboard</a>
    <a href="#" style="color:#aaa;padding:6px 10px;text-decoration:none">Projects</a>
    <a href="#" style="color:#aaa;padding:6px 10px;text-decoration:none">Settings</a>
  </aside>
  <main style="flex:1;padding:24px;background:#0f0f0f;color:#e5e5e5">
    <h2 style="margin:0 0 16px">Dashboard</h2>
    <p style="color:#888">Main content area</p>
  </main>
</div>
-->

<!-- ===== CARD GRID ===== -->
<!--
<div style="padding:20px;background:#0f0f0f;font-family:sans-serif">
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:16px">
      <div style="font-size:12px;color:#888;margin-bottom:4px">Metric</div>
      <div style="font-size:24px;font-weight:700;color:#fff">1,284</div>
      <div style="font-size:11px;color:#4ade80;margin-top:4px">↑ 12% this week</div>
    </div>
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:16px">
      <div style="font-size:12px;color:#888;margin-bottom:4px">Metric B</div>
      <div style="font-size:24px;font-weight:700;color:#fff">42</div>
      <div style="font-size:11px;color:#f87171;margin-top:4px">↓ 3% this week</div>
    </div>
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:16px">
      <div style="font-size:12px;color:#888;margin-bottom:4px">Metric C</div>
      <div style="font-size:24px;font-weight:700;color:#fff">99%</div>
      <div style="font-size:11px;color:#888;margin-top:4px">No change</div>
    </div>
  </div>
</div>
-->

<!-- ===== FORM ===== -->
<!--
<div style="padding:24px;background:#0f0f0f;font-family:sans-serif;color:#e5e5e5;max-width:400px">
  <h3 style="margin:0 0 20px;font-size:16px">Create workspace</h3>
  <div style="display:flex;flex-direction:column;gap:14px">
    <div>
      <label style="display:block;font-size:12px;color:#888;margin-bottom:4px">Name</label>
      <input style="width:100%;box-sizing:border-box;background:#1a1a1a;border:1px solid #444;border-radius:7px;padding:8px 12px;color:#fff;font-size:13px" placeholder="my-feature" />
    </div>
    <div>
      <label style="display:block;font-size:12px;color:#888;margin-bottom:4px">Project</label>
      <select style="width:100%;background:#1a1a1a;border:1px solid #444;border-radius:7px;padding:8px 12px;color:#fff;font-size:13px">
        <option>hyped</option><option>client-a</option>
      </select>
    </div>
    <button style="background:#6366f1;color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Create</button>
  </div>
</div>
-->

<!-- ===== TABLE ===== -->
<!--
<div style="padding:20px;background:#0f0f0f;font-family:sans-serif">
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr style="border-bottom:1px solid #333">
        <th style="text-align:left;padding:8px 12px;color:#888;font-weight:500">Name</th>
        <th style="text-align:left;padding:8px 12px;color:#888;font-weight:500">Status</th>
        <th style="text-align:left;padding:8px 12px;color:#888;font-weight:500">Last run</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #222">
        <td style="padding:10px 12px;color:#e5e5e5">daily-standup</td>
        <td style="padding:10px 12px"><span style="background:#4ade80/20;color:#4ade80;border-radius:20px;padding:2px 8px;font-size:11px;background:#052e16">Active</span></td>
        <td style="padding:10px 12px;color:#888">2h ago</td>
      </tr>
      <tr>
        <td style="padding:10px 12px;color:#e5e5e5">health-check</td>
        <td style="padding:10px 12px"><span style="color:#f87171;border-radius:20px;padding:2px 8px;font-size:11px;background:#2d0a0a">Failed</span></td>
        <td style="padding:10px 12px;color:#888">5m ago</td>
      </tr>
    </tbody>
  </table>
</div>
-->

<!-- ===== MODAL ===== -->
<!--
<div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-family:sans-serif">
  <div style="background:#1a1a1a;border:1px solid #333;border-radius:14px;padding:24px;width:320px">
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
      <span style="font-size:15px;font-weight:600;color:#fff">Confirm action</span>
      <span style="color:#888;cursor:pointer;font-size:18px">×</span>
    </div>
    <p style="color:#888;font-size:13px;margin:0 0 20px">Are you sure you want to delete this workspace? This cannot be undone.</p>
    <div style="display:flex;gap:8px">
      <button style="flex:1;padding:9px;background:#222;border:1px solid #444;border-radius:8px;color:#aaa;cursor:pointer;font-size:13px">Cancel</button>
      <button style="flex:1;padding:9px;background:#dc2626;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Delete</button>
    </div>
  </div>
</div>
-->

<!-- ===== CHAT LIST ===== -->
<!--
<div style="display:flex;flex-direction:column;gap:0;font-family:sans-serif;background:#0f0f0f;height:300px;overflow-y:auto;padding:8px">
  <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:8px">
    <div style="width:32px;height:32px;border-radius:50%;background:#6366f1;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700">C</div>
    <div>
      <div style="font-size:11px;color:#888;margin-bottom:2px">Claude · 2m ago</div>
      <div style="background:#1a1a1a;border-radius:0 8px 8px 8px;padding:8px 12px;color:#e5e5e5;font-size:13px;max-width:280px">Want me to set up a workspace for this?</div>
    </div>
  </div>
  <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:8px;flex-direction:row-reverse">
    <div style="width:32px;height:32px;border-radius:50%;background:#444;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px">G</div>
    <div>
      <div style="font-size:11px;color:#888;margin-bottom:2px;text-align:right">You · 1m ago</div>
      <div style="background:#6366f1;border-radius:8px 0 8px 8px;padding:8px 12px;color:#fff;font-size:13px;max-width:280px">Yes please</div>
    </div>
  </div>
</div>
-->

<!-- ===== EMPTY STATE ===== -->
<!--
<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;font-family:sans-serif;color:#666;text-align:center">
  <div style="font-size:40px;margin-bottom:16px">📭</div>
  <div style="font-size:16px;font-weight:600;color:#888;margin-bottom:8px">No items yet</div>
  <div style="font-size:13px;max-width:240px;line-height:1.6">Create your first item to get started.</div>
  <button style="margin-top:20px;background:#6366f1;color:#fff;border:none;padding:9px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Create item</button>
</div>
-->
```

- [ ] **Step 4: Create example-plan-data.ts**

Create `~/projects/claude-plugins-hyped/skills/brainstorm-visual/resources/example-plan-data.ts`:

```ts
// EXAMPLE: brainstorm-visual plan-data.ts
// This is a format reference — copy structure, replace content.
// Feature: workspace setup — deciding between two architecture approaches

import type { PlanData } from '../../../templates/plan-viewer/src/types'

export const PLAN: PlanData = {
  title: 'Workspace Setup — Visual Brainstorm',
  goal: 'Decide between two architectures for the workspace_set feature before writing the spec.',
  tasks: [
    {
      id: '1',
      title: 'Architecture Comparison',
      steps: [
        { label: 'Two approaches: MCP-driven vs daemon-polling' },
        { label: 'Key difference: who initiates the workspace creation' },
      ],
      blocks: [
        {
          type: 'diagram',
          diagramType: 'architecture',
          title: 'Option A — MCP-driven (recommended)',
          mermaid: `graph LR
  CC[Claude Code] -->|workspace_set| MCP[MCP Plugin]
  MCP -->|POST /api/workspace| D[Daemon]
  D --> GIT[git worktree add]
  D --> TG[setChatTitle]
  D -->|worktree_path| MCP
  MCP -->|result| CC`,
        },
        {
          type: 'diagram',
          diagramType: 'architecture',
          title: 'Option B — Polling (current, broken)',
          mermaid: `graph LR
  D[Daemon] -->|every 30s| FS[Read .git/HEAD]
  FS -->|branch changed?| TG[setChatTitle]`,
        },
      ],
      flags: [
        {
          type: 'question',
          text: 'Which architecture should we build?',
          suggestions: ['Option A — MCP-driven', 'Option B — keep polling'],
        },
      ],
    },
    {
      id: '2',
      title: 'Telegram Confirmation UI',
      steps: [
        { label: 'After workspace_set succeeds, Claude sends a confirmation message' },
        { label: 'Two options: inline text vs a formatted card with details' },
      ],
      blocks: [
        {
          type: 'wireframe',
          title: 'Confirmation message format',
          alternatives: [
            {
              id: 'inline',
              label: 'Option A',
              description: 'Simple inline text',
              html: `<html><body style="font-family:sans-serif;padding:16px;background:#0f0f0f;color:#e5e5e5">
<p style="font-size:14px">Workspace set: <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px">feature/auth-system</code> at <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px">.worktrees/auth-system</code></p>
</body></html>`,
            },
            {
              id: 'card',
              label: 'Option B',
              description: 'Formatted blockquote card',
              html: `<html><body style="font-family:sans-serif;padding:16px;background:#0f0f0f;color:#e5e5e5">
<blockquote style="border-left:3px solid #6366f1;margin:0;padding:12px 16px;background:#1a1a1a;border-radius:0 8px 8px 0">
  <div style="font-size:12px;color:#888;margin-bottom:6px">🛠 Workspace ready</div>
  <div style="font-size:13px;margin-bottom:4px"><b>Branch:</b> feature/auth-system</div>
  <div style="font-size:13px;margin-bottom:4px"><b>Path:</b> .worktrees/auth-system</div>
  <div style="font-size:13px"><b>Group:</b> hyped [feature/auth-system]</div>
</blockquote>
</body></html>`,
            },
          ],
        },
      ],
      flags: [
        {
          type: 'question',
          text: 'Which confirmation format do you prefer?',
          suggestions: ['Option A — simple', 'Option B — card'],
        },
      ],
    },
  ],
}
```

- [ ] **Step 5: Verify the skill directory structure**

```bash
find ~/projects/claude-plugins-hyped/skills/brainstorm-visual -type f
```
Expected:
```
skills/brainstorm-visual/SKILL.md
skills/brainstorm-visual/resources/mermaid-templates.md
skills/brainstorm-visual/resources/wireframe-components.html
skills/brainstorm-visual/resources/example-plan-data.ts
```

- [ ] **Step 6: Commit**

```bash
cd ~/projects/claude-plugins-hyped
git add skills/brainstorm-visual/
git commit -m "feat(skills): add brainstorm-visual skill with Mermaid templates, wireframe library, and example"
```

---

## Task 5: design-visual skill + resources

**Files:**
- Create: `skills/design-visual/SKILL.md`
- Create: `skills/design-visual/resources/mermaid-templates.md`
- Create: `skills/design-visual/resources/wireframe-components.html`
- Create: `skills/design-visual/resources/example-plan-data.ts`

- [ ] **Step 1: Create SKILL.md**

Create `~/projects/claude-plugins-hyped/skills/design-visual/SKILL.md`:

```markdown
# Skill: design-visual

**Use this skill when:**
- The spec has been written and approved by the user
- You are about to invoke `writing-plans` and the feature has a non-trivial architecture or UI
- For **UI features**: always required — present architecture + sequence flow + primary wireframe
- For **pure backend features**: use judgment — skip if the architecture is already clear from the spec; include if there are structural decisions worth visualizing

**Do NOT use this skill for:**
- Mid-brainstorm design exploration — use `brainstorm-visual` instead
- Post-plan task alignment — use `visualize-plan` instead

---

## What to include

A complete design-visual review must cover:

1. **System architecture diagram** — how the main components relate (`diagramType: 'architecture'`)
2. **Primary sequence diagram** — the main flow (happy path) from trigger to completion (`diagramType: 'sequence'`)
3. **UI wireframe** (if the feature has a user-facing surface) — one wireframe block with 1–2 alternatives showing the primary screen or interaction
4. **Flags** — any open decisions, risks, or ambiguities from the spec that weren't fully resolved

---

## Execution Flow

### 1. Read all resources upfront

Before building the UI, read these files in full:
- `~/.hyped/plugins/claude-plugins-hyped/skills/design-visual/resources/mermaid-templates.md`
- `~/.hyped/plugins/claude-plugins-hyped/skills/design-visual/resources/wireframe-components.html`
- `~/.hyped/plugins/claude-plugins-hyped/skills/design-visual/resources/example-plan-data.ts`

### 2. Set up the project directory

```bash
FEATURE=<kebab-case-feature-name>
PLUGIN_ROOT=~/.hyped/plugins/claude-plugins-hyped
cp -r ${PLUGIN_ROOT}/templates/plan-viewer /tmp/plan-viewer-${FEATURE}
cd /tmp/plan-viewer-${FEATURE}
bun install --no-summary
```

### 3. Populate src/plan-data.ts

Map the spec into tasks. Typical structure:

| Task | Contents |
|------|----------|
| System Architecture | `DiagramBlock` (architecture) + any arch-level flags |
| Main Flow | `DiagramBlock` (sequence) showing the primary happy path |
| UI Design (if applicable) | `WireframeBlock` with 1–2 alternatives |
| Open Decisions | `flags` only — no blocks needed |

Use the `example-plan-data.ts` as the format reference.

### 4. Build validation

```bash
cd /tmp/plan-viewer-${FEATURE}
bun run build
```

Invalid Mermaid syntax = hard error in UI. Fix before proceeding.

### 5. Open tunnel + start dev server

Follow the `use-local-tunnel` skill to expose `http://localhost:5200`.

```bash
lsof -i :5200 | grep LISTEN || echo "5200 is free"
PLAN_TOKEN=<token> bun run dev --port 5200 --host &
sleep 2
```

### 6. Screenshot and send URL

Screenshot `http://localhost:5200?_token=<token>` with user-browser. Send tunnel URL as plain text.

### 7. After user saves

Read `/tmp/plan-viewer-${FEATURE}/review.json`. Apply wireframe picks and flag responses to the spec if needed. Then invoke `writing-plans`.

---

## Rules
- Read all resources before populating plan-data.ts
- Never write Mermaid syntax from scratch — adapt from mermaid-templates.md
- Never write wireframe HTML from scratch — compose from wireframe-components.html
- Must include architecture + sequence diagrams at minimum
- Follow `use-local-tunnel` skill for all tunnel steps
```

- [ ] **Step 2: Create resources — copy mermaid-templates.md from brainstorm-visual**

```bash
cp ~/projects/claude-plugins-hyped/skills/brainstorm-visual/resources/mermaid-templates.md \
   ~/projects/claude-plugins-hyped/skills/design-visual/resources/mermaid-templates.md
```

- [ ] **Step 3: Copy wireframe-components.html from brainstorm-visual**

```bash
cp ~/projects/claude-plugins-hyped/skills/brainstorm-visual/resources/wireframe-components.html \
   ~/projects/claude-plugins-hyped/skills/design-visual/resources/wireframe-components.html
```

- [ ] **Step 4: Create example-plan-data.ts (design-review framing)**

Create `~/projects/claude-plugins-hyped/skills/design-visual/resources/example-plan-data.ts`:

```ts
// EXAMPLE: design-visual plan-data.ts
// This is a format reference — copy structure, replace content.
// Feature: workspace setup — full technical design review before writing the plan

import type { PlanData } from '../../../templates/plan-viewer/src/types'

export const PLAN: PlanData = {
  title: 'Workspace Setup — Technical Design Review',
  goal: 'Sign off on the full technical design before writing the implementation plan.',
  tasks: [
    {
      id: '1',
      title: 'System Architecture',
      steps: [
        { label: 'Claude Code → MCP plugin → daemon → git + Telegram' },
        { label: 'chat_working_dirs persisted in AppState + JSON on disk' },
      ],
      blocks: [
        {
          type: 'diagram',
          diagramType: 'architecture',
          title: 'workspace_set full system',
          mermaid: `graph LR
  CC[Claude Code] -->|workspace_set name,chat_id| MCP[hyped-workspace MCP]
  MCP -->|POST /api/workspace| D[Daemon :7891]
  D --> GIT[git worktree add .worktrees/name]
  D --> TG[Telegram setChatTitle]
  D --> FS[chat_working_dirs.json]
  D -->|worktree_path,branch,title| MCP
  MCP -->|Workspace ready| CC`,
        },
      ],
      flags: [
        { type: 'risk', text: 'Bot must have "Change Group Info" admin permission for setChatTitle to succeed.' },
      ],
    },
    {
      id: '2',
      title: 'Main Flow — Sequence',
      steps: [
        { label: 'User starts brainstorming → Claude asks to set workspace → user confirms → workspace created' },
      ],
      blocks: [
        {
          type: 'diagram',
          diagramType: 'sequence',
          title: 'workspace_set happy path',
          mermaid: `sequenceDiagram
  participant U as User
  participant C as Claude
  participant MCP as MCP Plugin
  participant D as Daemon
  participant G as Git
  participant TG as Telegram
  U->>C: "Let's build auth system"
  C->>U: "Set up workspace? (auth-system)"
  U->>C: "Yes"
  C->>MCP: workspace_set(auth-system, chat_id)
  MCP->>D: POST /api/workspace
  D->>G: git worktree add .worktrees/auth-system
  G-->>D: ok
  D->>TG: setChatTitle "hyped [feature/auth-system]"
  TG-->>D: ok
  D-->>MCP: {worktree_path, branch, title}
  MCP-->>C: "Workspace ready: feature/auth-system at .worktrees/auth-system"
  C->>U: Confirms in chat`,
        },
      ],
    },
    {
      id: '3',
      title: 'Claude Confirmation Message',
      steps: [
        { label: 'After workspace_set returns, Claude sends a confirmation in Telegram' },
      ],
      blocks: [
        {
          type: 'wireframe',
          title: 'Workspace confirmation format',
          alternatives: [
            {
              id: 'simple',
              label: 'Option A',
              description: 'Simple inline text',
              html: `<html><body style="font-family:sans-serif;padding:16px;background:#0f0f0f;color:#e5e5e5;font-size:14px">
<p>Workspace set: <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px">feature/auth-system</code> at <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px">.worktrees/auth-system</code></p>
</body></html>`,
            },
            {
              id: 'blockquote',
              label: 'Option B',
              description: 'Blockquote card with details',
              html: `<html><body style="font-family:sans-serif;padding:16px;background:#0f0f0f;color:#e5e5e5">
<blockquote style="border-left:3px solid #6366f1;margin:0;padding:12px 16px;background:#1a1a1a;border-radius:0 8px 8px 0">
  <div style="font-size:12px;color:#888;margin-bottom:6px">🛠 Workspace ready</div>
  <div style="font-size:13px;margin-bottom:4px"><b>Branch:</b> feature/auth-system</div>
  <div style="font-size:13px;margin-bottom:4px"><b>Path:</b> .worktrees/auth-system</div>
  <div style="font-size:13px"><b>Group:</b> hyped [feature/auth-system]</div>
</blockquote>
</body></html>`,
            },
          ],
        },
      ],
    },
  ],
}
```

- [ ] **Step 5: Verify structure**

```bash
find ~/projects/claude-plugins-hyped/skills/design-visual -type f
```
Expected:
```
skills/design-visual/SKILL.md
skills/design-visual/resources/mermaid-templates.md
skills/design-visual/resources/wireframe-components.html
skills/design-visual/resources/example-plan-data.ts
```

- [ ] **Step 6: Commit**

```bash
cd ~/projects/claude-plugins-hyped
git add skills/design-visual/
git commit -m "feat(skills): add design-visual skill with full technical design review flow"
```

---

## Task 6: Update visualize-plan SKILL.md

**Files:**
- Modify: `skills/visualize-plan/SKILL.md`

- [ ] **Step 1: Read current SKILL.md**

```bash
cat ~/projects/claude-plugins-hyped/skills/visualize-plan/SKILL.md | head -20
```

- [ ] **Step 2: Add "NOT for diagrams" note**

At the top of `skills/visualize-plan/SKILL.md`, find the "Use this skill when:" section and add a "Do NOT use" block immediately after the use-cases:

```markdown
**Do NOT use this skill for:**
- Architecture diagrams, sequence diagrams, or wireframes — use `design-visual` instead
- Mid-brainstorm visual questions — use `brainstorm-visual` instead

`visualize-plan` is for **task-level alignment only** — reviewing an implementation plan step-by-step before coding starts.
```

- [ ] **Step 3: Verify the edit looks right**

```bash
head -20 ~/projects/claude-plugins-hyped/skills/visualize-plan/SKILL.md
```

- [ ] **Step 4: Commit**

```bash
cd ~/projects/claude-plugins-hyped
git add skills/visualize-plan/SKILL.md
git commit -m "docs(skills): update visualize-plan — clarify NOT for diagrams, use design-visual instead"
```

---

## Final verification

- [ ] **Full build check**

```bash
cd ~/projects/claude-plugins-hyped/templates/plan-viewer
bun run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Skill files exist**

```bash
find ~/projects/claude-plugins-hyped/skills/brainstorm-visual ~/projects/claude-plugins-hyped/skills/design-visual -name "*.md" -o -name "*.ts" -o -name "*.html" | sort
```
Expected: 8 files total (SKILL.md + 3 resources per skill).

- [ ] **visualize-plan updated**

```bash
grep "design-visual" ~/projects/claude-plugins-hyped/skills/visualize-plan/SKILL.md
```
Expected: line mentioning `design-visual`.
