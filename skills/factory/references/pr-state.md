# PR state and cleanup

If there are `pr-open` rows, `git -C "<main>" fetch --prune`
once, then run **pr-state** for each (PR reference from the PR column, branch from the branch column):
- `MERGED` → state `merged`. If the board write fails, say so in one line and go on with the
  cleanup of the rows pr-state returned `MERGED` in this run.
- `CLOSED` → state `closed`; keep the branch. Point 3 below archives it. Tell the user in one line:
  to resume it, move its row and its log lines from `factory/archive.md` back to the table and the
  log of `factory/board.md` by hand, set the state (e.g. `approve`) and reopen the PR; otherwise
  they can delete the branch.
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
3. **Archive.** Re-read the board. The ids to archive are every `closed` row and every `merged` row
   whose local branch no longer exists: empty branch cell, or `git -C "<main>" rev-parse --verify
   --quiet "refs/heads/<branch>"` fails. A `merged` row whose branch or worktree is left (cleanup
   failed or skipped) stays in the board and is retried on the next run. If there is at least one
   id, or a log line whose id has no row in the board, run `archive '<id>' ...` (see **Shared
   board** in `SKILL.md`; no ids → `archive` alone, for the orphan log lines). A non-zero exit is
   handled as any other board write.
