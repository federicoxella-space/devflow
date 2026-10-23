# Forge: git

Git only, for any platform devflow does not support: the factory pushes the branch and the user
opens the pull request by hand. A remote `origin` is required. The board's PR column holds `-`;
the branch column identifies the PR.

## auth
`git ls-remote --heads origin > /dev/null` succeeds. Fails → tell the user to check the `origin`
remote and their git credentials.

## open-pr
```
git push -u origin <head>
```
Reference = `-`. Tell the user: "Branch `<head>` pushed: open the pull request into `<base>` on your
platform."

## pr-state
After `git fetch --prune`: `bash <this skill's base directory>/scripts/git-merged.sh <branch> <base>`
(branch from the board's branch column) → `merged` or `squashed` → `MERGED`, `open` → `OPEN`.
Never `CLOSED`: a pull request closed without merge, or a squash merge with resolved conflicts,
stays `pr-open` until the user sets the state by hand.

## issues-enabled
Always `false`: deferred logic goes to the local queue in `factory/backlog.md`.

## create-issue
Not available (never called: `issues-enabled` is `false`).
