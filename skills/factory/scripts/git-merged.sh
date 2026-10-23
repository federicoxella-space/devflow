#!/usr/bin/env bash
# Tells whether a local branch has been merged into origin/<base>, from git alone (forge `git`).
# Usage: git-merged.sh <branch> <base>   (the caller has already run `git fetch --prune`)
# Prints `merged` (merge commit, fast-forward or rebase), `squashed` (squash merge) or `open`.
# Exits 2 with nothing on stdout when origin/<base> is missing: no verdict, never a false merge.
# A squash merge whose conflicts were resolved differently from the branch is reported `open`:
# the user marks it `merged` on the board.
set -euo pipefail

branch=$1
upstream=origin/$2

if ! git rev-parse -q --verify "refs/remotes/$upstream" > /dev/null; then
  echo "git-merged: no $upstream (base branch not pushed or not fetched)" >&2
  exit 2
fi

if ! git rev-parse -q --verify "refs/heads/$branch" > /dev/null; then
  echo "git-merged: no local branch $branch" >&2
  echo open
  exit 0
fi

# Merge commit or fast-forward: the branch tip is in the base history.
if git merge-base --is-ancestor "$branch" "$upstream"; then
  echo merged
  exit 0
fi

# Rebase merge: every branch commit has an equivalent patch on the base.
commits=$(git cherry "$upstream" "$branch")
if ! grep -q '^+' <<< "$commits"; then
  echo merged
  exit 0
fi

# Squash merge: the whole branch as one commit has an equivalent patch on the base.
fork=$(git merge-base "$upstream" "$branch")
summary=$(git commit-tree "$branch^{tree}" -p "$fork" -m "git-merged: $branch")
summary_state=$(git cherry "$upstream" "$summary")
if grep -q '^-' <<< "$summary_state"; then
  echo squashed
else
  echo open
fi
