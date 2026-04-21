<!-- vendored from https://github.com/shadcn-ui/ui on 2026-04-21 — update manually when upstream changes -->
# shadcn/ui Skill

Use this skill when adding shadcn/ui components to a React project.

## Installation

```bash
bunx shadcn@latest init
# Choose: style=default, baseColor=slate, cssVariables=yes
```

## Adding components

```bash
bunx shadcn@latest add <component>
# Examples:
bunx shadcn@latest add button card badge
bunx shadcn@latest add sidebar collapsible progress dialog input
```

## Usage

Components are copied into `src/components/ui/`. Import from `@/components/ui/<name>`:

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
```

## Available components

button, card, badge, progress, sidebar, collapsible, dialog, input, label, select, separator, sheet, table, tabs, textarea, toggle, tooltip, avatar, checkbox, radio-group, switch, dropdown-menu, context-menu, navigation-menu, popover, scroll-area, and more.

Run `bunx shadcn@latest add --help` to list all.

## Notes
- Always use `bunx shadcn@latest add` — never copy component code manually
- `components.json` controls style; don't edit it after init
- All components use Radix UI primitives internally
- Requires `@/*` path alias pointing to `./src`
