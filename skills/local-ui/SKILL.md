# Skill: local-ui

Use this skill when the user asks to build a UI, dashboard, or visual plan viewer to be served locally.

This skill is independent of the tunnel — scaffold the UI first, then use the `use-local-tunnel` skill to expose it.

## Scaffolding: Vite + React + Tailwind v4 + shadcn

````bash
# 1. Create project
bun create vite@latest <name> -- --template react-ts
cd <name>

# 2. Install Tailwind v4
bun add tailwindcss @tailwindcss/vite

# 3. Configure vite.config.ts
````

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(__dirname, './src') } },
})
```

````bash
# 4. Replace src/index.css with a single import
````

```css
/* src/index.css */
@import "tailwindcss";
```

````bash
# 5. Add path aliases to tsconfig.json and tsconfig.app.json
````

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

````bash
# 6. Init shadcn (choose: style=default, baseColor=slate, cssVariables=yes)
bunx shadcn@latest init

# 7. Add components
bunx shadcn@latest add button card badge progress sidebar collapsible

# 8. Start dev server
bun run dev
````

## Plan Viewer Template

Use this template when asked to visualise an implementation plan. Fill `PLAN_DATA` with the actual plan content.

```ts
// src/types.ts
export interface PlanStep {
  label: string
  done: boolean
  code?: string
  lang?: string
}

export interface PlanTask {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  steps: PlanStep[]
}

export interface PlanData {
  title: string
  goal: string
  tasks: PlanTask[]
}
```

```tsx
// src/PlanViewer.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CheckCircle2, Circle, Clock, ChevronDown } from 'lucide-react'
import type { PlanData, PlanTask, PlanStep } from './types'

const STATUS_ICON = {
  completed: <CheckCircle2 className="text-green-500 w-4 h-4" />,
  in_progress: <Clock className="text-yellow-500 w-4 h-4" />,
  pending: <Circle className="text-muted-foreground w-4 h-4" />,
}

export function PlanViewer({ plan }: { plan: PlanData }) {
  const [active, setActive] = useState(plan.tasks[0]?.id)
  const done = plan.tasks.filter(t => t.status === 'completed').length
  const progress = Math.round((done / plan.tasks.length) * 100)

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 border-r p-4 flex flex-col gap-2 overflow-y-auto">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">Tasks</h2>
        {plan.tasks.map(task => (
          <button
            key={task.id}
            onClick={() => setActive(task.id)}
            className={`flex items-center gap-2 text-left text-sm px-3 py-2 rounded-md w-full transition-colors
              ${active === task.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
          >
            {STATUS_ICON[task.status]}
            <span className="truncate">{task.title}</span>
          </button>
        ))}
        <div className="mt-auto pt-4 border-t">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span><span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-1">{plan.title}</h1>
            <p className="text-muted-foreground">{plan.goal}</p>
          </div>
          {plan.tasks.filter(t => t.id === active).map(task => (
            <TaskDetail key={task.id} task={task} />
          ))}
        </div>
      </main>
    </div>
  )
}

function TaskDetail({ task }: { task: PlanTask }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 pb-3">
        {STATUS_ICON[task.status]}
        <CardTitle className="text-lg">{task.title}</CardTitle>
        <Badge variant={task.status === 'completed' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'} className="ml-auto">
          {task.status.replace('_', ' ')}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {task.steps.map((step, i) => <StepRow key={i} step={step} />)}
      </CardContent>
    </Card>
  )
}

function StepRow({ step }: { step: PlanStep }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-sm py-1 hover:text-foreground text-muted-foreground group">
        {step.done
          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
          : <Circle className="w-3.5 h-3.5 shrink-0" />}
        <span className={step.done ? 'line-through opacity-60' : ''}>{step.label}</span>
        {step.code && <ChevronDown className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />}
      </CollapsibleTrigger>
      {step.code && (
        <CollapsibleContent>
          <pre className="mt-1 ml-6 text-xs bg-muted rounded-md p-3 overflow-x-auto">
            <code>{step.code}</code>
          </pre>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
```

```tsx
// src/App.tsx — wire up PlanViewer with your plan data
import { PlanViewer } from './PlanViewer'
import type { PlanData } from './types'

const PLAN_DATA: PlanData = {
  title: 'My Plan',
  goal: 'One sentence goal',
  tasks: [
    {
      id: 'task-1',
      title: 'First Task',
      status: 'in_progress',
      steps: [
        { label: 'Do step one', done: true },
        { label: 'Do step two', done: false, code: 'console.log("hello")', lang: 'ts' },
      ],
    },
  ],
}

export default function App() {
  return <PlanViewer plan={PLAN_DATA} />
}
```

## After scaffolding

Once the UI is running (`bun run dev` → http://localhost:5173), invoke the `use-local-tunnel` skill to expose it.
