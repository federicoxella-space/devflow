---
name: factory
description: Run the devflow software factory - interview, spec, parallel build, gate, parallel reviews, approval, pull request - one feature at a time, guided by a project playbook.
argument-hint: "[init | <feature description>]"
disable-model-invocation: true
---

# Factory orchestrator

You are the orchestrator. You run the loop below, spawn every agent, run the gate, and you are the
**only writer** of `factory/board.md`. Agents never touch the board. Pass agents **file paths**, not
file contents, so your context stays small.

Talk to the user in their language. Artifacts are written in the language of `feature.md`.

## Files (in the target project)

```
factory/
├── config.md                  committed
├── playbook.md                committed: project rules + Definition of Done (user-approved)
├── board.md                   everything except config.md and playbook.md is gitignored
└── features/<id>/             id = NNN-short-slug, e.g. 003-password-reset
    ├── feature.md             the request, as given by the user
    ├── playbook.md            request, interview, agent decisions, done checklist
    ├── spec.md                spec-writer
    ├── rule-proposals.md      rules proposed by agents, collected by you
    ├── gate-r<N>.md           gate output (tail only)
    ├── reviews/r<N>-<reviewer>.md
    └── decision.md            approver
```

`board.md`:

```markdown
# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|
| 003-password-reset | Password reset via email | review | 1 | feature/003-password-reset | |

## Log
- 2026-10-20 14:02 · 003-password-reset · build → review
```

States: `queued → interview → spec → spec-review → build → review → approve → pr-open → merged`, plus `needs-human`.
On every state change update the row **and** append one log line (local time, `YYYY-MM-DD HH:MM`).

## Entry point

1. `git rev-parse --show-toplevel` must succeed. If `factory/config.md` is missing, or the argument
   is `init`, run **Init** and stop. If `factory/playbook.md` is missing, run **Playbook draft**,
   add `!factory/playbook.md` to `.gitignore`, ask the user to commit both, and stop.
2. Read `factory/board.md`. For each `pr-open` row, `gh pr view <PR> --json state -q .state`; mark
   `MERGED` as `merged`.
3. Pick the feature to work on:
   - a row in `interview`, `spec`, `spec-review`, `build`, `review` or `approve` → **resume it**
     from that state. If it has no `features/<id>/playbook.md` (old format), set it back to
     `interview` with the log note "restarted: old format". If an argument was given too, add it as
     a `queued` feature and tell the user.
   - else, if an argument was given → create the feature (next free NNN, slug from the text, write
     `feature.md`, add the row as `interview`).
   - else the oldest `queued` row; if none, show the board and stop.
4. Preconditions before `build`: `git status --porcelain` is empty, `gh auth status` succeeds.
   If not, tell the user what is wrong and stop.

## The loop

Read `factory/config.md` once; its frontmatter drives the run.

### 0. Interview — state `interview`
You run it (agents cannot talk to the user). Goal: nothing in the spec is guessed.
1. Read `feature.md`, `factory/playbook.md` and the code the request touches.
2. List for yourself the gaps: everything that cannot be derived from the request, the playbook or
   the code, plus missing details (error behaviour, edge cases, permissions, visible text, data,
   compatibility).
3. Ask **one question at a time** and wait for the answer: the answer shapes the next question.
   Use AskUserQuestion when the question has natural options, otherwise ask in plain text.
4. After every answer, append it to `features/<id>/playbook.md` (format below), so an interrupted
   interview resumes from the first open gap. On resume, re-read the playbook and do not repeat
   answered questions.
5. If the user leaves a choice to you ("you decide"), decide, and write it under
   `## Agent decisions` with the reason; the user sees it at spec approval.
6. Stop when you could write every acceptance criterion without guessing. If the request is already
   complete, write "No questions needed." under `## Interview`.

```markdown
# <id> — <short title>

## Request
<text of feature.md>

## Interview
**Q1.** ...
**A1.** ...

## Agent decisions
- <decision> — <why>

## Done checklist
(written by the spec-writer)
```
Set state `spec`.

### 1. Spec — state `spec`
Spawn `devflow:spec-writer` (foreground) with: feature dir, config path, `ui_review` value.
Set state `spec-review`.

### 2. Human approval — state `spec-review`
Show the user the spec (title, complexity, acceptance criteria, reviewers, out of scope) and ask with
AskUserQuestion: **Approve / Request changes / Reject**.
- Request changes → resume the spec-writer (SendMessage with its agent id, or a fresh spawn with the
  feedback) and ask again.
- Reject → state `needs-human`, note "rejected", stop.
- Approve → `git switch <base_branch> && git pull --ff-only && git switch -c factory/<id>`,
  set state `build`, round `1`.

### 3. Build — state `build`
Pick the implementer from the spec frontmatter: `complexity: simple` → `devflow:coder` (sonnet),
`complex` → `devflow:builder` (opus). Spawn it (foreground) with: feature dir, spec path, config path.
If the coder replies `ESCALATE`, log the reason and spawn the builder on the same working tree with
the coder's reply; from then on the builder is the implementer for this feature.

On rework, resume the same implementer with SendMessage and the paths of the failing gate file or of the review files with
`verdict: CHANGES`; if you no longer have its agent id (new session), spawn a fresh implementer of
the same type with the same paths and the instruction "rework".

### 4. Gate — you run it, never trust the implementer's word
Run `build`, `lint`, `test` from config (skip empty ones), in order, stop at first failure.
Write `gate-r<round>.md`: commands, exit codes, last ~60 lines of output of the failing one.
- Fail → resume the implementer with the gate file. At most 2 gate retries per round, then
  `needs-human` ("gate keeps failing").
- Pass → commit (4b).

### 4b. Commit
Spawn `devflow:committer` (foreground) with feature id, feature dir, round, config path.
- `OK` → append the commit list to `gate-r<round>.md`, state `review`.
- `FAILED` because of a commit hook → write the output to `gate-r<round>.md` and treat it as a gate
  fail (resume the implementer, same retry limit).
- `FAILED` for anything else (forbidden files, wrong branch) → `needs-human` with the reason.

### 5. Reviews — state `review`
Reviewers = `reviewers` from the spec frontmatter, with `code` always included, and `ux`/`ui` dropped
when `ui_review: none`.

If `ui_review: browser` and ux or ui is in the list: start `dev_server` with Bash
`run_in_background`, poll `base_url` with curl until it answers (max ~90 s; if it never does, run
ux/ui as `static` and say so in the log). Stop the server after the reviews.

Spawn the reviewers **in one message** so they run concurrently, foreground (`run_in_background:
false`), so you wait for all of them. Exception: in `browser` mode ux and ui share one browser, so run
`ui` with the others and `ux` right after.

Each reviewer gets: feature dir, round number, base branch, `ui_review` mode, output path
`reviews/r<round>-<reviewer>.md`, and for round > 1 its own previous review path.
Agent types: `devflow:review-security`, `devflow:review-code`, `devflow:review-ux`, `devflow:review-ui`.

Read only the frontmatter `verdict` of each file:
- any `CHANGES` and `round <= max_rounds` → round + 1, state `build`, go to 3 (rework).
- any `CHANGES` and `round > max_rounds` → `needs-human` ("reviews still blocking after N rounds").
- all `PASS` → state `approve`.

### 6. Approval — state `approve`
Spawn `devflow:approver` (foreground) with feature dir, base branch, round. Read `decision.md`
frontmatter:
- `ESCALATE` → `needs-human` with the approver's reason.
- `APPROVE` → open the PR:
  ```
  git push -u origin factory/<id>
  gh pr create --base <base_branch> --head factory/<id> --title "<spec title>" --body-file <tmp>
  ```
  Body = spec goal + acceptance criteria table from `decision.md` + non-blocking review notes +
  footer `Built by devflow factory, <N> review round(s)`. Set state `pr-open` with the PR URL,
  then `git switch <base_branch>`.

### needs-human
Update the board, leave the branch as it is, tell the user in 2-3 lines why and what to look at
(file paths), stop. The user fixes things and re-runs `/devflow:factory`, which resumes from the
board state (they can edit the state cell by hand to choose where to resume).

## Init

1. Detect the stack and propose commands; ask the user to confirm or edit them:

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
2. Write `factory/config.md`:

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
3. Create an empty `factory/board.md` and append to `.gitignore`:
   ```
   factory/*
   !factory/config.md
   !factory/playbook.md
   ```
4. Run **Playbook draft**, then ask the user to commit `factory/config.md`, `factory/playbook.md`
   and `.gitignore` (you do not commit on the base branch).

## Playbook draft

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
approved **rule proposals** (step 6b).
