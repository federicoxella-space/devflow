#!/usr/bin/env bash
# Writes the shared factory board under a lock: reserves feature ids, changes row cells, appends log
# lines. Every write takes <main>/factory/board.lock, rereads the board and replaces it atomically.
# Usage:
#   board.sh <main> new <slug> <state> <title> [<note>]   prints the created id
#   board.sh <main> set <id> <key>=<value>...             keys: state round branch pr feature note
#   board.sh <main> log <id> <text>
# Exit: 0 ok, 1 board locked by another session, 2 invalid input, 3 I/O error.
# Env: BOARD_LOCK_WAIT (seconds to wait for the lock, default 10), BOARD_LOCK_STALE (seconds after
# which a lock is abandoned, default 30). Portable to Linux, macOS (bash 3.2) and Git Bash: no
# GNU-only options, no external lock tool. Values are written with printf '%s', never evaluated.
set -euo pipefail
export LC_ALL=C

STATES=" queued interview spec spec-review build review approve pr-open merged needs-human closed "
SLUG_RE='^[a-z0-9]+(-[a-z0-9]+)*$'
INT_RE='^[0-9]+$'
NUM_RE='^([0-9]+)-'

die() { local code=$1; shift; printf 'board.sh: %s\n' "$*" >&2; exit "$code"; }

check_value() { # check_value <name> <value>
  case $2 in
    *'|'*) die 2 "$1 contains '|'" ;;
    *[[:cntrl:]]*) die 2 "$1 contains a line break or a control character" ;;
  esac
  return 0
}

check_state() {
  local s
  for s in $STATES; do [ "$1" = "$s" ] && return 0; done
  die 2 "unknown state: $1"
}

[ $# -ge 2 ] || die 2 "usage: board.sh <main> new|set|log ..."
main=$1 cmd=$2
shift 2
case $cmd in new|set|log) ;; *) die 2 "unknown command: $cmd" ;; esac

fdir=$main/factory
board=$fdir/board.md
lock=$fdir/board.lock
tmp=$fdir/board.md.tmp.$$
[ -f "$board" ] || die 2 "no board: $board"

wait_s=${BOARD_LOCK_WAIT:-10}
stale_s=${BOARD_LOCK_STALE:-30}
[[ $wait_s =~ $INT_RE ]] || die 2 "BOARD_LOCK_WAIT is not an integer: $wait_s"
[[ $stale_s =~ $INT_RE ]] || die 2 "BOARD_LOCK_STALE is not an integer: $stale_s"

# Cells set by `set`: B_S<n>=1 and B_V<n>=<value>, n = column (2 feature, 3 state, 4 round,
# 5 branch, 6 pr). They reach awk through ENVIRON, which does not interpret backslashes.
export B_S2= B_S3= B_S4= B_S5= B_S6= B_V2= B_V3= B_V4= B_V5= B_V6=
note='' has_note=0
case $cmd in
  new)
    [ $# -ge 3 ] && [ $# -le 4 ] || die 2 "usage: board.sh <main> new <slug> <state> <title> [<note>]"
    slug=$1 state=$2 title=$3 note=${4-}
    [[ $slug =~ $SLUG_RE ]] || die 2 "invalid slug: $slug"
    check_state "$state"
    [ -n "$title" ] || die 2 "empty title"
    check_value title "$title"
    check_value note "$note"
    ;;
  set)
    [ $# -ge 2 ] || die 2 "usage: board.sh <main> set <id> <key>=<value>..."
    id=$1
    shift
    check_value id "$id"
    for kv in "$@"; do
      case $kv in *=*) ;; *) die 2 "not a key=value pair: $kv" ;; esac
      key=${kv%%=*} val=${kv#*=}
      check_value "$key" "$val"
      case $key in
        feature) col=2 ;;
        state) check_state "$val"; col=3 ;;
        round) [[ $val =~ $INT_RE ]] || die 2 "round is not an integer: $val"; col=4 ;;
        branch) col=5 ;;
        pr) col=6 ;;
        note) note=$val has_note=1; continue ;;
        *) die 2 "unknown key: $key" ;;
      esac
      export "B_S$col=1" "B_V$col=$val"
    done
    [ "$has_note" = 0 ] || [ -n "$B_S3" ] || die 2 "note= needs state="
    ;;
  log)
    [ $# -eq 2 ] || die 2 "usage: board.sh <main> log <id> <text>"
    id=$1 text=$2
    check_value id "$id"
    [ -n "$text" ] || die 2 "empty log text"
    check_value text "$text"
    ;;
esac

lock_abs=$(cd "$fdir" && { pwd -W 2> /dev/null || pwd; })/board.lock

# Table edits. Mode rows: prints "<id>\t<state>" per row, exits 4 without a table. Mode new: adds
# B_ROW after the last row. Mode set: changes the B_S cells of the first row whose id is B_ID.
# Mode copy: prints the file unchanged. Only the first table counts; other lines pass untouched.
AWK='
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function cells(line, c,   s, n, i) {
  s = line; sub(/^\|/, "", s); sub(/\|[ \t]*$/, "", s)
  n = split(s, c, "|")
  for (i = 1; i <= n; i++) c[i] = trim(c[i])
  return n
}
BEGIN { mode = ENVIRON["B_MODE"]; id = ENVIRON["B_ID"] }
{
  line = $0
  if (!done && line ~ /^\|/) { intable = 1; n++ }
  else if (intable) { intable = 0; done = 1; if (mode == "new") print ENVIRON["B_ROW"] }
  if (intable && n > 2) {
    nc = cells(line, c)
    if (mode == "rows") print c[1] "\t" c[3]
    if (mode == "set" && !found && c[1] == id) {
      found = 1
      for (i = nc + 1; i <= 6; i++) c[i] = ""
      if (nc < 6) nc = 6
      for (k = 2; k <= 6; k++) if (ENVIRON["B_S" k] == "1") c[k] = ENVIRON["B_V" k]
      line = "|"
      for (i = 1; i <= nc; i++) line = line (c[i] == "" ? " " : " " c[i] " ") "|"
    }
  }
  if (mode != "rows") print line
}
END {
  if (n == 0) exit 4
  if (mode == "new" && !done) print ENVIRON["B_ROW"]
}'

owned=0 me='' created_dir=''

release() {
  local code=$?
  rm -f "$tmp"
  if [ -n "$created_dir" ] && [ "$code" -ne 0 ]; then rmdir "$created_dir" 2> /dev/null || true; fi
  if [ "$owned" = 1 ] && [ "$(cat "$lock/owner" 2> /dev/null || true)" = "$me" ]; then
    rm -f "$lock/owner"
    rmdir "$lock" 2> /dev/null || true
  fi
}
trap release EXIT
trap 'exit 3' INT TERM HUP

acquire() {
  local start=$SECONDS seen='' same=0 nodir=0 content epoch
  while :; do
    if mkdir "$lock" 2> /dev/null; then
      me="$(date +%s) $$ $RANDOM$RANDOM"
      owned=1
      if ! printf '%s\n' "$me" > "$lock/owner" 2> /dev/null; then
        owned=0
        rm -f "$lock/owner"
        rmdir "$lock" 2> /dev/null || true
        die 3 "cannot write $lock_abs/owner"
      fi
      return 0
    fi
    if [ ! -d "$lock" ]; then
      # Released in the meantime (try again at once), or mkdir cannot create it at all.
      nodir=$((nodir + 1))
      [ "$nodir" -lt 3 ] || die 3 "cannot create $lock_abs"
      continue
    fi
    nodir=0
    content=$(cat "$lock/owner" 2> /dev/null || true)
    epoch=${content%% *}
    if [[ $epoch =~ $INT_RE ]]; then
      same=0
      if [ $(($(date +%s) - epoch)) -gt "$stale_s" ] \
        && [ "$(cat "$lock/owner" 2> /dev/null || true)" = "$content" ]; then
        rm -f "$lock/owner"
        rmdir "$lock" 2> /dev/null || true
      fi
    else
      # No owner (or an unreadable one): abandoned once it stays the same for 2 s.
      if [ "$content" = "$seen" ]; then same=$((same + 1)); else seen=$content same=1; fi
      if [ "$same" -ge 20 ] && [ "$(cat "$lock/owner" 2> /dev/null || true)" = "$content" ]; then
        rm -f "$lock/owner"
        rmdir "$lock" 2> /dev/null || true
        same=0
      fi
    fi
    if [ $((SECONDS - start)) -gt "$wait_s" ]; then
      die 1 "board locked by another session: $lock_abs"
    fi
    if [ -d "$lock" ]; then sleep 0.1; fi
  done
}

# Rows of the board as "<id>\t<state>" lines; exit 2 without a table.
read_rows() {
  rows=$(B_MODE=rows awk "$AWK" "$board") || {
    [ $? -eq 4 ] && die 2 "no table in $board"
    die 3 "cannot read $board"
  }
}

# Looks up <id>: sets old_state, exit 2 when the board has no such row.
find_row() {
  local rid rstate
  while IFS=$'\t' read -r rid rstate; do
    if [ "$rid" = "$1" ]; then old_state=$rstate; return 0; fi
  done <<< "$rows"
  die 2 "no row $1 in $board"
}

# Writes the table edit of <mode> to the temp file.
edit_to_tmp() {
  B_MODE=$1 awk "$AWK" "$board" > "$tmp" || die 3 "cannot write $tmp"
}

# Appends "- YYYY-MM-DD HH:MM · <entry>" to the temp file, creating `## Log` when missing.
add_log() {
  if ! grep -q '^## Log[[:space:]]*$' "$tmp"; then
    if [ -n "$(tail -n 1 "$tmp")" ]; then printf '\n' >> "$tmp" || die 3 "cannot write $tmp"; fi
    printf '## Log\n' >> "$tmp" || die 3 "cannot write $tmp"
  fi
  printf -- '- %s · %s\n' "$(date '+%Y-%m-%d %H:%M')" "$1" >> "$tmp" || die 3 "cannot write $tmp"
}

# Replaces the board with the temp file: 5 more attempts 0.2 s apart (Windows: file in use).
commit() {
  local i=0
  until mv -f "$tmp" "$board" 2> /dev/null; do
    i=$((i + 1))
    [ "$i" -le 5 ] || die 3 "cannot replace $board"
    sleep 0.2
  done
}

max=0
consider() { # consider <name>: max = highest numeric prefix seen
  local v
  if [[ $1 =~ $NUM_RE ]]; then
    v=$((10#${BASH_REMATCH[1]}))
    if [ "$v" -gt "$max" ]; then max=$v; fi
  fi
  return 0
}

acquire
read_rows

case $cmd in
  new)
    while IFS=$'\t' read -r rid _; do consider "$rid"; done <<< "$rows"
    for d in "$fdir/features"/*; do
      [ -e "$d" ] || continue
      consider "${d##*/}"
    done
    branches=$(git -C "$main" branch -a --format='%(refname:short)' 2> /dev/null) || branches=''
    while IFS= read -r b; do
      case $b in */*) consider "${b##*/}" ;; esac
    done <<< "$branches"
    worktrees=$(git -C "$main" worktree list --porcelain 2> /dev/null) || worktrees=''
    while IFS= read -r w; do
      case $w in
        'worktree '*) w=${w#worktree }; w=${w%/}; consider "${w##*/}" ;;
      esac
    done <<< "$worktrees"

    mkdir -p "$fdir/features" 2> /dev/null || die 3 "cannot create $fdir/features"
    n=$((max + 1)) tries=0
    while :; do
      printf -v new_id '%03d-%s' "$n" "$slug"
      if mkdir "$fdir/features/$new_id" 2> /dev/null; then
        created_dir=$fdir/features/$new_id
        break
      fi
      [ -e "$fdir/features/$new_id" ] || die 3 "cannot create $fdir/features/$new_id"
      tries=$((tries + 1))
      [ "$tries" -lt 100 ] || die 3 "no free id after 100 attempts"
      n=$((n + 1))
    done

    B_ROW="| $new_id | $title | $state | | | |" edit_to_tmp new
    add_log "$new_id · created → $state${note:+ $note}"
    commit
    created_dir=''
    printf '%s\n' "$new_id"
    ;;
  set)
    find_row "$id"
    B_ID=$id edit_to_tmp set
    if [ -n "$B_S3" ] && [ "$B_V3" != "$old_state" ]; then
      add_log "$id · $old_state → $B_V3${note:+ $note}"
    fi
    commit
    ;;
  log)
    find_row "$id"
    edit_to_tmp copy
    add_log "$id · $text"
    commit
    ;;
esac
