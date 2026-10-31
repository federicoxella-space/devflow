#!/usr/bin/env bash
# Tests for check-pr-title.sh.
# Run: bash .github/scripts/test-check-pr-title.sh
set -u
src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
ok() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fails=$((fails + 1)); fi; }

for t in 'feat: x' 'fix(pane): x' 'feat!: x' 'refactor(spec)!: x' 'revert: x'; do
  bash "$src/check-pr-title.sh" "$t" > /dev/null 2>&1
  ok "accepts '$t'" '[ $? -eq 0 ]'
done

for t in 'fet: x' 'feat x' 'Feat: x' 'feat:' 'feat: ' 'feat(): x' 'wip: x'; do
  bash "$src/check-pr-title.sh" "$t" > /dev/null 2> "$tmp/err"
  rc=$?
  ok "rejects '$t'" '[ $rc -eq 1 ] && grep -qF "Invalid PR title: $t" "$tmp/err" && grep -qF "type(scope)!: subject" "$tmp/err" && grep -qF "revert" "$tmp/err"'
done

( cd "$tmp" && bash "$src/check-pr-title.sh" 'feat: $(touch pwned)' > /dev/null 2>&1 )
ok "accepts a title with \$(...) without running it" '[ ! -e "$tmp/pwned" ]'
( cd "$tmp" && bash "$src/check-pr-title.sh" 'wip $(touch pwned)' > /dev/null 2> "$tmp/err" )
ok "rejects and does not run \$(...)" '[ ! -e "$tmp/pwned" ] && grep -qF "wip \$(touch pwned)" "$tmp/err"'

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
