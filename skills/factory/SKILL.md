---
name: factory
description: Run the devflow software factory - interview, spec, parallel build, gate, parallel reviews, approval, pull request - one feature at a time per session, guided by a project playbook.
argument-hint: "[<feature id> | <feature description>]"
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
    ├── rule-proposals.md      rules proposed by agents, collected by you
    ├── out-of-scope.md        changed files outside the tasks' owned files, written by you
    ├── gate-r<N>.md           gate output (tail only)
    ├── reviews/r<N>-<reviewer>.md
    ├── decision.md            approver
    └── pr.md                  PR title (first line) and body, written by you
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
at the end. Compute the next free NNN from the board and `factory/features/` re-read at that moment.

**Workspace.** A feature runs in `branch` mode (the main checkout, `git switch -c`) or in
`worktree` mode (a separate git worktree). The mode is the single line under `## Workspace` in the
feature playbook; a feature without that section (old format) is `branch`. The worktree path is
`<parent of toplevel>/<repo>.worktrees/<id>` (`<repo>` = folder name of the toplevel, e.g.
`F:/devflow.worktrees/001-worktree-or-branch`); below it is `<path>`. You always stay in the main
checkout (`factory/` lives only there). In `worktree` mode git and project commands that concern
the feature run in `<path>` (`git -C <path> ...`, `cd <path> && <cmd>`), and every implementer,
committer, reviewer and approver gets the input `workdir: <path>`. Paths in the feature dir stay
those of the main checkout.

## Entry point

1. `git rev-parse --show-toplevel` must succeed. If `factory/config.md` or `factory/playbook.md`
   is missing, or the argument is `init`, tell the user to run `/devflow:init` and stop.
   Read `factory/config.md` once; its frontmatter drives the run. Then read the **forge file**
   `forges/<forge>.md` in this skill's base directory (`forge` absent → `github`): it gives the
   commands of the five forge operations `auth`, `open-pr`, `pr-state`, `issues-enabled`,
   `create-issue`. This file names only the operations; "PR" also means a GitLab merge request.
2. Read `factory/board.md`. If there are `pr-open` rows, `git fetch --prune` once, then run
   **pr-state** for each (PR reference from the PR column, branch from the branch column):
   - `MERGED` → state `merged`.
   - `CLOSED` → state `closed`; keep the branch. Tell the user in one line: to resume it, set the
     state by hand (e.g. `approve`) and reopen the PR; otherwise they can delete the branch.
   - `OPEN` → nothing. With forge `git`, list these rows in one line: if one was merged and not
     detected (squash merge with resolved conflicts), the user sets it `merged` by hand.
   - `UNKNOWN` → nothing; say in one line which rows could not be checked and why.

   **Cleanup** of every `merged` row whose local branch still exists, including rows the user set
   `merged` by hand:
   0. If the row's worktree `<path>` exists: `git worktree remove <path>` (never `--force`), then
      `git branch -D <kind>/<id>` and log "worktree and branch deleted". If the removal fails
      (e.g. local changes), keep both and say so in one line. Skip step 1 for this row.
   1. Without a worktree, if the branch is not the current branch: `git branch -D <kind>/<id>` and log "branch
      deleted". `-D` because after a squash or rebase merge `-d` refuses; it is safe because
      pr-state, or the user editing the board, has confirmed the merge. If it is the current
      branch, keep it and tell the user.
   2. If at least one branch was deleted or one row became `merged`, update the base branch: if the
      current branch is `base_branch`, `git pull --ff-only`; else
      `git fetch origin <base_branch>:<base_branch>`. If it fails (local commits, conflicting
      changes), tell the user in one line and go on.
3. Pick the feature to work on. Active = state `interview`, `spec`, `spec-review`, `build`,
   `review` or `approve`.
   - The argument is an existing id (full, or `NNN` matching `NNN-*`) → **resume that feature**,
     in any active state.
   - The argument is not an id → new feature. With `workspace: branch` keep the old behaviour: an
     active row is resumed and the argument is added as a `queued` feature (tell the user); with
     no active row, create it.
   - No argument: exactly one active row → resume it; several → AskUserQuestion with the active
     rows (id, title, state) and **New feature** (then ask for its description); none → the oldest
     `queued` row; if none, show the board and stop.
   - Creating a feature: next free NNN, slug from the text, write `feature.md`, add the row as
     `interview`.
   - Resuming: if it has no `features/<id>/playbook.md` (old format), set it back to `interview`
     with the log note "restarted: old format".
4. Preconditions before `build`: `git status --porcelain` is empty (in `worktree` mode, run it in
   `<path>`), **auth** succeeds. If not, tell the user what is wrong and stop.

## The loop

### 0. Interview — state `interview`
You run it (agents cannot talk to the user). Goal: nothing in the spec is guessed.
0. Workspace, before any other question; skip it if `## Workspace` already exists (resume).
   `workspace` in config `branch` or `worktree` → no question; `ask` or absent → AskUserQuestion
   **Branch / Worktree**, with the short context: a worktree lets other sessions work on other
   features in parallel, at the cost of a separate folder and its setup. Write the value under
   `## Workspace` in the feature playbook, before `## Interview` (also when the interview is
   "No questions needed.").
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
`ui_review` value. After this and every later spec-writer run, append the new lines of its
`## Rule proposals` (from `spec.md`) to `rule-proposals.md` (see 6b). Set state `spec-review`.

### 2. Human approval — state `spec-review`
If the spec's `## Open questions` is not empty, ask them **one at a time**, append the answers to
`## Interview` in the feature playbook, and resume the spec-writer (it removes answered questions)
before going on. New logic that comes up here or in a "Request changes" is handled as in
**Deferring logic** (step 0). Check that every checklist owner other than `n/a` and `gate` is in `reviewers`;
if not, resume the spec-writer to fix it.
Show the user: first the spec's `## Expected result`, then title, `kind` and why, tasks, the
`## Done checklist`, `## Agent decisions`, reviewers, out of scope. If the spec has no `## Expected
result` (written before this section existed), show the rest as usual. Ask with AskUserQuestion: **Approve / Request changes / Reject**.
- Request changes (including a different `kind`) → resume the spec-writer (SendMessage with its
  agent id, or a fresh spawn with the feedback) and ask again.
- Reject → state `needs-human`, note "rejected", stop. If `factory/backlog.md` has uncommitted
  changes, tell the user to commit it.
- Approve, `branch` mode → `git switch <base_branch> && git pull --ff-only && git switch -c
  <kind>/<id>` (`feature/<id>` or `hotfix/<id>`), write the branch in the board. If
  `factory/backlog.md` has uncommitted changes, add `!factory/backlog.md` to `.gitignore` if
  missing, then `git add factory/backlog.md .gitignore && git commit -m "docs(factory): update
  backlog"` with the footer `Factory: <id>` (a hook rejection → `needs-human` with the output).
  Set state `build`, round `1`.
- Approve, `worktree` mode:
  1. Update `base_branch` without switching branch in the main checkout: `git pull --ff-only` if it
     is the current branch, else `git fetch origin <base_branch>:<base_branch>`.
  2. `git worktree add -b "<kind>/<id>" "<path>" <base_branch>`; the branch column is
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
Each task in the spec's `## Tasks` has its own implementer: `complexity: simple` → `devflow:coder`
(sonnet), `complex` → `devflow:builder` (opus). Each gets: feature dir, spec path, task id, its
`files (owned)`, `parallel`, config path, project playbook path, and `workdir` in `worktree` mode.
- One task → spawn it (foreground) with `parallel: false`: the same flow as a single implementer.
- Several tasks → spawn **in one message** (foreground) every task whose `depends on` tasks are
  done, with `parallel: true`; when they finish, spawn the tasks they unblocked; repeat.
- A coder that replies `ESCALATE` → log the reason and spawn the builder for that task on the same
  working tree with the coder's reply; from then on the builder is the task's **current
  implementer**.
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
spawn a fresh implementer of the same type with the same inputs and the instruction "rework").
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
- Fail → rework (step 3). At most 2 gate retries per round, then `needs-human` ("gate keeps
  failing").
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
review path. With `ui_review: browser` in `worktree` mode, start `dev_server` in `<path>`. It reads the
project playbook and the feature playbook's `## Done checklist` itself.
After the reviews, append their `## Rule proposals` to `rule-proposals.md`.
Agent types: `devflow:review-security`, `devflow:review-code`, `devflow:review-ux`, `devflow:review-ui`.

Read only the frontmatter `verdict` of each file:
- any `CHANGES` and `round <= max_rounds` → round + 1, state `build`, go to 3 (rework).
- any `CHANGES` and `round > max_rounds` → `needs-human` ("reviews still blocking after N rounds").
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
  message to the user), then, in `branch` mode only, `git switch <base_branch>`; a worktree stays
until the merge (cleanup). If open-pr fails, `needs-human` with the
  output.

### 6b. Rule proposals — still state `approve`
`rule-proposals.md` collects, in order, the `## Rule proposals` of spec-writer, implementers and
reviewers, one line each with author and round:

```markdown
- [ ] Patterns: New REST endpoint follows `src/api/orders/OrdersController.cs` — three endpoints already do — review-code r1
```

Drop duplicates and rules the project playbook already has (mark them `- [dup]`). Show the
remaining ones **one at a time** with AskUserQuestion: **Approve / Edit / Discard**. Mark each line
`[x]` approved (with the final text if edited) or `[-]` discarded. Add the approved rules to their
section of `factory/playbook.md` (Definition of Done items as `- [<owner>] <item>`, appended at the
end so existing `DoD-<n>` ids do not move). Only if at least one rule was approved, commit it on the
feature branch: `git add factory/playbook.md && git commit -m "docs(factory): update playbook"` with
the footer `Factory: <id>`. In `worktree` mode add the rules to `<path>/factory/playbook.md` and
commit in `<path>`; never edit `factory/playbook.md` in the main checkout, which other sessions
share. If a commit hook rejects it, `needs-human` with the output. The rules
reach the base branch with the PR. If the feature goes to `needs-human`, the file stays and its open lines are
shown when the feature is back in `approve`.

### needs-human
Update the board, leave the branch as it is, tell the user in 2-3 lines why and what to look at
(file paths), stop. The user fixes things and re-runs `/devflow:factory`, which resumes from the
board state (they can edit the state cell by hand to choose where to resume).
