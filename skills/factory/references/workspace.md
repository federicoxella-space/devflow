# Workspace

## Local state in a worktree
If `<session>` ≠ `<main>`: the local features are the ids of the
rows of `<session>/factory/board.md` and the folders `<session>/factory/features/*`. If at least
one is neither in the board of `<main>` nor in the table of `<main>/factory/archive.md` (full id):
list ids and titles, explain the manual move
(copy the folder into `<main>/factory/features/`; if its id is already used, get the new NNN with
`board.sh "<main>" new <slug> <state> '<title>'` (it reserves the folder and adds the row and the
`created` log), copy the local folder's content into the created one and rename the branch, and copy
only the log lines into the board; with no conflict copy the row as before; then delete
`<session>/factory/board.md` and the copied folders) and stop without writing anything. Local
features already in the main board or archive do not block; suggest in one line to delete them.

## Workspace question
Workspace, before any other question; skip it if `## Workspace` already exists (resume).
`workspace` in config `branch` or `worktree` → no question; `ask` or absent → AskUserQuestion
**Branch / Worktree**, with the short context: a worktree lets other sessions work on other
features in parallel, at the cost of a separate folder and its setup. Write the value under
`## Workspace` in the feature playbook, before `## Interview` (also when the interview is
"No questions needed."). If the mode is `branch` and `<session>` ≠ `<main>`, also write the line
`checkout: <session>` right below it.

## Approve
- Approve, `branch` mode without `checkout:` → `git -C "<main>" switch "<base_branch>" && git -C
  "<main>" pull --ff-only && git -C "<main>" switch -c '<kind>/<id>'` (`feature/<id>` or
  `hotfix/<id>`), write the branch in the board. If `factory/backlog.md` has uncommitted changes,
  add `!factory/backlog.md` to `.gitignore` if missing, then
  `git -C "<main>" add factory/backlog.md .gitignore && git -C "<main>" commit -m "docs(factory):
  update backlog"` with the footer `Factory: <id>` (a hook rejection → `needs-human` with the
  output). Set state `build`, round `1`.
- Approve, `branch` mode with `checkout: <dir>` → update `base_branch` in `<main>` as in worktree
  step 1 below, then `git -C "<dir>" switch -c '<kind>/<id>' "<base_branch>"`, write the branch in
  the board, and move the feature's backlog lines into `<dir>` as in worktree step 5 (with `<dir>`
  for `<path>`); only that step applies to the backlog, no commit of `factory/backlog.md` in
  `<main>`. Set state `build`, round `1`.
- Approve, `worktree` mode:
  1. Update `base_branch` without switching branch in `<main>`: `git -C "<main>" pull --ff-only` if
     it is the current branch, else `git -C "<main>" fetch origin <base_branch>:<base_branch>`.
  2. `git -C "<main>" worktree add -b '<kind>/<id>' "<path>" <base_branch>`; the branch column is
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
