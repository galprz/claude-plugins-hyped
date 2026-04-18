# hyped-projects

Use this skill when the user says `/setup project` or asks to register, list, or remove a project.

## Register a project (guided flow)

1. Ask: "What should I call this project?" — wait for reply
2. Ask: "What's the working directory path?" — wait for reply
3. Confirm back: "Register project `<name>` at `<path>` — is that right?" — wait for yes/no
4. If no, ask what to change and loop back
5. On yes: read `~/.hyped/projects.json` (treat as `[]` if missing or empty), upsert entry by name, write back
6. Reply: "✅ Project `<name>` registered → `<path>`"

## List projects

Read `~/.hyped/projects.json` and format as a list showing name and working directory.

## Remove a project

Ask which project to remove, confirm, then filter it out of `~/.hyped/projects.json` and write back.

## projects.json format

```json
[
  { "name": "hyped", "working_dir": "/Users/gal/projects/hyped" },
  { "name": "client-a", "working_dir": "/Users/gal/projects/client-a" }
]
```

File location: `~/.hyped/projects.json`

## Notes

- After registering, remind the user they can switch with `/project switch <name>`
- If the user says a path by voice it may be transcribed with words like "slash" — interpret and normalize to an actual path
- Always confirm before writing
