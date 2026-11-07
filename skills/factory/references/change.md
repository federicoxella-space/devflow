# Changing a feature with an open PR

## Changing a feature with an open PR
Entry: `/devflow:factory <id> <text>` or `<id>` alone, on a row in state `pr-open`. Step 2 has
already run pr-state for it. If the first word of `<text>` is `abandon` (case-insensitive), this
is not a change: read `references/abandon.md` instead and stop here.
- `MERGED` or `CLOSED` → explain that the feature can no longer be changed, suggest
  `/devflow:factory <text>` to open a new feature with the same text, stop without changing anything.
  For `CLOSED` add how to resume it (step 2 has moved it to `factory/archive.md`): move its row and
  its log lines from the archive back to the table and the log of the board by hand, set the state
  (e.g. `approve`) and reopen the PR.
- `UNKNOWN` → say the PR state cannot be verified and why, stop.
- `OPEN`, `<id>` alone → show the state and the PR link, ask in plain text which change to make; an
  empty answer → stop without changing anything.
- `OPEN`, with text → start the change.
- `<id> <text>` on an active row: state `interview` → append `**Note.** <text>` to `## Interview`
  and resume; any other active state, `queued` or `needs-human` → tell the user the text is
  ignored and resume as usual. On `merged`/`closed` rows: as above. An id found only in the table
  of `factory/archive.md` (step 3 of `SKILL.md`), alone or with text, is a `merged` or `closed` row:
  the `MERGED`/`CLOSED` message above, with the resume steps for `closed`; pr-state is not run.

**Start of a change.**
1. In `branch` mode `git -C "<dir>" status --porcelain` must be empty; otherwise say so and stop, registering
   nothing.
2. `n` = number of lines in the feature playbook's `## Changes` + 1. Append to `## Changes` (create
   it after `## Deferred` if missing) `- Change <n> — <text> — from round <board round + 1> — in
   progress`, and to `## Interview` the line `**Change <n>.** <text>`. Set state `interview`, log
   `pr-open → interview · change <n>`. Append `- run <n> · limit <L>` under `## Budget` in `usage.md`
   (`<L>` = `budget_tokens` or `none`; format in `references/usage.md`).
3. Align the branch: `branch` mode → `git -C "<dir>" switch '<branch>'` (if the local branch is
   missing: `git -C "<dir>" switch -c '<branch>' --track 'origin/<branch>'`; `<branch>` from the
   board cell, each `'` in it written `'\''` only in the command), then `git -C "<dir>" pull
   --ff-only`; `worktree` mode → `git -C "<path>" pull --ff-only`. A missing
   `<dir>` or `<path>` → `needs-human`. Any error →
   `needs-human` with the output; the user fixes it and sets the state back to `interview`. The base
   branch is not merged in.

The interview of a change follows step 0 of `SKILL.md` limited to the change, without the workspace question;
questions continue the `Q<n>` numbering under the `**Change <n>.**` line, and it can end with
"No questions needed."; Deferring logic is unchanged. A change `in progress` found at resume is
the one with the highest `<n>` in that state.

## Spec
For a change `<n>`, first copy `spec.md` to `spec-c<n>.md` and the `## Done checklist` section to
`checklist-c<n>.md` (feature dir), and pass also `change: <n>`. The spec-writer rewrites `## Tasks`
always, the rest of the spec and the checklist only if the behaviour changes. If the spec outside
`## Tasks` or the checklist differ from the snapshots → state `spec-review`; otherwise go straight
to `build` with round = board round + 1 and log `spec → build · change <n> spec unchanged`.
In a change, the comparison with the snapshots (above) and the jump to `build` happen only after a
`PASS`; with `GAPS` left over the state is `spec-review`.

## Human approval
- Reject on a change → restore `spec.md` and the checklist from `spec-c<n>.md` and
  `checklist-c<n>.md`, mark the change `rejected` in `## Changes`, state `pr-open`, log
  `spec-review → pr-open · change <n> rejected`, in `branch` mode without `checkout:`
  `git -C "<main>" switch "<base_branch>"` (with `checkout:` `<dir>` stays on the branch); the PR
  is not touched.
- Approve on a change → state `build`, round = board round + 1; no new branch or worktree (skip
  `## Approve` in `references/workspace.md`).

## Approval
**With a change `in progress`** (also on resume in `approve`) use **update-pr** instead of
open-pr. Rewrite `pr.md` as above (footer with the total number of rounds, `Tokens:` line with the new
totals); if the spec has
`pr_title`, the title is that `pr_title` when it differs from the one in `spec-c<n>.md` (absent
there counts as different), else the first line of the existing `pr.md`. Without `pr_title`: the
first line of the existing `pr.md`, unless `title` or `kind` of the spec differ from `spec-c<n>.md`,
then rebuild it with the fallback rule above. The rewritten body follows the `BREAKING CHANGE` rule
of step 6 (the line is dropped if `breaking` was removed). The title goes to update-pr in single
quotes, as step 6 says. The branch stays the one in the
board even if `kind` changed. Write `change-<n>.md` in the language of `feature.md`: `Change <n>:
<text>`, whether the spec was updated (yes/no), the commits of the change's rounds (from
`gate-r<N>.md`), footer `Factory: <id>`. Call update-pr (reference from the PR column, head =
branch column, title, body file `pr.md`, comment file `change-<n>.md`). Push or title/body failure
→ `needs-human` with the output; comment failure → one line to the user, go on. Then mark the
change `approved`, state `pr-open`, PR column unchanged, and in `branch` mode without `checkout:`
`git -C "<main>" switch "<base_branch>"`. With forge `git`, pass on update-pr's message to the user.
