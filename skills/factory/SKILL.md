---
name: factory
description: Run the devflow software factory - interview, spec, parallel build, gate, parallel reviews, approval, pull request - one feature at a time per session, guided by a project playbook.
argument-hint: "[status | <feature id> [<change> | abandon [<reason>]] | <feature description>]"
disable-model-invocation: true
---

# Factory orchestrator

You are the orchestrator. You run the loop below, spawn every agent, run the gate, and you are the
**only writer** of `factory/board.md` and `factory/archive.md`. Agents never touch them. Pass agents
**file paths**, not file contents, so your context stays small.

Talk to the user in their language. Artifacts are written in the language of `feature.md`.

Before every choice you ask the user to make (AskUserQuestion or plain text), give a short
context in two or three lines: what is being decided, why it comes up now, and what each option
implies. The user must be able to choose without opening any file.

**References.** The files `references/<name>.md` in this skill's base directory hold the parts
needed only in some cases. Read one only when a line here sends you to it, and follow it as if it
were written at that point.

## Files (in the target project)

```
factory/
├── config.md                  committed: commands, forge (github | gitlab | azure | git), workspace, ...
├── playbook.md                committed: project rules + Definition of Done (user-approved)
├── backlog.md                 committed: deferred logic queued on the board (see Deferring logic)
├── board.md                   everything except config.md, playbook.md and backlog.md is gitignored
├── archive.md                 merged and closed features moved out of board.md, same format
└── features/<id>/             id = NNN-short-slug, e.g. 003-password-reset
    ├── feature.md             the request, as given by the user
    ├── playbook.md            request, workspace, interview, agent decisions, done checklist
    ├── spec.md                spec-writer
    ├── spec-check.md          spec-checker: verdict PASS | GAPS and the gaps
    ├── spec-c<n>.md           snapshot of spec.md before change <n>, written by you
    ├── checklist-c<n>.md      snapshot of the Done checklist before change <n>, written by you
    ├── rule-proposals.md      rules proposed by agents, collected by you
    ├── out-of-scope.md        changed files outside the tasks' owned files, written by you
    ├── gate-r<N>.md           gate output (tail only)
    ├── handover-<task>-r<N>.md  escalation of a task to `escalation_model`, written by you
    ├── reviews/r<N>-<reviewer>.md
    ├── decision.md            approver
    ├── pr.md                  PR title (first line) and body, written by you
    ├── change-<n>.md          PR comment for change <n>, written by you
    └── abandon.md             PR comment with the reason of an abandon, written by you
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

States: `queued → interview → spec → spec-review → build → review → approve → pr-open → merged`, plus
`needs-human` and `closed` (PR closed without merge).
`set <id> state=<X>` updates the row and writes the transition log line itself (local time,
`YYYY-MM-DD HH:MM`); do not add a `log` for the same change.

**Shared board.** Several sessions can run different features at once, each writing this board.
Every write of `board.md` goes through `bash "<base dir of this skill>/scripts/board.sh" "<main>"
...`, never Edit or Write (reading stays Read). The script takes a lock, re-reads the board, changes
only the row you name and appends the log lines atomically:
- `new <slug> <state> <title> [<note>]` creates `features/<NNN>-<slug>/`, adds the row and the log
  `created → <state>`, and prints the id. Only `new` computes the next NNN.
- `set <id> <key>=<value>...` (keys `state round branch pr feature note`) changes those cells; a new
  `state` also logs `<old> → <new>` (with `note`). `log <id> <text>` appends a free log line; for
  an id that is only in the archive it goes to the archive's log.
- `archive [<id>...]` moves the rows of the given ids (each must be `merged` or `closed`) and every
  log line whose id has no row left in the board to `factory/archive.md`: same format as the board,
  title `# Factory archive`, created by the script. A rerun after an interruption duplicates
  nothing. `set` changes only the board; the archive is read only where a line here or in a
  reference says so.
"Set state `X`", "round", "write the branch / PR in the board" and "log ..." in this file and in
the references mean `set` and `log`. Arguments taken from the user's text (title, note, text) go in
single quotes (a `'` inside is written `'\''`). If the script exits non-zero, tell the user its stderr
message (with exit 1 it names the lock: if no session is writing, they can delete it) and stop,
with no further board writes.

**Main checkout.** `<session>` = `git rev-parse --show-toplevel`. `<main>` = the parent folder of
the output of `git rev-parse --path-format=absolute --git-common-dir`, if its last segment is
`.git`; otherwise (bare repo, old git, error) `<main>` = `<session>`. A session opened in a git
worktree of the repo therefore uses the same board as every other session. Every file of
`factory/` (config, playbook, board, backlog, feature folders) is read and written in
`<main>/factory/`, and agents get absolute paths under `<main>`. Git commands that concern no
feature (pr-state, fetch, cleanup, updating `base_branch`, `worktree add/remove`, `branch -D`) run
as `git -C "<main>" ...`. Where this file says "the main checkout" or `factory/`, it means
`<main>`.

**Workspace.** A feature runs in `branch` mode (`git switch -c`) or in `worktree` mode (a separate
git worktree). The mode is the first line under `## Workspace` in the feature playbook; a feature
without that section (old format) is `branch`. The worktree path is
`<parent of <main>>/<repo>.worktrees/<id>` (`<repo>` = folder name of `<main>`, e.g.
`F:/devflow.worktrees/001-worktree-or-branch`); below it is `<path>`.

**Feature checkout `<dir>`.** The checkout where git, gate and agents of a feature run:
`worktree` → `<path>`; `branch` with a line `checkout: <dir>` under `## Workspace` → that `<dir>`;
`branch` without it → `<main>`. Git and project commands that concern the feature always run in
`<dir>` (`git -C "<dir>" ...`, `cd "<dir>" && <cmd>`), in every mode, even when `<dir>` is `<main>`;
every implementer, committer, reviewer and approver gets the input `workdir: <dir>` whenever
`<dir>` ≠ `<session>` (when `<session>` = `<main>` and `<dir>` = `<main>`, no `workdir`). Paths in
the feature dir stay those of `<main>`. Below, "in `<dir>`" and "`workdir` as in Feature checkout"
refer to this rule, in every mode. If `<dir>` does not exist when a feature is resumed →
`needs-human` with the path.

## Entry point

1. `git rev-parse --show-toplevel` must succeed; compute `<session>` and `<main>` (see **Main
   checkout**). If `<main>/factory/config.md` or `<main>/factory/playbook.md`
   is missing, or the argument is `init`, tell the user to run `/devflow:init` and stop.
   If the whole argument is `status` (case-insensitive, surrounding spaces ignored), read
   `references/status.md` and stop: no forge file, no local state check, no steps 2-4.
   Read `<main>/factory/config.md` once; its frontmatter drives the run. `implementer_model` and
   `escalation_model` have the form `<model> / <effort>` (effort missing → `medium`); a missing key
   uses its default, `sonnet / medium` and `opus / medium`; `secrets_scan` missing is `auto`. Then read the **forge file**
   `forges/<forge>.md` in this skill's base directory (`forge` absent → `github`): it gives the
   commands of the forge operations `auth`, `open-pr`, `update-pr`, `close-pr`, `pr-state`,
   `issues-enabled`, `create-issue`. This file names only the operations; "PR" also means a GitLab merge request.
   If `<session>` ≠ `<main>`, read `## Local state in a worktree` in `references/workspace.md`.
2. Read `<main>/factory/board.md`. If there are `pr-open`, `merged` or `closed` rows, or log lines
   whose id has no row in the board, read `references/pr-state.md` (it also moves finished
   features to the archive, so the first run after an update migrates an existing board).
3. Pick the feature to work on. Active = state `interview`, `spec`, `spec-review`, `build`,
   `review` or `approve`.
   - An id not in the board (full, or `NNN`) is looked up in the table of
     `<main>/factory/archive.md`, read only in this case: an archived id behaves as a `merged` or
     `closed` row of the board (see `references/change.md` and `references/abandon.md`).
   - The argument is an existing id (full, or `NNN` matching `NNN-*`) → **resume that feature**,
     in any active state. The first token is the id, the rest (if any) is the change text; see
     **Changing a feature with an open PR** for `pr-open`, `merged` and `closed` rows and for the
     text on active rows. If the first word of the rest is `abandon` (case-insensitive), it wins
     over a change text: read `references/abandon.md` (the rest after `abandon` is the reason) and
     stop; step 2 has already run.
   - The argument is not an id → new feature. With `workspace: branch` keep the old behaviour: an
     active row is resumed and the argument is added as a `queued` feature (tell the user); with
     no active row, create it.
   - No argument: exactly one active row → resume it; several → AskUserQuestion with the active
     rows (id, title, state) and **New feature** (then ask for its description); none → the oldest
     `queued` row; if none, show the board and stop.
   - Creating a feature: slug from the text, `new` it as `interview` (see **Shared board**), write
     `feature.md` in the folder `new` created.
   - Resuming: if it has no `features/<id>/playbook.md` (old format), set it back to `interview`
     with the log note "restarted: old format".
4. Preconditions before `build`: `git -C "<dir>" status --porcelain` is empty, **auth**
   succeeds. If not, tell the user what is wrong and stop.

## The loop

### Changing a feature with an open PR
When the argument is an id of a `pr-open`, `merged` or `closed` row (archived ones included), an id
with text, or the feature playbook has a change `in progress`, read `references/change.md`.

### 0. Interview — state `interview`
You run it (agents cannot talk to the user). Goal: nothing in the spec is guessed.
0. Workspace, before any other question: read `## Workspace question` in `references/workspace.md`.
1. Read `feature.md`, `factory/playbook.md` and the code the request touches.
2. List for yourself the gaps: everything that cannot be derived from the request, the playbook or
   the code, plus missing details (error behaviour, edge cases, permissions, visible text, data,
   compatibility).
3. Ask **one question at a time** and wait for the answer: the answer shapes the next question.
   Use AskUserQuestion when the question has natural options, otherwise ask in plain text.
4. After every answer, append it to `features/<id>/playbook.md` (format in `references/feature-playbook.md`), so an interrupted
   interview resumes from the first open gap. On resume, re-read the playbook and do not repeat
   answered questions.
5. If the user leaves a choice to you ("you decide"), decide, and write it under
   `## Agent decisions` with the reason; the user sees it at spec approval.
6. If the user proposes a new piece of logic (a behaviour or requirement the request did not have),
   or one emerges from an answer, handle it as in **Deferring logic** below before the next
   question.
7. Stop when you could write every acceptance criterion without guessing. If the request is already
   complete, write "No questions needed." under `## Interview`.

Set state `spec`.

#### Deferring logic
Read `references/deferring.md`.

### 1. Spec — state `spec`
Spawn `devflow:spec-writer` (foreground) with: feature dir, config path, project playbook path,
`ui_review` value. After every spec-writer run (first write, change, Request changes, answers to
open questions, `ESCALATE design`) run the **spec check** below before going on.

With a change, see `## Spec` in `references/change.md`.

After this and every later spec-writer run, append the new lines of its
`## Rule proposals` (from `spec.md`) to `rule-proposals.md` (see 6b). Set state `spec-review`.

**Spec check.** Read `references/spec-check.md`.

### 2. Human approval — state `spec-review`
If the spec's `## Open questions` is not empty, ask them **one at a time**, append the answers to
`## Interview` in the feature playbook, and resume the spec-writer (it removes answered questions)
and run the spec check again before going on. New logic that comes up here or in a "Request changes" is handled as in
**Deferring logic** (step 0). Check that every checklist owner other than `n/a` and `gate` is in `reviewers`;
if not, resume the spec-writer to fix it.
Show the user: first the spec's `## Expected result`, then title, `kind` and why, then (always,
even with `release: off`) the line `PR title: <pr_title> → bump <bump>`, with `<bump>` from the
title alone: `!` (any type) → `major (minor while the version is 0.x)` (fixed text), `feat` →
`minor`, else `patch`; read no version (tag, file, config). With `breaking` set add `Breaking
change: <breaking>`. No `pr_title` in the spec: no line. Then tasks, the `## Done checklist`,
`## Agent decisions`, reviewers, out of scope. If the spec has no
`## Expected result` (written before this section existed), show the rest as usual. Ask with
AskUserQuestion: **Approve / Request changes / Reject**.
- Request changes (including a different `kind`) → resume the spec-writer (SendMessage with its
  agent id, or a fresh spawn with the feedback), run the spec check, and ask again.
- With a change, see `## Human approval` in `references/change.md`.
- Reject → state `needs-human`, note "rejected", stop. If `factory/backlog.md` has uncommitted
  changes, tell the user to commit it.
- Approve → read `## Approve` in `references/workspace.md`.

### 3. Build — state `build`
Each task in the spec's `## Tasks` has its own `devflow:implementer`. The spawn passes `model` and
`effort` from `implementer_model` for `complexity: simple` and from `escalation_model` for `complex`.
Each gets: feature dir, spec path, task id, its `files (owned)`, `parallel`, config path, project
playbook path, `workdir` as in Feature checkout, and `handover` only after an escalation. Record for
each task its current model and its agent id.
- One task → spawn it (foreground) with `parallel: false`: the same flow as a single implementer.
- Several tasks → spawn **in one message** (foreground) every task whose `depends on` tasks are
  done, with `parallel: true`; when they finish, spawn the tasks they unblocked; repeat.
- `ESCALATE design`, `ESCALATE stuck`, an escalation trigger or a file the implementer does not own → `## Escalation` in `references/escalation.md`.
- Keep each task's agent id. Append each reply's `## Rule proposals` to `rule-proposals.md`.

When all tasks are done, compare the changed files with the `files (owned)` columns: the files each
implementer lists in its reply, and `git -C "<dir>" status --porcelain -uall` for the whole tree. Write
`out-of-scope.md` in the feature dir with one line per file that no task owns or that a task
changed without owning it (`<path> — <task or "unknown">`), and log one line per file. It does not
block; the approver gets the file.

**Rework.** Read `## Rework` in `references/escalation.md`.

### 4. Gate — you run it, never trust the implementer's word
Run `build`, `lint`, `test` from config (skip empty ones), in order, stop at first failure; run
them in `<dir>` (`cd "<dir>" && <cmd>`).
Write `gate-r<round>.md`: commands, exit codes, last ~60 lines of output of the failing one.
- Fail → rework (step 3). The second failure in the same round escalates the task (`references/escalation.md`), or
  gives `needs-human` ("gate keeps failing") if its implementer is already on `escalation_model`.
- Pass → append to `gate-r<round>.md` one line `<item id> ok` per checklist item with owner `gate`, then
  commit (4b).

### 4b. Commit
First check for **forbidden files** yourself, then run the **secrets scan**, both as in
`references/forbidden-files.md`.

Then spawn `devflow:committer` (foreground) with feature id, feature dir, round, config path
(and `workdir` as in Feature checkout). It
makes one commit per task, following `## Tasks` in the spec.
- `OK` → append the commit list to `gate-r<round>.md`,
  state `review`.
- `FAILED` because of a commit hook → write the output to `gate-r<round>.md` and treat it as a gate
  fail (rework, same retry limit).
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
`reviews/r<round>-<reviewer>.md`, `workdir` as in Feature checkout, and for round > 1 its own
previous review path (it marks repeated blocking items with `repeat:`). `review-security` also gets
`secrets_scan: <mode>` and `secrets_script: <absolute path of scripts/secrets-scan.sh in this
skill's base directory>`. With `ui_review: browser`,
start `dev_server` in `<dir>`. It reads the project playbook and the feature playbook's
`## Done checklist` itself.
After the reviews, append their `## Rule proposals` to `rule-proposals.md`.
Agent types: `devflow:review-security`, `devflow:review-code`, `devflow:review-ux`, `devflow:review-ui`.

Read only the frontmatter `verdict` of each file:
Rounds are counted per change: `start` = 1, or the `from` round of the change `in progress`. File
numbering (`gate-r<N>`, `reviews/r<N>`) keeps growing.
- any `CHANGES` and `round - start + 1 <= max_rounds` → round + 1, state `build`, go to 3 (rework;
  a `repeat:` item on a file of a task escalates it there).
- any `CHANGES` and `round - start + 1 > max_rounds` → `needs-human` ("reviews still blocking after N rounds").
- all `PASS` → state `approve`.

### 6. Approval — state `approve`
If `decision.md` already says `APPROVE` for this round (resume after an interrupted 6b or PR step),
skip the approver. Otherwise spawn `devflow:approver` (foreground) with feature dir, base branch,
round (and `workdir` as in Feature checkout). Read `decision.md` frontmatter:
- `ESCALATE` → `needs-human` with the approver's reason.
- `APPROVE` → rule proposals (6b), then write the title (first line) and the body to
  `features/<id>/pr.md` and open the PR with **open-pr** (base `<base_branch>`, head `<kind>/<id>`,
  title, body file). PR title = `pr_title` of the spec (Conventional Commits, so a squash merge
  leaves a conventional commit on the base branch); a spec without `pr_title` (written before it
  existed) uses the `PR title:` line in `gate-r1.md`, and if missing builds it from the spec title:
  `fix` for a hotfix, else `feat`, scope = the main area touched. The forge files pass the title
  in single quotes; in the fallback title write each `'` as `'\''`. Body = spec title as heading +
  spec goal + (with `breaking` set) a line of its own `BREAKING CHANGE: <breaking>` at line
  start + done checklist table from `decision.md` + non-blocking review notes + footer
  `Built by devflow factory, <N> review round(s)` and a last line `Factory: <id>`. Set state
  `pr-open` with the reference open-pr returned in the PR column (`-` with forge `git`: pass on its
  message to the user), then, in `branch` mode without `checkout:` only, `git -C "<main>" switch "<base_branch>"`;
a worktree or a `checkout:` folder stays on its branch until the merge (cleanup). If open-pr fails, `needs-human` with the
  output.

With a change, see `## Approval` in `references/change.md`.

### 6b. Rule proposals — still state `approve`
Read `references/rule-proposals.md`.

### needs-human
Update the board, leave the branch as it is, tell the user in 2-3 lines why and what to look at
(file paths), stop. The user fixes things and re-runs `/devflow:factory`, which resumes from the
board state (they can edit the state cell by hand to choose where to resume).
