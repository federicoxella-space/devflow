---
name: init
description: Set up the devflow software factory in the current repo - detect or choose the stack, write factory/config.md, draft the project playbook, create the board.
disable-model-invocation: true
---

# Factory init

You prepare the current repo for `/devflow:factory`. You write `factory/config.md`,
`factory/playbook.md`, `factory/board.md` and the `.gitignore` lines; you never commit on the base
branch: at the end you ask the user to commit.

Talk to the user in their language. Ask **one question at a time** and wait for the answer: the
answer shapes the next question. Use AskUserQuestion when the question has natural options,
otherwise ask in plain text.

## Entry point

`git rev-parse --show-toplevel` must succeed. Then:
- no `factory/config.md` → run every step below;
- `factory/config.md` present, no `factory/playbook.md` → run only steps 3 and 4 (add the
  `!factory/playbook.md` and `!factory/backlog.md` lines to `.gitignore` if missing);
- both present → ask what to redo: **Config / Playbook / Both / Nothing**. Before redoing the
  playbook, warn that it holds rules the user approved and offer to keep them in the new draft.
  Never touch an existing `factory/board.md`.

## 1. Stack and commands

Detect the stack and propose commands; ask the user to confirm or edit them:

| Found | build | lint | test |
|---|---|---|---|
| `package.json` + react | `npm run build` | `npm run lint` | `npm test -- --run` (vitest) / `npm test -- --watchAll=false` (jest) |
| `angular.json` | `npx ng build` | `npx ng lint` | `npx ng test --watch=false --browsers=ChromeHeadless` |
| `*.sln` / `*.csproj` | `dotnet build` | `dotnet format --verify-no-changes` | `dotnet test` |
| `pom.xml` | | | `mvn -q verify` |
| `build.gradle*` | | | `./gradlew build` |
| `pyproject.toml` | | `ruff check .` | `pytest -q` |

Prefer scripts that already exist in the project. Multiple apps (e.g. React + .NET): chain with `&&`.
`ui_review`: `browser` for web frontends, `static` for CLIs, `none` for backend-only.

**No stack yet** (empty repo, or none of the files above): run a **stack interview** instead. Stop
asking when you can choose without guessing. Find out what the user wants to build (kind of
product, users, scale), constraints (languages and frameworks the team knows, hosting, company
standards, integrations, licences) and preferences. Then recommend one stack with a short reason
and at most one alternative, and ask with AskUserQuestion: **Approve / Choose the alternative /
Change**. From the approved stack, derive the commands and `ui_review` as in the table above.
Write the questions, the answers and the chosen stack with its reason in the notes of `config.md`
and, as the first rules, in `## Conventions` of the playbook draft. Init does not create the
project: step 4 queues a feature that scaffolds it.

## 2. Config

Write `factory/config.md`:

```markdown
---
base_branch: main
build: dotnet build
lint: dotnet format --verify-no-changes
test: dotnet test
ui_review: none        # none | static | browser
dev_server: ""         # browser only, e.g. npm run dev
base_url: ""           # browser only, e.g. http://localhost:5173
max_rounds: 2          # rework rounds after the first review
---
Notes for every agent: conventions, folders not to touch, how to log in on the dev server, ...

## Commit rules
Optional. Overrides the committer's defaults (e.g. subject in Italian, scope = ticket id).
```

## 3. Playbook draft

Read `CLAUDE.md`, the notes in `factory/config.md` and the codebase (structure, a few
representative modules, tests). Draft `factory/playbook.md`, one rule per line, with a reference
path when there is one. Keep it short: only rules an agent would otherwise have to rediscover.

```markdown
# Project playbook

## Conventions
- Services in `src/services/`, always behind an `I<Name>Service` interface.
## Patterns
- New REST endpoint: follow `src/api/orders/OrdersController.cs`.
## Reusable code
- Email validation: `src/shared/validation/email.ts` (do not rewrite it).
## Don'ts
- Do not touch `legacy/`.
## Definition of Done
- [gate] Build, lint and tests are green.
- [code] Every acceptance criterion has an automated test or a precise manual step.
- [security] No secrets in code or committed configuration.
```

Definition of Done items are `- [<owner>] <item>`, owner one of `gate`, `code`, `security`, `ux`,
`ui`; `DoD-<n>` is the item's position. Always include the two first items above; add stack-specific
ones. Show the draft, apply the user's edits, write the file. From then on it changes only through
rule proposals approved during `/devflow:factory`.

## 4. Board and .gitignore

If `factory/board.md` does not exist, create it:

```markdown
# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|

## Log
```

After a stack interview, add the row `| 001-scaffold | Scaffold the <stack> project | queued | | | |`
and write `factory/features/001-scaffold/feature.md` with the chosen stack, its reason and "the
`build`, `lint`, `test` commands in `factory/config.md` must work". The first `/devflow:factory`
run builds it through the normal loop.

Append to `.gitignore` the lines that are missing:

```
factory/*
!factory/config.md
!factory/playbook.md
!factory/backlog.md
```

## 5. Hand-over

Ask the user to commit `factory/config.md`, `factory/playbook.md` and `.gitignore`, then to run
`/devflow:factory <feature description>` (or `/devflow:factory` alone to start the scaffold
feature).
