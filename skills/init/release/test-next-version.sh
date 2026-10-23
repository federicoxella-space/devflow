#!/usr/bin/env bash
# Tests for next-version.sh. Run: bash .github/scripts/test-next-version.sh
set -u
dir=$(cd "$(dirname "$0")" && pwd)
body=$(mktemp)
trap 'rm -f "$body"' EXIT
fails=0

# check <expected> <title> <body> <current> <last_tag>
check() {
  printf '%s' "$3" > "$body"
  local got
  got=$(bash "$dir/next-version.sh" "$2" "$body" "$4" "$5" 2>&1)
  if [ "$got" = "$1" ]; then
    echo "PASS  $1 <- '$2' ($4, tag '$5')"
  else
    echo "FAIL  expected $1, got '$got' <- '$2' ($4, tag '$5')"
    fails=$((fails + 1))
  fi
}

check 0.7.0 'feat(factory): x' ''                    0.6.0 0.6.0
check 0.6.1 'fix: x'           ''                    0.6.0 0.6.0
check 0.6.1 'docs: x'          ''                    0.6.0 0.6.0
check 0.6.1 'Update README'    ''                    0.6.0 0.6.0
check 0.7.0 'feat(factory)!: x' ''                   0.6.0 0.6.0
check 0.7.0 'fix: x'           $'y\nBREAKING CHANGE: y' 0.6.0 0.6.0
check 2.0.0 'refactor!: x'     ''                    1.4.2 1.4.2
check 1.5.0 'feat: x'          ''                    1.4.2 1.4.2
check 0.8.0 'fix: x'           ''                    0.8.0 0.6.0
check 0.6.0 'fix: x'           ''                    0.6.0 ''

[ "$fails" -eq 0 ] || { echo "$fails failed"; exit 1; }
echo "all passed"
