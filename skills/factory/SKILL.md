---
name: factory
description: Run the devflow software factory - interview, spec, parallel build, gate, parallel reviews, approval, pull request - one feature at a time per session, guided by a project playbook.
argument-hint: "[<feature id> [<change>] | <feature description>]"
disable-model-invocation: true
---

# Factory orchestrator

You are the orchestrator. You run the loop below, spawn every agent, run the gate, and you are the
**only writer** of `factory/board.md`. Agents never touch the board. Pass agents **file paths**, not
file contents, so your context stays small.

Talk to the user in their language. Artifacts are written in the language of `feature.md`.

Before every choice you ask the user to make (AskUserQuestion or plain text), give a short
context in two or three lines: what is being decided, why it comes up now, and what each option
implies. The user must be able to choose without opening any file.

## Files (in the target project)

```
factory/
├── config.md                  committed: commands, forge (github | gitlab | azure | git), workspace, ...
├── playbook.md                committed: project rules + Definition of Done (user-approved)
├── backlog.md                 committed: deferred logic queued on the board (see Deferring logic)
├── board.md                   everything except config.md, playbook.md and backlog.md is gitignored
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
    └── change-<n>.md          PR comment for change <n>, written by you
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
On every state change update the row **and** append one log line (local time, `YYYY-MM-DD HH:MM`).

**Shared board.** Several sessions can run different features at once, each writing this board.
Right before every write, re-read `board.md`, change only your own row, and append your log lines
at the end. Compute the next free NNN at that moment, as the highest plus one of: the ids in the
board and in `<main>/factory/features/` (re-read), the local and remote branches `*/NNN-*`
(`git -C "<main>" branch -a --format=%(refname:short)`) and the basenames `NNN-*` of the paths in
`git -C "<main>" worktree list --porcelain`.

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
`branch` without it → `<main>`. When `<dir>` is not `<main>`, git and project commands that concern
the feature run there (`git -C "<dir>" ...`, `cd "<dir>" && <cmd>`), and every implementer,
committer, reviewer and approver gets the input `workdir: <dir>`; for `<main>` no `workdir` is
passed. Paths in the feature dir stay those of `<main>`. Below, "in `worktree` mode ... `<path>`"
applies in the same way to a `branch` feature with `checkout: <dir>`, using `<dir>`. If `<dir>`
does not exist when a feature is resumed → `needs-human` with the path.

## Entry point

1. `git rev-parse --show-toplevel` must succeed; compute `<session>` and `<main>` (see **Main
   checkout**). If `<main>/factory/config.md` or `<main>/factory/playbook.md`
   is missing, or the argument is `init`, tell the user to run `/devflow:init` and stop.
   Read `<main>/factory/config.md` once; its frontmatter drives the run. `implementer_model` and
   `escalation_model` have the form `<model> / <effort>` (effort missing → `medium`); a missing key
   uses its default, `sonnet / medium` and `opus / medium`. Then read the **forge file**
   `forges/<forge>.md` in this skill's base directory (`forge` absent → `github`): it gives the
   commands of the six forge operations `auth`, `open-pr`, `update-pr`, `pr-state`,
   `issues-enabled`, `create-issue`. This file names only the operations; "PR" also means a GitLab merge request.
   **Local state in a worktree.** If `<session>` ≠ `<main>`: the local features are the ids of the
   rows of `<session>/factory/board.md` and the folders `<session>/factory/features/*`. If at least
   one is not in the board of `<main>` (full id): list ids and titles, explain the manual move
   (copy the folder into `<main>/factory/features/`; if its id is already used, renumber it to the
   next free NNN, branch included; copy its row and log lines into the main board; then delete
   `<session>/factory/board.md` and the copied folders) and stop without writing anything. Local
   features already in the main board do not block; suggest in one line to delete them.
2. Read `<main>/factory/board.md`. If there are `pr-open` rows, `git -C "<main>" fetch --prune`
   once, then run **pr-state** for each (PR reference from the PR column, branch from the branch column):
   - `MERGED` → state `merged`.
   - `CLOSED` → state `closed`; keep the branch. Tell the user in one line: to resume it, set the
     state by hand (e.g. `approve`) and reopen the PR; otherwise they can delete the branch.
   - `OPEN` → nothing. With forge `git`, list these rows in one line: if one was merged and not
     detected (squash merge with resolved conflicts), the user sets it `merged` by hand.
   - `UNKNOWN` → nothing; say in one line which rows could not be checked and why.

   **Cleanup** of every `merged` row whose local branch still exists, including rows the user set
   `merged` by hand:
   0. If the row's checkout folder exists (the worktree `<path>`, or `<dir>` of a `checkout:` line):
      if it is `<session>` or `<main>`, skip the removal and say so in one line. Otherwise
      `git -C "<main>" worktree remove "<folder>"` (never `--force`), then
      `git -C "<main>" branch -D "<kind>/<id>"` and log "worktree and branch deleted". If the
      removal fails (e.g. local changes), keep both and say so in one line. Skip step 1 for this
      row.
   1. Without such a folder, if the branch is not checked out in any worktree
      (`git -C "<main>" worktree list --porcelain`): `git -C "<main>" branch -D "<kind>/<id>"` and
      log "branch deleted". `-D` because after a squash or rebase merge `-d` refuses; it is safe
      because pr-state, or the user editing the board, has confirmed the merge. If it is checked
      out somewhere, keep it and tell the user in one line.
   2. If at least one branch was deleted or one row became `merged`, update the base branch in
      `<main>`: if the branch checked out in `<main>` is `base_branch`,
      `git -C "<main>" pull --ff-only`; else `git -C "<main>" fetch origin
      <base_branch>:<base_branch>`. If it fails (local commits, conflicting
      changes), tell the user in one line and go on.
3. Pick the feature to work on. Active = state `interview`, `spec`, `spec-review`, `build`,
   `review` or `approve`.
   - The argument is an existing id (full, or `NNN` matching `NNN-*`) → **resume that feature**,
     in any active state. The first token is the id, the rest (if any) is the change text; see
     **Changing a feature with an open PR** for `pr-open`, `merged` and `closed` rows and for the
     text on active rows.
   - The argument is not an id → new feature. With `workspace: branch` keep the old behaviour: an
     active row is resumed and the argument is added as a `queued` feature (tell the user); with
     no active row, create it.
   - No argument: exactly one active row → resume it; several → AskUserQuestion with the active
     rows (id, title, state) and **New feature** (then ask for its description); none → the oldest
     `queued` row; if none, show the board and stop.
   - Creating a feature: next free NNN (see **Shared board**), slug from the text, write
     `feature.md` in `<main>/factory/features/<id>/`, add the row as `interview`.
   - Resuming: if it has no `features/<id>/playbook.md` (old format), set it back to `interview`
     with the log note "restarted: old format".
4. Preconditions before `build`: `git status --porcelain` is empty (run it in `<dir>`), **auth**
   succeeds. If not, tell the user what is wrong and stop.

## The loop

### Changing a feature with an open PR
Entry: `/devflow:factory <id> <text>` or `<id>` alone, on a row in state `pr-open`. Step 2 has
already run pr-state for it.
- `MERGED` or `CLOSED` → explain that the feature can no longer be changed, suggest
  `/devflow:factory <text>` to open a new feature with the same text, stop without changing anything.
- `UNKNOWN` → say the PR state cannot be verified and why, stop.
- `OPEN`, `<id>` alone → show the state and the PR link, ask in plain text which change to make; an
  empty answer → stop without changing anything.
- `OPEN`, with text → start the change.
- `<id> <text>` on an active row: state `interview` → append `**Note.** <text>` to `## Interview`
  and resume; any other active state, `queued` or `needs-human` → tell the user the text is
  ignored and resume as usual. On `merged`/`closed` rows: as above.

**Start of a change.**
1. In `branch` mode `git -C "<dir>" status --porcelain` must be empty; otherwise say so and stop, registering
   nothing.
2. `n` = number of lines in the feature playbook's `## Changes` + 1. Append to `## Changes` (create
   it after `## Deferred` if missing) `- Change <n> — <text> — from round <board round + 1> — in
   progress`, and to `## Interview` the line `**Change <n>.** <text>`. Set state `interview`, log
   `pr-open → interview · change <n>`.
3. Align the branch: `branch` mode → `git -C "<dir>" switch "<branch>"` (if the local branch is
   missing: `git -C "<dir>" switch -c "<branch>" --track "origin/<branch>"`), then
   `git -C "<dir>" pull --ff-only`; `worktree` mode → `git -C "<path>" pull --ff-only`. A missing
   `<dir>` or `<path>` → `needs-human`. Any error →
   `needs-human` with the output; the user fixes it and sets the state back to `interview`. The base
   branch is not merged in.

The interview of a change follows step 0 limited to the change, without the workspace question;
questions continue the `Q<n>` numbering under the `**Change <n>.**` line, and it can end with
"No questions needed."; Deferring logic is unchanged. A change `in progress` found at resume is
the one with the highest `<n>` in that state.

### 0. Interview — state `interview`
You run it (agents cannot talk to the user). Goal: nothing in the spec is guessed.
0. Workspace, before any other question; skip it if `## Workspace` already exists (resume).
   `workspace` in config `branch` or `worktree` → no question; `ask` or absent → AskUserQuestion
   **Branch / Worktree**, with the short context: a worktree lets other sessions work on other
   features in parallel, at the cost of a separate folder and its setup. Write the value under
   `## Workspace` in the feature playbook, before `## Interview` (also when the interview is
   "No questions needed."). If the mode is `branch` and `<session>` ≠ `<main>`, also write the line
   `checkout: <session>` right below it.
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
6. If the user proposes a new piece of logic (a behaviour or requirement the request did not have),
   or one emerges from an answer, handle it as in **Deferring logic** below before the next
   question.
7. Stop when you could write every acceptance criterion without guessing. If the request is already
   complete, write "No questions needed." under `## Interview`.

```markdown
# <id> — <short title>

## Request
<text of feature.md>

## Workspace
branch

## Interview
**Q1.** ...
**A1.** ...

## Agent decisions
- <decision> — <why>

## Deferred
- <logic> — <issue URL | queued <new id>>

## Done checklist
(written by the spec-writer)
```
Set state `spec`.

#### Deferring logic
Only behaviour and requirements; project conventions go through rule proposals (6b).
1. Judge it against the request and the answers so far. Recommend **Integrate** when it is coherent
   with them (contradicts no decision) and does not substantially widen the feature (no new page,
   integration or data model). Recommend **Defer** otherwise, and always when the request fixes
   something that should already work.
2. Ask with AskUserQuestion: **Integrate / Defer**, recommended option first. Write the question and
   the answer in `## Interview` as the next `Q<n>`/`A<n>`.
3. Integrate → it is part of the feature from now on: keep asking about its gaps.
4. Defer → if **issues-enabled** is `true`, open one issue per logic with **create-issue**, in
   the language of `feature.md`: title = short title; body (in a temp file) = what the logic does,
   what was said about it, footer `Deferred from <id> — <feature title>`.
   Otherwise (`false`, CLI missing or not authenticated, create-issue failed) → queue it: next free
   NNN, write `features/<new id>/feature.md` with the logic and the same footer, add the row as
   `queued` with a log line, and append `- <new id> — <logic> — deferred from <id>` to
   `factory/backlog.md` (create it with the heading `# Factory backlog`). The board is gitignored,
   so the backlog is the committed record.
5. Right after, append the line to `## Deferred` in the feature playbook, so a resume does not open
   it twice. A deferred logic is out of scope for this feature.

### 1. Spec — state `spec`
Spawn `devflow:spec-writer` (foreground) with: feature dir, config path, project playbook path,
`ui_review` value. After every spec-writer run (first write, change, Request changes, answers to
open questions, `ESCALATE design`) run the **spec check** below before going on.

For a change `<n>`, first copy `spec.md` to `spec-c<n>.md` and the `## Done checklist` section to
`checklist-c<n>.md` (feature dir), and pass also `change: <n>`. The spec-writer rewrites `## Tasks`
always, the rest of the spec and the checklist only if the behaviour changes. If the spec outside
`## Tasks` or the checklist differ from the snapshots → state `spec-review`; otherwise go straight
to `build` with round = board round + 1 and log `spec → build · change <n> spec unchanged`.

After this and every later spec-writer run, append the new lines of its
`## Rule proposals` (from `spec.md`) to `rule-proposals.md` (see 6b). Set state `spec-review`.

**Spec check.** Spawn `devflow:spec-checker` (foreground) with feature dir, config path, project
playbook path, output path `<feature dir>/spec-check.md`, `workdir` if the worktree exists, and in
the spawn `model: opus`, `effort: low` (the spawn parameter is what guarantees the model; `review-code`
stays `model: opus` with no fixed effort). Read only the frontmatter `verdict`:
- `PASS` → go on.
- `GAPS` → resume the spec-writer (SendMessage, or a fresh spawn) with the path of `spec-check.md`,
  then check again. At most 2 corrections per spec-writer run.
- Still `GAPS` after the second correction → append each remaining gap to the spec's
  `## Open questions` as `- T<n> — <gap> (spec check)`; `spec-review` asks them to the user.
In a change, the comparison with the snapshots (above) and the jump to `build` happen only after a
`PASS`; with `GAPS` left over the state is `spec-review`.

### 2. Human approval — state `spec-review`
If the spec's `## Open questions` is not empty, ask them **one at a time**, append the answers to
`## Interview` in the feature playbook, and resume the spec-writer (it removes answered questions)
and run the spec check again before going on. New logic that comes up here or in a "Request changes" is handled as in
**Deferring logic** (step 0). Check that every checklist owner other than `n/a` and `gate` is in `reviewers`;
if not, resume the spec-writer to fix it.
Show the user: first the spec's `## Expected result`, then title, `kind` and why, tasks, the
`## Done checklist`, `## Agent decisions`, reviewers, out of scope. If the spec has no
`## Expected result` (written before this section existed), show the rest as usual. Ask with
AskUserQuestion: **Approve / Request changes / Reject**.
- Request changes (including a different `kind`) → resume the spec-writer (SendMessage with its
  agent id, or a fresh spawn with the feedback), run the spec check, and ask again.
- Reject on a change → restore `spec.md` and the checklist from `spec-c<n>.md` and
  `checklist-c<n>.md`, mark the change `rejected` in `## Changes`, state `pr-open`, log
  `spec-review → pr-open · change <n> rejected`, in `branch` mode without `checkout:`
  `git switch "<base_branch>"` (with `checkout:` `<dir>` stays on the branch); the PR is not
  touched.
- Approve on a change → state `build`, round = board round + 1; no new branch or worktree (skip
  the two Approve items below).
- Reject → state `needs-human`, note "rejected", stop. If `factory/backlog.md` has uncommitted
  changes, tell the user to commit it.
- Approve, `branch` mode without `checkout:` → `git switch <base_branch> && git pull --ff-only &&
  git switch -c <kind>/<id>` (`feature/<id>` or `hotfix/<id>`), write the branch in the board.
  With `checkout: <dir>`: update `base_branch` in `<main>` as in worktree step 1 below, then
  `git -C "<dir>" switch -c "<kind>/<id>" "<base_branch>"`, write the branch in the board, and move
  the feature's backlog lines into `<dir>` as in worktree step 5 (with `<dir>` for `<path>`). If
  `factory/backlog.md` has uncommitted changes, add `!factory/backlog.md` to `.gitignore` if
  missing, then `git add factory/backlog.md .gitignore && git commit -m "docs(factory): update
  backlog"` with the footer `Factory: <id>` (a hook rejection → `needs-human` with the output).
  Set state `build`, round `1`.
- Approve, `worktree` mode:
  1. Update `base_branch` without switching branch in `<main>`: `git -C "<main>" pull --ff-only` if
     it is the current branch, else `git -C "<main>" fetch origin <base_branch>:<base_branch>`.
  2. `git -C "<main>" worktree add -b "<kind>/<id>" "<path>" <base_branch>`; the branch column is
     `<kind>/<id>`, as in `branch` mode; log `spec-review → build · worktree <path>`.
  3. If `worktree_setup` in config is not empty, run it in `<path>`.
  4. An error → `needs-human` with the output. In 1-2 no worktree exists: the user fixes the cause
     and sets the state back to `spec-review` (the next Approve creates it). In 3 worktree and
     branch stay: the user runs the setup by hand in `<path>` and sets the state back to `build`.
  5. If the feature playbook's `## Deferred` has `queued` lines, move this feature's backlog lines
     (those ending in `deferred from <id>`) into the worktree, never the whole file: `mkdir -p
     "<path>/factory"`, append them to `<path>/factory/backlog.md` (create it with the heading
     `# Factory backlog` if missing), add `!factory/backlog.md` to `<path>/.gitignore` if missing,
     commit in `<path>` with the same message and footer as above. Then remove only those lines
     from `factory/backlog.md` in the main checkout (`git restore` the file only if no other line
     differs from `HEAD`): other sessions may have uncommitted lines there.
  Set state `build`, round `1`. A rejected spec never creates a worktree.

### 3. Build — state `build`
Each task in the spec's `## Tasks` has its own `devflow:implementer`. The spawn passes `model` and
`effort` from `implementer_model` for `complexity: simple` and from `escalation_model` for `complex`.
Each gets: feature dir, spec path, task id, its `files (owned)`, `parallel`, config path, project
playbook path, `workdir` in `worktree` mode, and `handover` only after an escalation. Record for
each task its current model and its agent id.
- One task → spawn it (foreground) with `parallel: false`: the same flow as a single implementer.
- Several tasks → spawn **in one message** (foreground) every task whose `depends on` tasks are
  done, with `parallel: true`; when they finish, spawn the tasks they unblocked; repeat.
- `ESCALATE design: <reason>` → log it, resume the spec-writer with the reason, then run the spec
  check. Tell the user the spec-writer's summary line, and ask the new open questions (as in step
  2). State `build`, then resume the same implementer. A second `ESCALATE design` on the same task
  in the same round → `needs-human`.
- **Escalation to `escalation_model`.** Triggers: `ESCALATE stuck`; the gate failing for the second
  time in the same round (also for a commit hook); a blocking item prefixed `repeat:` on a file of
  the task (items with no path go to the implementer chosen for them, see Rework). If the task's
  current implementer runs on `implementer_model`: write
  `<feature dir>/handover-<task>-r<round>.md` with the reason (or the `ESCALATE` reply), the paths
  of the round's `gate-r<N>.md` and `reviews/r<N>-*.md`, and the output of `git diff HEAD -- <owned
  files>` redirected into the file with the paths quoted (in `worktree` mode `git -C "<path>"`).
  Spawn a new implementer on `escalation_model` with the same inputs plus `handover: <path>`; from
  then on it is the task's **current implementer**.
- With the implementer already on `escalation_model`: `ESCALATE stuck` → `needs-human` with the
  reason; gate failing twice → `needs-human` ("gate keeps failing"); `repeat:` → normal rework,
  limited by `max_rounds`. The round number never triggers an escalation.
- An implementer that stops because it needs a file it does not own: if another task owns the
  file, send that change to the other task's implementer once both are idle; if no task owns it,
  resume the spec-writer to add the file to a task in `## Tasks`, then resume the implementer.
- Keep each task's agent id. Append each reply's `## Rule proposals` to `rule-proposals.md`.

When all tasks are done, compare the changed files with the `files (owned)` columns: the files each
implementer lists in its reply, and `git status --porcelain -uall` for the whole tree (in `worktree` mode in `<path>`). Write
`out-of-scope.md` in the feature dir with one line per file that no task owns or that a task
changed without owning it (`<path> — <task or "unknown">`), and log one line per file. It does not
block; the approver gets the file.

**Rework.** Resume implementers with SendMessage (if you no longer have an agent id, new session,
spawn a fresh `devflow:implementer` with the task's current model (`implementer_model` if unknown)
and the same inputs, and the instruction "rework").
- Review items: group the `## Blocking` items of the reviews with `verdict: CHANGES` by `path` and
  send each group to the current implementer of the task that owns that file; several
  implementers at once → in one message with `parallel: true`. Items with no path (a page, a flow)
  or on a file no task owns go, **after** that group has finished, to one implementer with
  `parallel: false` (chosen as in the gate rule below), listed explicitly, not as "whole rework".
- Gate or commit-hook failure: send the gate file to one implementer, with the instruction that it
  owns the whole rework and `parallel: false`: the task that owns a path named in the failing output,
  else the current implementer of a `complex` task if any, else the current implementer of `T1`.

### 4. Gate — you run it, never trust the implementer's word
Run `build`, `lint`, `test` from config (skip empty ones), in order, stop at first failure; in
`worktree` mode run them in `<path>`.
Write `gate-r<round>.md`: commands, exit codes, last ~60 lines of output of the failing one.
- Fail → rework (step 3). The second failure in the same round escalates the task (step 3), or
  gives `needs-human` ("gate keeps failing") if its implementer is already on `escalation_model`.
- Pass → append to `gate-r<round>.md` one line `<item id> ok` per checklist item with owner `gate`, then
  commit (4b).

### 4b. Commit
First check for **forbidden files** yourself: list the changed paths with
`git status --porcelain -uall` (in `worktree` mode in `<path>`). Forbidden:
- secrets or credentials, `.env*` (except `.env.example`);
- build output: any path segment `bin/`, `obj/`, `dist/`, `build/`, `target/`, `node_modules/`,
  `__pycache__/`;
- files under `factory/`;
- files over 1 MB that no task lists in `files (owned)`.

A pattern that `## Commit rules` in `config.md` explicitly allows (e.g. "commit `dist/`") is not
forbidden. Any forbidden file → `needs-human` with the list of paths; do not spawn the committer.

Then spawn `devflow:committer` (foreground) with feature id, feature dir, round, config path
(and `workdir` in `worktree` mode). It
makes one commit per task, following `## Tasks` in the spec.
- `OK` → append the commit list (and, in round 1, the `PR title:` line) to `gate-r<round>.md`,
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
`reviews/r<round>-<reviewer>.md`, `workdir` in `worktree` mode, and for round > 1 its own previous
review path (it marks repeated blocking items with `repeat:`). With `ui_review: browser` in `worktree` mode, start `dev_server` in `<path>`. It reads the
project playbook and the feature playbook's `## Done checklist` itself.
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
round (and `workdir` in `worktree` mode). Read `decision.md` frontmatter:
- `ESCALATE` → `needs-human` with the approver's reason.
- `APPROVE` → rule proposals (6b), then write the title (first line) and the body to
  `features/<id>/pr.md` and open the PR with **open-pr** (base `<base_branch>`, head `<kind>/<id>`,
  title, body file). PR title = the `PR title:` line in `gate-r1.md` (Conventional Commits, so a squash merge leaves a
  conventional commit on the base branch); if missing, build it the same way from the spec title:
  `fix` for a hotfix, else `feat`, scope = the main area touched. Body = spec title as heading +
  spec goal + done checklist table from `decision.md` + non-blocking review notes + footer
  `Built by devflow factory, <N> review round(s)` and a last line `Factory: <id>`. Set state
  `pr-open` with the reference open-pr returned in the PR column (`-` with forge `git`: pass on its
  message to the user), then, in `branch` mode without `checkout:` only, `git switch <base_branch>`;
a worktree or a `checkout:` folder stays on its branch until the merge (cleanup). If open-pr fails, `needs-human` with the
  output.

**With a change `in progress`** (also on resume in `approve`) use **update-pr** instead of
open-pr. Rewrite `pr.md` as above (footer with the total number of rounds); the title is the
first line of the existing `pr.md`, unless `title` or `kind` of the spec differ from
`spec-c<n>.md`: then rebuild it with the fallback rule above. The branch stays the one in the
board even if `kind` changed. Write `change-<n>.md` in the language of `feature.md`: `Change <n>:
<text>`, whether the spec was updated (yes/no), the commits of the change's rounds (from
`gate-r<N>.md`), footer `Factory: <id>`. Call update-pr (reference from the PR column, head =
branch column, title, body file `pr.md`, comment file `change-<n>.md`). Push or title/body failure
→ `needs-human` with the output; comment failure → one line to the user, go on. Then mark the
change `approved`, state `pr-open`, PR column unchanged, and in `branch` mode without `checkout:`
`git switch "<base_branch>"`. With forge `git`, pass on update-pr's message to the user.

### 6b. Rule proposals — still state `approve`
`rule-proposals.md` collects, in order, the `## Rule proposals` of spec-writer, implementers and
reviewers, one line each with author and round:

```markdown
- [ ] Patterns: New REST endpoint follows `src/api/orders/OrdersController.cs` — three endpoints (`src/api/orders/`, `src/api/users/`, `src/api/items/`) share its routing and error shape, and the new one diverged, so clients broke — review-code r1
```

Prepare the open `- [ ]` lines:
1. Drop duplicates and rules the project playbook already has (mark them `- [dup]`); they stay out
   of the list.
2. Find **conflicts** (two proposals that exclude each other) and **dependents** (a proposal that
   only makes sense if another open proposal is approved). A rule whose base is already in the
   playbook is not a dependent.

**Conflicts, before the list.** For each pair ask with AskUserQuestion: rule A / rule B / None. The
chosen rule is approved (`[x]`), the other one (both with None) is discarded (`[-]`).

**List.** Show the remaining non-dependent proposals in a single text message, numbered from 1. Each
entry: number, playbook section, rule text, why, author and round. Skip the step if the list is
empty. Under the list explain how to answer, once:
- numbers separated by commas (`1,3,5`) approve those rules; the ones not listed are `[-]`;
- `all` / `none` (or the equivalent in the user's language, e.g. "tutte" / "nessuna");
- `<n>: <new text>` approves `n` with the rewritten text. The text runs to the end of the line, so
  several rewrites go on separate lines (e.g. `1,3, 5: <new text>`).

If the answer is not valid (number outside the list, same number repeated with different texts,
format not understood), explain the error and ask again; mark no line until the answer is valid.

**Dependents, after the list.** Base approved → ask AskUserQuestion **Approve / Edit / Discard**,
one at a time, a base before its dependents. Base discarded → `[-]` without asking.

Mark each line
`[x]` approved (with the final text if rewritten) or `[-]` discarded. Add the approved rules to their
section of `factory/playbook.md` (Definition of Done items as `- [<owner>] <item>`, appended at the
end so existing `DoD-<n>` ids do not move). Only if at least one rule was approved, commit it on the
feature branch: `git add factory/playbook.md && git commit -m "docs(factory): update playbook"` with
the footer `Factory: <id>`. When `<dir>` is not `<main>` (`worktree` mode or `checkout:`) add the
rules to `<dir>/factory/playbook.md` and commit in `<dir>`; never edit `factory/playbook.md` in
`<main>`, which other sessions share. If a commit hook rejects it, `needs-human` with the output. The rules
reach the base branch with the PR. If the feature goes to `needs-human`, the file stays and its open lines are
shown when the feature is back in `approve`.

### needs-human
Update the board, leave the branch as it is, tell the user in 2-3 lines why and what to look at
(file paths), stop. The user fixes things and re-runs `/devflow:factory`, which resumes from the
board state (they can edit the state cell by hand to choose where to resume).
