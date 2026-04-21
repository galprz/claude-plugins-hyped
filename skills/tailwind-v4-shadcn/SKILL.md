<!-- vendored from https://github.com/secondsky/claude-skills on 2026-04-21 — update manually when upstream changes -->
# Tailwind v4 + shadcn Skill

Use this skill when setting up Tailwind CSS v4 with Vite and shadcn/ui. Tailwind v4 uses a Vite plugin instead of PostCSS — no `tailwind.config.js` needed.

## Full Setup

```bash
bun create vite@latest <name> -- --template react-ts
cd <name>
bun add tailwindcss @tailwindcss/vite
```

```ts
// vite.config.ts — add tailwindcss plugin and @ alias
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(__dirname, './src') } },
})
```

```css
/* src/index.css — replace entire file */
@import "tailwindcss";
```

Add to both `tsconfig.json` and `tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

```bash
bunx shadcn@latest init
# style=default, baseColor=slate, cssVariables=yes
```

## Key differences from Tailwind v3
- No `tailwind.config.js` — configuration is CSS-first via `@theme` directive
- No PostCSS setup — `@tailwindcss/vite` handles everything
- Import with `@import "tailwindcss"` not `@tailwind base/components/utilities`
- Custom colors: use `@theme { --color-brand: oklch(...); }` in CSS

## Custom theme example

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.6 0.2 250);
  --font-sans: "Inter", sans-serif;
}
```

Then use as `bg-brand`, `text-brand`, `font-sans` in your JSX.
