# Visual Brainstorm & Design Skills — Spec

**Date:** 2026-04-25

## Goal

Add two new visual skills to `claude-plugins-hyped` that extend the `plan-viewer` template with Mermaid diagram rendering and wireframe comparison components, enabling Claude to communicate technical decisions visually during brainstorming and design review.

## Architecture

Extend the existing `plan-viewer` template (React + Vite + Tailwind v4) with two new block types: `diagram` (Mermaid SVG) and `wireframe` (side-by-side HTML alternatives with pick buttons). Add two new skills — `brainstorm-visual` and `design-visual` — each with a resources directory containing Mermaid templates, a wireframe component library, and a worked example. Both skills follow the identical tunnel/serve/save/notify flow as `visualize-plan`.

## Requirements

| # | Requirement |
|---|-------------|
| R1 | `plan-viewer` template supports a `blocks` array on `PlanTask` containing `DiagramBlock` or `WireframeBlock` items |
| R2 | `DiagramBlock` renders Mermaid syntax to SVG in-browser (no server); supports `architecture`, `sequence`, `flowchart` |
| R3 | Invalid Mermaid syntax causes a hard error (visible error state in UI); Claude is responsible for correct syntax |
| R4 | `WireframeBlock` shows 2–3 alternatives side-by-side; user picks one via toggle button; choice is persisted in save payload |
| R5 | Wireframe alternatives render as sandboxed HTML/CSS in iframes |
| R6 | Save payload includes both `flags` responses (existing) and `wireframes` picks (new) |
| R7 | `brainstorm-visual` skill triggers mid-brainstorm for visual questions only; not for conceptual/tradeoff questions |
| R8 | `design-visual` skill triggers after spec is approved, before `writing-plans`; required for UI features, optional for pure backend (skill decides based on feature type) |
| R9 | Each skill has its own `resources/` directory — no sharing between skills |
| R10 | Skills read all resources upfront before populating `plan-data.ts` |
| R11 | Skill descriptions in the plugin prompt clearly differentiate `brainstorm-visual` vs `design-visual` vs `visualize-plan`; `visualize-plan` explicitly states it is NOT for design diagrams |
| R12 | Out of scope: real-time collaboration, pixel-perfect mockups, diagram editing in browser |

## Definition of Done

- [ ] `plan-viewer/src/types.ts` exports `DiagramBlock`, `WireframeBlock`, updated `PlanTask`
- [ ] `App.tsx` renders Mermaid diagrams inline without errors on all three diagram types
- [ ] `App.tsx` renders wireframe alternatives side-by-side; picked alternative is highlighted and saved
- [ ] Save payload `review.json` includes `wireframes: { "taskId:altId": true }` when alternatives are picked
- [ ] `skills/brainstorm-visual/SKILL.md` exists with trigger conditions, execution flow, and resources reference
- [ ] `skills/design-visual/SKILL.md` exists with trigger conditions, execution flow, and resources reference
- [ ] Each skill has `resources/mermaid-templates.md`, `resources/wireframe-components.html`, `resources/example-plan-data.ts`
- [ ] `bun run build` on the extended template produces zero errors
- [ ] Both skills can be exercised end-to-end: copy template → populate data → serve → save → review.json correct

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `templates/plan-viewer/src/types.ts` | Modify | Add `DiagramBlock`, `WireframeBlock`, extend `PlanTask` |
| `templates/plan-viewer/src/App.tsx` | Modify | Render new block types; wire wireframe picks into save payload |
| `templates/plan-viewer/package.json` | Modify | Add `mermaid` dependency |
| `skills/brainstorm-visual/SKILL.md` | Create | Skill instructions, trigger conditions, execution flow |
| `skills/brainstorm-visual/resources/mermaid-templates.md` | Create | Pre-written architecture/sequence/flowchart patterns |
| `skills/brainstorm-visual/resources/wireframe-components.html` | Create | HTML/CSS snippets for common UI elements |
| `skills/brainstorm-visual/resources/example-plan-data.ts` | Create | Complete worked example for brainstorm mode |
| `skills/design-visual/SKILL.md` | Create | Skill instructions, trigger conditions, execution flow |
| `skills/design-visual/resources/mermaid-templates.md` | Create | Same templates, design-review framing |
| `skills/design-visual/resources/wireframe-components.html` | Create | Same component library |
| `skills/design-visual/resources/example-plan-data.ts` | Create | Complete worked example for design-review mode |

## Design Details

### Type System

```ts
// types.ts additions

export interface DiagramBlock {
  type: 'diagram'
  diagramType: 'architecture' | 'sequence' | 'flowchart'
  title: string
  mermaid: string  // raw Mermaid syntax
}

export interface WireframeAlternative {
  id: string
  label: string        // "Option A"
  description: string  // one-line summary
  html: string         // full HTML document rendered in iframe sandbox
}

export interface WireframeBlock {
  type: 'wireframe'
  title: string
  alternatives: WireframeAlternative[]
}

// Updated PlanTask
export interface PlanTask {
  id: string
  title: string
  steps: PlanStep[]
  flags?: Flag[]
  blocks?: (DiagramBlock | WireframeBlock)[]  // new
}
```

### Save Payload

```json
{
  "flags": { "taskId:0": "user text response" },
  "wireframes": { "taskId:optionA": true },
  "timestamp": "2026-04-25T12:00:00Z"
}
```

### Skill Trigger Logic (for plugin prompt)

```
brainstorm-visual  — mid-brainstorm, visual questions only
                     (layout choice, architecture comparison, UI wireframe)
                     NOT for: conceptual tradeoffs, scope decisions, text Q&A

design-visual      — after spec approved, before writing-plans
                     required for UI features; optional for pure backend (skill decides)
                     full technical design review: architecture + sequence + UI
                     NOT for: mid-brainstorm exploration

visualize-plan     — after implementation plan written, before coding starts
                     task-by-task alignment with flags for risks/questions
                     NOT for: design diagrams or wireframes — use design-visual instead
```

### Resources Directory Purpose

Each skill's `resources/` directory is read by Claude before populating `plan-data.ts`:

- **`mermaid-templates.md`** — 6–8 common patterns (3-tier, event-driven, REST API flow, auth sequence, CRUD data model, etc.) with Mermaid syntax ready to copy and adapt
- **`wireframe-components.html`** — catalogue of ~15 HTML/CSS snippets: navbar, sidebar, card grid, form, table, modal, tabs, toast, empty state, etc. Claude composes these rather than writing raw HTML
- **`example-plan-data.ts`** — one complete `plan-data.ts` file showing a real feature (e.g. "workspace setup") with a populated architecture diagram, a wireframe comparison with two alternatives, and two flags — serves as the format reference
