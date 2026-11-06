# Abandoning a feature

Entry: `/devflow:factory <id> abandon [<reason>]`. Step 2 of `SKILL.md` (pr-state and cleanup) has
already run: read the row of `<id>` again from `<main>/factory/board.md`; if it is not there, from
the table of `<main>/factory/archive.md` (an **archived** row). `<reason>` is the rest after
`abandon`, possibly empty. The remote branch is never deleted, so the PR can be reopened.

**0. Reason.** Before the plan compute the note reason from `<reason>`: `|` → `/`, line breaks and
every other control character → a space, spaces at the ends removed (`board.sh` refuses `|` and
control characters). Empty after this → no reason (note `abandoned`, no PR comment). The board note
uses the normalized reason; the PR comment uses the original text.

**1. State.** `merged` (archived or not) → say "feature already merged, nothing to abandon" and
stop. `closed` (archived or not) → only the cleanup (points 3 and 4), state unchanged; on an
archived row the `log` lines of point 6 go to the archive (`board.sh` does it by itself). Any other
state → the state becomes `closed`.

**2. PR.** The reference is the PR cell, if not empty.
- Forge `github`, `gitlab` or `azure`: a `pr-open` row uses the outcome of step 2; another row that
  is not `closed` and has a reference runs **pr-state** now. `OPEN` → to close; `CLOSED` → nothing;
  `MERGED` → stop: "PR already merged: set `merged` by hand, the next run cleans up"; `UNKNOWN` →
  stop with the reason.
- Forge `git` with a non-empty cell: **close-pr** gives only the manual message.

**3. Worktree.** Empty branch cell → no branch and no worktree for the feature: skip points 3 and 4
(no `fetch`). Folder = `<path>` (worktree mode) or the `<dir>` of the `checkout:` line. Remove
it only if it exists, is neither `<session>` nor `<main>`, is listed in `git -C "<main>" worktree
list --porcelain` with `branch refs/heads/<branch>`, and `git -C "<folder>" status --porcelain
--ignored` has no line other than `!! `. Otherwise it stays, with the reason. The `!! ` lines are
ignored files that `worktree remove` will delete: list them in the plan.

**4. Local branch** = the branch cell, if it exists (`git -C "<main>" rev-parse --verify --quiet
"refs/heads/<branch>"`). First `git -C "<main>" fetch --prune`, once; if it fails the branch is kept
("origin cannot be verified"). It is clean if `git -C "<main>" rev-list --count "<branch>" --not
"<base_branch>" --remotes=origin` prints `0`; otherwise it is kept, with the number of local-only
commits. If it is the branch of `<main>` (branch mode without `checkout:`): `<main>` clean
(`git -C "<main>" status --porcelain` empty) → `git -C "<main>" switch "<base_branch>"` before
deleting it; not clean → kept. Checked out in another worktree that stays → kept.

**5. Confirmation.** AskUserQuestion **Abandon / Cancel** (on `closed`: **Clean up / Cancel**) with
the plan of points 0-4: state change with the final note, PR to close (link, with or without
comment), worktree and branch to remove or keep with the reason, ignored files that will be deleted,
remote branch kept. For active rows add that another
session may be working on it and that the operation cannot be undone. On `closed` with nothing to
clean up → say so and stop without a question. Cancel → nothing changes.

**6. Execution**, in order:
- PR `OPEN`: with a reason write `features/<id>/abandon.md` (`Abandoned: <original reason>`, a blank line,
  `Factory: <id>`, in the language of `feature.md` except the footer) and run **close-pr**
  (reference, head = branch cell, comment file only with a reason). If the close fails → show the
  output to the user and stop, nothing changed.
- `set <id> state=closed note='abandoned'`, or `note='abandoned: <normalized reason>'` with every `'`
  of the reason written `'\''` only in the command (never in a stored file).
- Planned cleanup: `git -C "<main>" worktree remove "<folder>"` (never `--force`), the `switch` if
  planned, `git -C "<main>" branch -D "<branch>"` (`-D` is safe: point 4 checked that every commit
  is on origin or on the base branch). A failing command leaves that piece in place: one line to
  the user, go on. Log (`log <id> '<text>'`): "worktree and branch deleted", "worktree removed" or
  "branch deleted", according to what was removed.
- Row of the board (not archived): after the planned cleanup, `archive '<id>'`, whatever the
  cleanup left in place (see **Shared board** in `SKILL.md`).
- Summary of one or two lines: what was done, what was kept and why.

**7. Untouched:** the folder `factory/features/<id>/` (except `abandon.md`), `factory/backlog.md`,
the features deferred from this one, the originating issue, the mod.
