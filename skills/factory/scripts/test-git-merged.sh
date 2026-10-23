#!/usr/bin/env bash
# Tests for git-merged.sh on a temporary bare remote and clone.
# Run: bash skills/factory/scripts/test-git-merged.sh
set -u
src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
export GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

git init -q --bare -b main "$tmp/remote.git"
git clone -q "$tmp/remote.git" "$tmp/c" 2>/dev/null
cd "$tmp/c"
q() { "$@" > /dev/null 2>&1; }
put() { echo "$2" > "$1"; git add "$1"; git commit -qm "$1: $2"; }
branch() { git switch -q main; git switch -q -c "$1"; }
push_main() { git switch -q main; git push -q origin main; }

put a.txt base; git push -q -u origin main

branch f-merge; put m1.txt 1; put m2.txt 2
git switch -q main; git merge -q --no-ff -m "merge f-merge" f-merge; push_main

branch f-ff; put ff.txt 1
git switch -q main; git merge -q --ff-only f-ff; push_main

branch f-rebase; put r1.txt 1; put r2.txt 2
git switch -q main; put other.txt 1; push_main
git switch -q -c tmp-rebase f-rebase; q git rebase main
git switch -q main; git merge -q --ff-only tmp-rebase; git branch -q -D tmp-rebase; push_main

branch f-squash; put s1.txt 1; put s2.txt 2
git switch -q main; q git merge --squash f-squash; git commit -qm "squash f-squash"; push_main

branch f-squash-later; put sl1.txt 1; put sl2.txt 2
git switch -q main; q git merge --squash f-squash-later; git commit -qm "squash f-squash-later"
put later.txt 1; push_main

branch f-conflict; put a.txt branch
git switch -q main; put a.txt main
q git merge --squash f-conflict; echo resolved > a.txt; git add a.txt; git commit -qm "squash f-conflict"; push_main

branch f-open; put o.txt 1; git switch -q main

git fetch -q --prune

check() { # check <expected> <branch>
  local got
  got=$(bash "$src/git-merged.sh" "$2" main 2> "$tmp/err")
  if [ "$got" = "$1" ]; then echo "PASS  $2 -> $1"; else echo "FAIL  $2: expected $1, got '$got'"; fails=$((fails + 1)); fi
}

check merged   f-merge
check merged   f-ff
check merged   f-rebase
check squashed f-squash
check squashed f-squash-later
check open     f-conflict
check open     f-open
check open     missing
if [ -s "$tmp/err" ]; then echo "PASS  missing -> message on stderr"; else echo "FAIL  missing: no message on stderr"; fails=$((fails + 1)); fi

# base not on origin: must not claim a merge
got=$(bash "$src/git-merged.sh" f-open nope 2> "$tmp/err"); code=$?
if [ $code -ne 0 ] && [ -z "$got" ] && [ -s "$tmp/err" ]; then echo "PASS  missing origin/<base> -> error, no verdict"
else echo "FAIL  missing origin/<base>: exit $code, got '$got'"; fails=$((fails + 1)); fi

# commit signing configured with a failing signer: squash detection still works
git config commit.gpgSign true; git config gpg.program false
check squashed f-squash
git config --unset commit.gpgSign; git config --unset gpg.program

[ "$fails" -eq 0 ] || { echo "$fails failed"; exit 1; }
echo "all passed"
