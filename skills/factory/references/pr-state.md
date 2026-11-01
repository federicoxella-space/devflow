# PR state and cleanup

If there are `pr-open` rows, `git -C "<main>" fetch --prune`
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
