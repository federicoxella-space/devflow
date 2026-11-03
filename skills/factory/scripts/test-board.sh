#!/usr/bin/env bash
# Tests for board.sh on temporary main checkouts, with a stub git where a test needs one.
# Run: bash skills/factory/scripts/test-board.sh
set -u
src=$(cd "$(dirname "$0")" && pwd)
script=$src/board.sh
tmp=$(mktemp -d)
trap 'chmod -R u+w "$tmp" 2> /dev/null; rm -rf "$tmp"' EXIT
cd "$tmp" || exit 1
fails=0 leftover=0
export GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
unset BOARD_LOCK_WAIT BOARD_LOCK_STALE

check() { # check <description> <command...>
  local d=$1
  shift
  if "$@"; then echo "PASS  $d"; else echo "FAIL  $d"; fails=$((fails + 1)); fi
}
same() { [ "$1" = "$2" ] || { echo "      expected '$2', got '$1'"; false; }; }
has() { grep -qF -- "$2" "$1"; }
count() { grep -cF -- "$2" "$1"; }
ts_line() { grep -qE '^- [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} · ' <<< "$1"; }

# run <main> <args...>: sets out, err, code. Afterwards no temp board file may exist and, unless
# foreign=1 (the test planted another session's lock), no lock either.
foreign=0
run() {
  local d=$1 f
  shift
  out=$(bash "$script" "$d" "$@" 2> "$tmp/err")
  code=$?
  err=$(cat "$tmp/err")
  for f in "$d"/factory/board.md.tmp.*; do
    if [ -e "$f" ]; then echo "      left $f"; leftover=$((leftover + 1)); rm -f "$f"; fi
  done
  if [ "$foreign" = 0 ] && [ -e "$d/factory/board.lock" ]; then
    echo "      left $d/factory/board.lock"
    leftover=$((leftover + 1))
    rm -rf "$d/factory/board.lock"
  fi
}

# mkmain <dir>: git repo with a board holding 001-alpha (build), 002-beta (spec), 003-short (a row
# with three cells), and a log line.
mkmain() {
  mkdir -p "$1/factory/features"
  git init -q "$1"
  git -C "$1" commit -q --allow-empty -m init
  {
    printf '# Factory board\n\n'
    printf '| id | feature | state | round | branch | PR |\n'
    printf '|----|---------|-------|-------|--------|----|\n'
    printf '| 001-alpha | Alpha | build | 1 | feature/001-alpha | |\n'
    printf '| 002-beta | Beta | spec | | | |\n'
    printf '| 003-short | Short | queued |\n'
    printf '\n## Log\n- 2026-01-01 10:00 · 001-alpha · created → interview\n'
  } > "$1/factory/board.md"
}

# Stub git: optionally creates a folder or rewrites the lock owner, then runs the real git.
real_git=$(command -v git)
mkdir -p "$tmp/stub"
cat > "$tmp/stub/git" << 'EOF'
#!/usr/bin/env bash
if [ -n "${STUB_MKDIR:-}" ]; then mkdir -p "$STUB_MKDIR"; fi
if [ -n "${STUB_OWNER:-}" ]; then printf '%s\n' "$STUB_OWNER" > "$STUB_OWNER_FILE"; fi
exec "$REAL_GIT" "$@"
EOF
chmod +x "$tmp/stub/git"

# --- AC2: next id from every source ---------------------------------------------------------------
m=$tmp/n-board; mkmain "$m"
run "$m" new gamma interview 'Gamma'
check "new: highest board id + 1" same "$code $out" "0 004-gamma"

m=$tmp/n-feat; mkmain "$m"; mkdir "$m/factory/features/007-old"
run "$m" new gamma interview 'Gamma'
check "new: highest features/ folder + 1" same "$out" "008-gamma"

m=$tmp/n-local; mkmain "$m"; git -C "$m" branch -q feature/011-local
run "$m" new gamma interview 'Gamma'
check "new: highest local branch */NNN-* + 1" same "$out" "012-gamma"

m=$tmp/n-remote; mkmain "$m"; git -C "$m" update-ref refs/remotes/origin/hotfix/020-remote HEAD
run "$m" new gamma interview 'Gamma'
check "new: highest remote branch */NNN-* + 1" same "$out" "021-gamma"

m=$tmp/n-wt; mkmain "$m"; git -C "$m" worktree add -q "$tmp/wts/030-tree" 2> /dev/null
run "$m" new gamma interview 'Gamma'
check "new: highest worktree basename NNN-* + 1" same "$out" "031-gamma"

m=$tmp/n-octal; mkmain "$m"; mkdir "$m/factory/features/008-eight" "$m/factory/features/009-nine"
run "$m" new gamma interview 'Gamma'
check "new: 008/009 read in base 10, 009 -> 010" same "$code $out" "0 010-gamma"

m=$tmp/n-taken; mkmain "$m"
STUB_MKDIR=$m/factory/features/004-gamma REAL_GIT=$real_git PATH="$tmp/stub:$PATH" \
  run "$m" new gamma interview 'Gamma'
check "new: folder of the computed id already there -> NNN + 1" same "$code $out" "0 005-gamma"

m=$tmp/n-nofeat; mkmain "$m"; rmdir "$m/factory/features"
run "$m" new gamma interview 'Gamma'
check "new: creates factory/features/ when missing" test -d "$m/factory/features/004-gamma"

# --- new writes folder, row and log -----------------------------------------------------------------
m=$tmp/new; mkmain "$m"; cp "$m/factory/board.md" "$tmp/before"
run "$m" new delta queued 'Delta export' '(deferred from 001-alpha)'
check "new: folder created" test -d "$m/factory/features/004-delta"
{ sed -n '1,7p' "$tmp/before"; printf '| 004-delta | Delta export | queued | | | |\n'; sed -n '8,$p' "$tmp/before"; } > "$tmp/expected"
sed '$d' "$m/factory/board.md" > "$tmp/actual"
check "new: row after the last row, rest of the file unchanged" cmp -s "$tmp/actual" "$tmp/expected"
last=$(tail -n 1 "$m/factory/board.md")
check "new: log line with time, transition and note" same "${last#- ????-??-?? ??:?? · }" "004-delta · created → queued (deferred from 001-alpha)"
check "new: log line time format" ts_line "$last"

# --- AC3: set and log -------------------------------------------------------------------------------
m=$tmp/set; mkmain "$m"; cp "$m/factory/board.md" "$tmp/before"
run "$m" set 002-beta state=build round=1 branch=feature/002-beta pr=https://x/pull/2 note='· change 2'
check "set: exit 0" same "$code" "0"
{ sed -n '1,5p' "$tmp/before"; printf '| 002-beta | Beta | build | 1 | feature/002-beta | https://x/pull/2 |\n'; sed -n '7,$p' "$tmp/before"; } > "$tmp/expected"
sed '$d' "$m/factory/board.md" > "$tmp/actual"
check "set: only the given cells change, rest byte for byte" cmp -s "$tmp/actual" "$tmp/expected"
last=$(tail -n 1 "$m/factory/board.md")
check "set: state change logged with note" same "${last#- ????-??-?? ??:?? · }" "002-beta · spec → build · change 2"
check "set: log line time format" ts_line "$last"

cp "$m/factory/board.md" "$tmp/before"
run "$m" set 002-beta state=build
check "set: same state -> no log, board unchanged" cmp -s "$m/factory/board.md" "$tmp/before"

run "$m" set 002-beta feature='Beta two'
check "set: no state= -> no log" same "$(wc -l < "$m/factory/board.md")" "$(wc -l < "$tmp/before")"
check "set: feature cell" has "$m/factory/board.md" '| 002-beta | Beta two | build | 1 | feature/002-beta | https://x/pull/2 |'

run "$m" set 003-short round=2
check "set: short row completed to six cells" has "$m/factory/board.md" '| 003-short | Short | queued | 2 | | |'

cp "$m/factory/board.md" "$tmp/before"
run "$m" log 001-alpha 'gate: PASS'
sed '$d' "$m/factory/board.md" > "$tmp/actual"
check "log: rest of the file unchanged" cmp -s "$tmp/actual" "$tmp/before"
last=$(tail -n 1 "$m/factory/board.md")
check "log: free text line" same "${last#- ????-??-?? ??:?? · }" "001-alpha · gate: PASS"
check "log: time format" ts_line "$last"

m=$tmp/nolog; mkmain "$m"
sed '/^## Log/,$d' "$m/factory/board.md" > "$tmp/b" && sed '$d' "$tmp/b" > "$m/factory/board.md"
run "$m" log 001-alpha 'hello'
check "log: creates ## Log at the end when missing" same "$(tail -n 3 "$m/factory/board.md" | sed '$d')" "$(printf '\n## Log')"

# --- AC7: invalid input -------------------------------------------------------------------------------
m=$tmp/bad; mkmain "$m"; cp "$m/factory/board.md" "$tmp/before"
invalid() { # invalid <description> <args...>
  local d=$1
  shift
  run "$m" "$@"
  if [ "$code" = 2 ] && [ -n "$err" ] && cmp -s "$m/factory/board.md" "$tmp/before" \
    && [ -z "$(ls "$m/factory/features")" ]; then
    echo "PASS  invalid: $d"
  else
    echo "FAIL  invalid: $d (exit $code, stderr '$err')"
    fails=$((fails + 1))
  fi
}
mkdir -p "$tmp/empty"
run "$tmp/empty" log 001-alpha x
check "invalid: board missing -> exit 2" same "$code" "2"
check "invalid: board missing -> nothing created" same "$(ls -A "$tmp/empty")" ""
invalid "unknown command" frob 001-alpha
invalid "no command" ''
invalid "unknown key" set 001-alpha color=red
invalid "argument without =" set 001-alpha state
invalid "set without pairs" set 001-alpha
invalid "slug with uppercase" new Bad-slug interview 'T'
invalid "slug with double dash" new a--b interview 'T'
invalid "slug with leading dash" new -a interview 'T'
invalid "slug with space" new 'a b' interview 'T'
invalid "unknown state (new)" new ok done 'T'
invalid "unknown state (set)" set 001-alpha state=done
invalid "state with a space" set 001-alpha 'state=spec review'
invalid "round not an integer" set 001-alpha round=x
invalid "round decimal" set 001-alpha round=1.5
invalid "id missing (set)" set 999-none state=build
invalid "id missing (log)" log 999-none 'x'
invalid "note= without state=" set 001-alpha note=x
invalid "title with |" new ok interview 'a|b'
invalid "branch with |" set 001-alpha 'branch=a|b'
invalid "log text with |" log 001-alpha 'a|b'
invalid "title with a line break" new ok interview "$(printf 'a\nb')"
invalid "note with a line break" set 001-alpha state=spec "note=$(printf 'a\nb')"
invalid "title with a tab" new ok interview "$(printf 'a\tb')"
invalid "log text with a control character" log 001-alpha "$(printf 'a\001b')"
invalid "empty title" new ok interview ''
invalid "missing title" new ok interview
invalid "too many arguments" new ok interview 'T' 'n' extra

run "$m" new lit interview 'T $(touch pwned) `touch pwned2` $HOME'
check "title with \$(...) and backticks written literally" has "$m/factory/board.md" '| 004-lit | T $(touch pwned) `touch pwned2` $HOME | interview | | | |'
check "title never evaluated" test ! -e "$tmp/pwned" -a ! -e "$tmp/pwned2" -a ! -e "$m/pwned"

# --- AC5: lock held by another session ----------------------------------------------------------------
m=$tmp/held; mkmain "$m"; cp "$m/factory/board.md" "$tmp/before"
mkdir "$m/factory/board.lock"
owner="$(date +%s) 99999 4242"
printf '%s\n' "$owner" > "$m/factory/board.lock/owner"
lock_abs=$(cd "$m/factory" && { pwd -W 2> /dev/null || pwd; })/board.lock
foreign=1
start=$SECONDS
BOARD_LOCK_WAIT=1 run "$m" set 002-beta state=build
elapsed=$((SECONDS - start))
check "locked: exit 1" same "$code" "1"
check "locked: waits BOARD_LOCK_WAIT before giving up" test "$elapsed" -ge 1
check "locked: stderr names the absolute lock path" same "$err" "board.sh: board locked by another session: $lock_abs"
check "locked: board unchanged" cmp -s "$m/factory/board.md" "$tmp/before"
check "locked: other session's lock kept" same "$(cat "$m/factory/board.lock/owner")" "$owner"
foreign=0

# --- AC6: abandoned locks -----------------------------------------------------------------------------
m=$tmp/stale; mkmain "$m"
mkdir "$m/factory/board.lock"
printf '%s\n' "$(($(date +%s) - 31)) 99999 4242" > "$m/factory/board.lock/owner"
run "$m" set 002-beta state=build
check "stale owner (now - 31) removed, write done" same "$code $(grep -c '^| 002-beta | Beta | build |' "$m/factory/board.md")" "0 1"

mkdir "$m/factory/board.lock"
printf '%s\n' "$(($(date +%s) - 5)) 99999 4242" > "$m/factory/board.lock/owner"
BOARD_LOCK_STALE=2 run "$m" set 002-beta state=review
check "BOARD_LOCK_STALE respected" same "$code" "0"

mkdir "$m/factory/board.lock"
start=$SECONDS
run "$m" set 002-beta state=approve
elapsed=$((SECONDS - start))
check "lock without owner removed after 2 s, write done" same "$code $(grep -c '^| 002-beta | Beta | approve |' "$m/factory/board.md")" "0 1"
check "lock without owner kept for at least 2 s" test "$elapsed" -ge 2

# --- AC8: factory/ not writable -----------------------------------------------------------------------
m=$tmp/ro; mkmain "$m"
chmod a-w "$m/factory"
if mkdir "$m/factory/probe" 2> /dev/null; then
  rmdir "$m/factory/probe"
  echo "SKIP  read-only factory/: writes still succeed here (root or Windows)"
else
  start=$SECONDS
  BOARD_LOCK_WAIT=5 run "$m" set 002-beta state=build
  elapsed=$((SECONDS - start))
  check "read-only factory/: exit 3" same "$code" "3"
  check "read-only factory/: no wait" test "$elapsed" -lt 5
fi
chmod u+w "$m/factory"

# Same path on every system: mkdir of the lock fails and no lock directory exists.
m=$tmp/lockfile; mkmain "$m"; cp "$m/factory/board.md" "$tmp/before"
printf 'x\n' > "$m/factory/board.lock"
foreign=1
start=$SECONDS
BOARD_LOCK_WAIT=5 run "$m" set 002-beta state=build
elapsed=$((SECONDS - start))
check "lock cannot be created: exit 3 at once" same "$code $((elapsed < 5))" "3 1"
check "lock cannot be created: board unchanged" cmp -s "$m/factory/board.md" "$tmp/before"
foreign=0

# --- AC9: release keeps a lock that another process took over ------------------------------------------
m=$tmp/taken-over; mkmain "$m"
foreign=1
STUB_OWNER='1 2 other' STUB_OWNER_FILE=$m/factory/board.lock/owner REAL_GIT=$real_git PATH="$tmp/stub:$PATH" \
  run "$m" new gamma interview 'Gamma'
check "taken-over lock: write done" same "$code $out" "0 004-gamma"
check "taken-over lock: not removed on release" same "$(cat "$m/factory/board.lock/owner" 2> /dev/null)" "1 2 other"
rm -rf "$m/factory/board.lock"
foreign=0

# --- AC1: 8 parallel new ------------------------------------------------------------------------------
m=$tmp/par-new; mkmain "$m"
for i in 1 2 3 4 5 6 7 8; do
  BOARD_LOCK_WAIT=120 bash "$script" "$m" new "feat-$i" interview "Feature $i" > "$tmp/new-$i.out" 2> "$tmp/new-$i.err" &
done
wait
ids=$(cat "$tmp"/new-*.out | sort)
check "parallel new: 8 ids printed" same "$(printf '%s\n' "$ids" | grep -c .)" "8"
check "parallel new: ids distinct" same "$(printf '%s\n' "$ids" | sed 's/-.*//' | sort -u | grep -c .)" "8"
ok=1
for id in $ids; do
  [ -d "$m/factory/features/$id" ] || { echo "      no folder $id"; ok=0; }
  [ "$(count "$m/factory/board.md" "| $id | Feature ")" = 1 ] || { echo "      no row $id"; ok=0; }
  [ "$(count "$m/factory/board.md" " · $id · created → interview")" = 1 ] || { echo "      no log $id"; ok=0; }
done
check "parallel new: every id has its folder, row and log" same "$ok" "1"
check "parallel new: no errors" same "$(cat "$tmp"/new-*.err)" ""
check "parallel new: no lock or temp file left" test ! -e "$m/factory/board.lock"
for f in "$m"/factory/board.md.tmp.*; do [ -e "$f" ] && { echo "      left $f"; leftover=$((leftover + 1)); }; done

# --- AC4: 8 parallel set and log on different rows ----------------------------------------------------
m=$tmp/par-set; mkmain "$m"
for i in 1 2 3 4 5 6 7 8; do printf '| 01%s-row | Row %s | spec | | | |\n' "$i" "$i"; done > "$tmp/rows"
awk -v rows="$tmp/rows" '{ print } /^\| 003-short/ { while ((getline l < rows) > 0) print l }' "$m/factory/board.md" > "$tmp/b"
cp "$tmp/b" "$m/factory/board.md"
for i in 1 2 3 4 5 6 7 8; do
  BOARD_LOCK_WAIT=120 bash "$script" "$m" set "01$i-row" state=build "round=$i" > /dev/null 2> "$tmp/set-$i.err" &
  BOARD_LOCK_WAIT=120 bash "$script" "$m" log "01$i-row" "note $i" > /dev/null 2> "$tmp/log-$i.err" &
done
wait
ok=1
for i in 1 2 3 4 5 6 7 8; do
  [ "$(count "$m/factory/board.md" "| 01$i-row | Row $i | build | $i | | |")" = 1 ] || { echo "      row 01$i-row lost"; ok=0; }
  [ "$(count "$m/factory/board.md" " · 01$i-row · spec → build")" = 1 ] || { echo "      state log 01$i-row lost"; ok=0; }
  [ "$(count "$m/factory/board.md" " · 01$i-row · note $i")" = 1 ] || { echo "      log 01$i-row lost"; ok=0; }
done
check "parallel set/log: every row and log line kept" same "$ok" "1"
check "parallel set/log: no errors" same "$(cat "$tmp"/set-*.err "$tmp"/log-*.err)" ""
check "parallel set/log: no lock left" test ! -e "$m/factory/board.lock"
for f in "$m"/factory/board.md.tmp.*; do [ -e "$f" ] && { echo "      left $f"; leftover=$((leftover + 1)); }; done

# --- AC9 and AC10 -------------------------------------------------------------------------------------
check "no own lock or temp board file left after any run" same "$leftover" "0"
gnu_only='stat -''c|date -''d|sed -''i|mv -''T|flo''ck'
check "no GNU-only options or lock tool in board.sh and test-board.sh" \
  test -z "$(grep -nE "$gnu_only" "$script" "$src/test-board.sh")"

[ "$fails" -eq 0 ] || { echo "$fails failed"; exit 1; }
echo "all passed"
