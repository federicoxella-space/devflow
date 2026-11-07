#!/usr/bin/env bash
# Tests for rules.sh on temporary bare remotes and clones.
# Run: bash skills/factory/scripts/test-rules.sh
set -u
src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
export GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: expected [$3] got [$2]"; fi; }

# new_repo <name>: bare remote + clone `main` with a playbook, pushed.
new_repo() {
  git init -q --bare -b main "$tmp/$1.git"
  git clone -q "$tmp/$1.git" "$tmp/$1" 2> /dev/null
  mkdir -p "$tmp/$1/factory"
  printf '%s\n' '# Project playbook' '' '## Conventions' '- c1' '' '## Definition of Done' '- [gate] d1' \
    > "$tmp/$1/factory/playbook.md"
  git -C "$tmp/$1" add -A
  git -C "$tmp/$1" commit -qm base
  git -C "$tmp/$1" push -q -u origin main 2> /dev/null
}
# add_rules <repo> <file> <content...>: commits and pushes a rule file.
add_rules() {
  local r=$1 f=$2
  shift 2
  mkdir -p "$tmp/$r/factory/rules"
  printf '%s\n' "$@" > "$tmp/$r/factory/rules/$f"
  git -C "$tmp/$r" add -A
  git -C "$tmp/$r" commit -qm "rules $f"
  git -C "$tmp/$r" push -q origin main 2> /dev/null
}
run() { out=$(bash "$src/rules.sh" "$@" 2> "$tmp/err"); code=$?; }

# AC1 merge
new_repo a
add_rules a b.md '# Rules b' '## Conventions' '- cb' '## Don'"'"'ts' '- nb'
add_rules a a.md '# Rules a' '## Conventions' '- ca1' '- ca2' '## Definition of Done' '- [code] da'
run "$tmp/a" main
eq "merge: exit" "$code" 0
eq "merge: output" "$out" "merged a b"
git -C "$tmp/a" fetch -q origin
exp=$(printf '%s\n' '# Project playbook' '' '## Conventions' '- c1' '- ca1' '- ca2' '- cb' '' \
  '## Definition of Done' '- [gate] d1' '- [code] da' "## Don't"'s' '- nb')
eq "merge: playbook" "$(git -C "$tmp/a" show origin/main:factory/playbook.md)" "$exp"
eq "merge: files removed" "$(git -C "$tmp/a" ls-tree -r --name-only origin/main | grep -c rules/)" 0
eq "merge: one commit" "$(git -C "$tmp/a" log --format=%s origin/main | grep -c 'merge feature rules')" 1
eq "merge: footers" "$(git -C "$tmp/a" log -1 --format=%B origin/main | grep -c '^Factory: ')" 2
eq "merge: local base updated" "$(git -C "$tmp/a" rev-parse main)" "$(git -C "$tmp/a" rev-parse origin/main)"
eq "merge: worktrees" "$(git -C "$tmp/a" worktree list | wc -l | tr -d ' ')" 1

# AC2 rerun and none
run "$tmp/a" main
eq "rerun: none" "$out" none
new_repo n
before=$(git -C "$tmp/n" rev-parse main)
run "$tmp/n" main
eq "none: output" "$out" none
eq "none: exit" "$code" 0
eq "none: no commit" "$(git -C "$tmp/n" rev-parse main)" "$before"

# AC3 push refused
new_repo p
add_rules p x.md '## Conventions' '- cx'
printf '%s\n' '#!/bin/sh' 'echo refused >&2' 'exit 1' > "$tmp/p.git/hooks/pre-receive"
chmod +x "$tmp/p.git/hooks/pre-receive"
remote_before=$(git -C "$tmp/p.git" rev-parse main)
run "$tmp/p" main
eq "refused: exit" "$code" 4
eq "refused: origin unchanged" "$(git -C "$tmp/p.git" rev-parse main)" "$remote_before"
eq "refused: worktrees" "$(git -C "$tmp/p" worktree list | wc -l | tr -d ' ')" 1
rm "$tmp/p.git/hooks/pre-receive"
run "$tmp/p" main
eq "refused: retry merges" "$out" "merged x"

# AC4 busy checkout
new_repo c
add_rules c y.md '## Conventions' '- cy'
git -C "$tmp/c" switch -q -c other
echo dirty >> "$tmp/c/factory/playbook.md"
sum_before=$(cat "$tmp/c/factory/playbook.md")
run "$tmp/c" main
eq "busy: output" "$out" "merged y"
eq "busy: working tree unchanged" "$(cat "$tmp/c/factory/playbook.md")" "$sum_before"
eq "busy: branch on other" "$(git -C "$tmp/c" symbolic-ref --short HEAD)" other
eq "busy: local base" "$(git -C "$tmp/c" rev-parse main)" "$(git -C "$tmp/c.git" rev-parse main)"

# AC5 CRLF, duplicates, invalid name
new_repo d
mkdir -p "$tmp/d/factory/rules"
printf '## Conventions \r\n- c1\r\n- cnew\r\n' > "$tmp/d/factory/rules/crlf.md"
printf '%s\n' '## Conventions' '- cnew' > "$tmp/d/factory/rules/zdup.md"
printf '%s\n' '## Conventions' '- bad' > "$tmp/d/factory/rules/bad name.md"
git -C "$tmp/d" add -A
git -C "$tmp/d" commit -qm rules
git -C "$tmp/d" push -q origin main 2> /dev/null
run "$tmp/d" main
eq "crlf: output" "$out" "merged crlf zdup"
eq "crlf: playbook" "$(git -C "$tmp/d" show origin/main:factory/playbook.md | grep -c -e '- cnew')" 1
eq "crlf: existing line not duplicated" "$(git -C "$tmp/d" show origin/main:factory/playbook.md | grep -c -e '- c1')" 1
eq "crlf: no new section" "$(git -C "$tmp/d" show origin/main:factory/playbook.md | grep -c '^## Conventions')" 1
eq "invalid name: kept" "$(git -C "$tmp/d" ls-tree --name-only origin/main factory/rules/ | wc -l | tr -d ' ')" 1
grep -q 'invalid name' "$tmp/err" && ok "invalid name: warning" || bad "invalid name: warning"

# AC6 invalid input
run "$tmp/a" 'a..b'
eq "invalid base: exit" "$code" 2
run "$tmp/none-here" main
eq "not a repo: exit" "$code" 2
mkdir "$tmp/plain"
run "$tmp/plain" main
eq "plain dir: exit" "$code" 2

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
