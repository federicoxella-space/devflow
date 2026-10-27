---
base_branch: main
forge: github          # github | gitlab | azure | git
forge_host: ""         # self-hosted only, e.g. gitlab.company.com
azure_org: ""          # Azure DevOps Server only: collection URL
azure_project: ""      # Azure DevOps Server only: project name
build: npx -y -p typescript tsc -p .
lint: claude plugin validate .
test: claude plugin test .
ui_review: static      # none | static | browser
dev_server: ""         # browser only, e.g. npm run dev
base_url: ""           # browser only, e.g. http://localhost:5173
max_rounds: 2          # rework rounds after the first review
release: "off"         # auto | off — automatic tag + release on every merged PR (github, gitlab)
---
This repo is the devflow Claude Code plugin itself: skills (`skills/`), subagents (`agents/`) and
the flow pane mod (`hooks/`, TypeScript on the `claude-code` mod API, types in `types/`).

- No `package.json`: `node_modules/` holds only the `claude-code*` type packages; the mod is
  type-checked with `tsc` (config from `.claude-plugin/types/tsconfig.json`) and tested with
  `claude plugin test`.
- The pane has no dev server: UI review is static (read `hooks/svg.ts`, `hooks/terminal.tsx`).
- Releases are made by this repo's own `.github/workflows/release.yml` on every merged PR (version
  bump in `.claude-plugin/plugin.json`, `CHANGELOG.md`, tag). Never edit the version or the
  changelog by hand.
- Do not touch `vault/` (Obsidian notes), `.superpowers/`, `node_modules/`, `.claude/`.
- Line endings LF (`.gitattributes`).

## Commit rules
Conventional commits in English, `type(scope): subject`. Scopes in use: `pane`, `factory`,
`skills`, `init`, `release`, `plan`, `spec`; `docs:` without scope for README.
