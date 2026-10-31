#!/usr/bin/env bash
# Tests for claude-version.sh.
# Run: bash .github/scripts/test-claude-version.sh
set -u
src=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$src/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
ok() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fails=$((fails + 1)); fi; }
run() { bash "$src/claude-version.sh" "$1" > "$tmp/out" 2> "$tmp/err"; }
msg() { grep -qF "Cannot read the Claude Code version from $1: expected \"// Written by Claude Code X.Y.Z.\" on line 1" "$tmp/err"; }

run "$root/.claude-plugin/types/claude-code/index.d.ts"
ok "committed types print 2.1.304" '[ $? -eq 0 ] && [ "$(cat "$tmp/out")" = 2.1.304 ]'

printf '// Written by Claude Code 10.20.30.\nrest\n' > "$tmp/a"
run "$tmp/a"
ok "multi-digit version" '[ $? -eq 0 ] && [ "$(cat "$tmp/out")" = 10.20.30 ]'

printf 'rest\n// Written by Claude Code 1.2.3.\n' > "$tmp/b"
run "$tmp/b"
ok "line 1 missing fails" '[ $? -eq 1 ] && msg "$tmp/b"'

printf '// Written by Claude Code.\n' > "$tmp/c"
run "$tmp/c"
ok "no version fails" '[ $? -eq 1 ] && msg "$tmp/c"'

printf '// Written by Claude Code 1.2.3\n' > "$tmp/d"
run "$tmp/d"
ok "missing final dot fails" '[ $? -eq 1 ] && msg "$tmp/d"'

run "$tmp/missing"
ok "missing file fails" '[ $? -eq 1 ] && msg "$tmp/missing"'

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
