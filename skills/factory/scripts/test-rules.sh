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
  git -C "$tmp/$r" add -- "factory/rules/$f"
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

# AC12 files that are not regular: symlink (120000) and executable (100755), written in the index
# so the test does not need filesystem symlinks.
# add_entry <repo> <mode> <path> <content>: stages a blob with the given mode.
add_entry() {
  local h
  h=$(printf '%s\n' "$4" | git -C "$tmp/$1" hash-object -w --stdin)
  git -C "$tmp/$1" update-index --add --cacheinfo "$2,$h,$3"
}
printf '%s\n' '## Conventions' '- SECRET' > "$tmp/secret.md"
new_repo s
add_entry s 120000 factory/rules/link.md "$tmp/secret.md"
add_entry s 100755 factory/rules/exec.md '## Conventions'$'\n''- EXECRULE'
git -C "$tmp/s" commit -qm 'non regular'
git -C "$tmp/s" push -q origin main 2> /dev/null
before=$(git -C "$tmp/s.git" rev-parse main)
run "$tmp/s" main
eq "non regular only: output" "$out" none
eq "non regular only: exit" "$code" 0
eq "non regular only: no commit" "$(git -C "$tmp/s.git" rev-parse main)" "$before"
eq "non regular only: worktrees" "$(git -C "$tmp/s" worktree list | wc -l | tr -d ' ')" 1
git -C "$tmp/s" pull -q --ff-only 2> /dev/null
add_rules s ok.md '# Rules ok' '## Conventions' '- cok'
run "$tmp/s" main
eq "non regular: exit" "$code" 0
eq "non regular: output" "$out" "merged ok"
eq "non regular: warnings" "$(grep -c 'not a regular file' "$tmp/err")" 2
grep -q 'link.md' "$tmp/err" && ok "non regular: symlink warned" || bad "non regular: symlink warned"
grep -q 'exec.md' "$tmp/err" && ok "non regular: executable warned" || bad "non regular: executable warned"
pb=$(git -C "$tmp/s.git" show main:factory/playbook.md)
case "$pb" in *SECRET* | *EXECRULE*) bad "non regular: content not merged" ;; *) ok "non regular: content not merged" ;; esac
eq "non regular: valid rule merged" "$(printf '%s\n' "$pb" | grep -c -e '- cok')" 1
eq "non regular: commit diff clean" "$(git -C "$tmp/s.git" show main | grep -c -e SECRET -e EXECRULE)" 0
eq "non regular: files kept" "$(git -C "$tmp/s.git" ls-tree --name-only main factory/rules/ | tr '\n' ' ')" \
  "factory/rules/exec.md factory/rules/link.md "
eq "non regular: footer" "$(git -C "$tmp/s.git" log -1 --format=%B main | grep '^Factory: ')" "Factory: ok"

# AC13 empty and missing playbook
# playbook_case <repo> <empty|missing>
playbook_case() {
  new_repo "$1"
  if [ "$2" = empty ]; then
    : > "$tmp/$1/factory/playbook.md"
    git -C "$tmp/$1" add -A
  else
    git -C "$tmp/$1" rm -q factory/playbook.md
  fi
  git -C "$tmp/$1" commit -qm "$2 playbook"
  git -C "$tmp/$1" push -q origin main 2> /dev/null
  add_rules "$1" e.md '# Rules e' 'stray line' '## Conventions' '- ce' '## Definition of Done' '- [code] de'
  run "$tmp/$1" main
  eq "$2 playbook: exit" "$code" 0
  eq "$2 playbook: output" "$out" "merged e"
  eq "$2 playbook: content" "$(git -C "$tmp/$1.git" show main:factory/playbook.md)" \
    "$(printf '%s\n' '## Conventions' '- ce' '## Definition of Done' '- [code] de')"
  eq "$2 playbook: file removed" "$(git -C "$tmp/$1.git" ls-tree -r --name-only main | grep -c rules/)" 0
}
playbook_case pe empty
playbook_case pm missing

# AC6 invalid input
run "$tmp/a" 'a..b'
eq "invalid base: exit" "$code" 2
run "$tmp/none-here" main
eq "not a repo: exit" "$code" 2
mkdir "$tmp/plain"
run "$tmp/plain" main
eq "plain dir: exit" "$code" 2

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
