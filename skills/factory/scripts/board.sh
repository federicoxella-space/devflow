#!/usr/bin/env bash
# Writes the shared factory board under a lock: reserves feature ids, changes row cells, appends log
# lines. Every write takes <main>/factory/board.lock, rereads the board and replaces it atomically.
# Usage:
#   board.sh <main> new <slug> <state> <title> [<note>]   prints the created id
#   board.sh <main> set <id> <key>=<value>...             keys: state round branch pr feature note
#   board.sh <main> log <id> <text>                       an id only in the archive logs there
#   board.sh <main> archive [<id>...]                     moves merged/closed rows to archive.md
#   board.sh <main> move <id> before|after <ref>          reorders two queued rows, no log line
# Exit: 0 ok, 1 board locked by another session, 2 invalid input, 3 I/O error.
# archive.md has the board format (`# Factory archive`). `archive` moves the rows of the given ids
# and every log line whose id has no row left in the board; it writes the archive first, then the
# board, and a rerun after an interruption replaces rows by id and skips log lines already there.
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

[ $# -ge 2 ] || die 2 "usage: board.sh <main> new|set|log|archive|move ..."
main=$1 cmd=$2
shift 2
case $cmd in new|set|log|archive|move) ;; *) die 2 "unknown command: $cmd" ;; esac

fdir=$main/factory
board=$fdir/board.md
archive=$fdir/archive.md
lock=$fdir/board.lock
tmp=$fdir/board.md.tmp.$$
atmp=$fdir/archive.md.tmp.$$
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
  archive)
    for id in "$@"; do check_value id "$id"; done
    ;;
  move)
    [ $# -eq 3 ] || die 2 "usage: board.sh <main> move <id> before|after <ref>"
    id=$1 pos=$2 ref=$3
    case $pos in before|after) ;; *) die 2 "expected before or after: $pos" ;; esac
    check_value id "$id"
    check_value ref "$ref"
    [ "$id" != "$ref" ] || die 2 "cannot move $id relative to itself"
    ;;
esac

lock_abs=$(cd "$fdir" && { pwd -W 2> /dev/null || pwd; })/board.lock

# Table edits. Mode rows: prints "<id>\t<state>" per row, exits 4 without a table. Mode new: adds
# B_ROW after the last row. Mode set: changes the B_S cells of the first row whose id is B_ID.
# Mode move: puts the row B_ID right before/after (B_POS) the row B_REF. Mode copy: prints the file
# unchanged. Only the first table counts; other lines pass untouched.
# Both awk programs drop a trailing CR from every line, so a CRLF board or archive is parsed like an
# LF one and written back with LF line endings.
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
  line = $0; sub(/\r$/, "", line)
  if (!done && line ~ /^\|/) { intable = 1; n++ }
  else if (intable) { intable = 0; done = 1; if (mode == "new") print ENVIRON["B_ROW"] }
  if (intable && n > 2) {
    nc = cells(line, c)
    if (mode == "move") {
      if (c[1] == id && !ri) ri = NR
      if (c[1] == ENVIRON["B_REF"] && !rf) rf = NR
    }
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
  if (mode == "move") L[NR] = line
  else if (mode != "rows") print line
}
END {
  if (n == 0) exit 4
  if (mode == "move") {
    if (!ri || !rf) exit 5
    for (i = 1; i <= NR; i++) {
      if (i == ri) continue
      if (i == rf && ENVIRON["B_POS"] == "before") print L[ri]
      print L[i]
      if (i == rf && ENVIRON["B_POS"] == "after") print L[ri]
    }
  }
  if (mode == "new" && !done) print ENVIRON["B_ROW"]
}'

# Archive move. Input: the board, then the archive (or its empty skeleton on stdin). B_MOVE: ids to
# move, B_KEEP: ids of the board rows that stay, one per line. Board pass: writes to B_BOARD_OUT the
# board without the moved rows and the `## Log` lines whose id is not in B_KEEP. Archive pass: prints
# the archive with each moved row in place of the first table row with its id, or after the last
# row, and the moved log lines not already in its log at the end of `## Log` (added when missing).
# Exit 4: the archive has no table; exit 5: nothing to move.
ARCH_AWK='
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function cells(line, c,   s, n, i) {
  s = line; sub(/^\|/, "", s); sub(/\|[ \t]*$/, "", s)
  n = split(s, c, "|")
  for (i = 1; i <= n; i++) c[i] = trim(c[i])
  return n
}
function logid(line,   s, i) {
  if (line !~ /^- [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9] · /) return ""
  s = line; sub(/^- [^ ]+ [^ ]+ · /, "", s)
  i = index(s, " · ")
  return i > 1 ? substr(s, 1, i - 1) : ""
}
function out(s) { print s; last = s }
function flushrows(   i) {
  for (i = 1; i <= nm; i++) if (!(mid[i] in placed)) { out(byid[mid[i]]); placed[mid[i]] = 1 }
}
function flushlog(   i) {
  for (i = 1; i <= nl; i++) if (!(mlog[i] in seen)) out(mlog[i])
  logged = 1
}
BEGIN {
  bout = ENVIRON["B_BOARD_OUT"]
  k = split(ENVIRON["B_MOVE"], a, "\n"); for (i = 1; i <= k; i++) if (a[i] != "") mv[a[i]] = 1
  k = split(ENVIRON["B_KEEP"], a, "\n"); for (i = 1; i <= k; i++) if (a[i] != "") keep[a[i]] = 1
}
FNR == NR {
  line = $0; sub(/\r$/, "", line)
  if (!bdone && line ~ /^\|/) { bin = 1; bn++ } else if (bin) { bin = 0; bdone = 1 }
  if (bin && bn > 2) {
    cells(line, c)
    if (c[1] in mv) { if (!(c[1] in byid)) mid[++nm] = c[1]; byid[c[1]] = line; next }
  }
  if (line ~ /^## Log[ \t]*$/) blog = 1
  else if (line ~ /^#/) blog = 0
  else if (blog) { id = logid(line); if (id != "" && !(id in keep)) { mlog[++nl] = line; next } }
  print line > bout
  next
}
{
  line = $0; sub(/\r$/, "", line)
  if (!adone && line ~ /^\|/) { ain = 1; an++ } else if (ain) { ain = 0; adone = 1; flushrows() }
  if (ain && an > 2) { cells(line, c); if (c[1] in byid) { line = byid[c[1]]; placed[c[1]] = 1 } }
  if (alog) {
    if (line ~ /^#/) { flushlog(); alog = 0 }
    else if (line ~ /^[ \t]*$/) { held = held line "\n"; next }
    else seen[line] = 1
  }
  if (held != "") { printf "%s", held; held = "" }
  out(line)
  if (!logged && line ~ /^## Log[ \t]*$/) alog = 1
}
END {
  if (an == 0) exit 4
  if (nm == 0 && nl == 0) exit 5
  if (ain) flushrows()
  if (alog) { flushlog(); printf "%s", held }
  else if (!logged) { if (last != "") print ""; print "## Log"; flushlog() }
}'

owned=0 me='' created_dir='' stale_dir=''

release() {
  local code=$?
  rm -f "$tmp" "$atmp"
  if [ -n "$stale_dir" ]; then rm -rf "$stale_dir"; fi
  if [ -n "$created_dir" ] && [ "$code" -ne 0 ]; then rmdir "$created_dir" 2> /dev/null || true; fi
  read_owner "$lock/owner"
  if [ "$owned" = 1 ] && [ "$owner_c" = "$me" ]; then
    rm -f "$lock/owner"
    rmdir "$lock" 2> /dev/null || true
  fi
}
trap release EXIT
trap 'exit 3' INT TERM HUP

# Reads the first line of <file> into owner_c ('' when missing), without starting a process.
read_owner() {
  owner_c=''
  { IFS= read -r owner_c < "$1"; } 2> /dev/null || true
}

# Takes an abandoned lock out of the way. It is first renamed to a name only this process uses, so
# two sessions never remove the same lock; then its owner is read again in the renamed folder:
# still abandoned (old epoch, or the same content seen without an epoch) -> removed; otherwise it
# was another session's fresh lock and goes back in place (removed if board.lock exists again).
# steal <content seen> <epoch|noepoch>
steal() {
  local e2 abandoned=0 now
  now=$(date +%s)
  # Last check right before the rename: the lock may have changed hands while we looked at it.
  read_owner "$lock/owner"
  [ "$owner_c" = "$1" ] || return 0
  stale_dir=$lock.stale.$$.$RANDOM$RANDOM
  if ! mv "$lock" "$stale_dir" 2> /dev/null; then
    # Another session took it or removed it first.
    stale_dir=''
    return 0
  fi
  read_owner "$stale_dir/owner"
  e2=${owner_c%% *}
  if [[ $e2 =~ $INT_RE ]]; then
    if [ $((now - e2)) -gt "$stale_s" ]; then abandoned=1; fi
  elif [ "$2" = noepoch ] && [ "$owner_c" = "$1" ]; then
    abandoned=1
  fi
  if [ "$abandoned" = 0 ] && mkdir "$lock" 2> /dev/null; then
    if [ -e "$stale_dir/owner" ]; then mv "$stale_dir/owner" "$lock/owner" 2> /dev/null || true; fi
  fi
  rm -rf "$stale_dir"
  stale_dir=''
}

acquire() {
  local start=$SECONDS seen='' same=0 nodir=0 wfail=0 waited=0 content epoch i st
  while :; do
    # The owner line is ready before mkdir, so the lock stays without owner as briefly as possible.
    me="$(date +%s) $$ $RANDOM$RANDOM"
    if mkdir "$lock" 2> /dev/null; then
      owned=1
      if { printf '%s\n' "$me" > "$lock/owner"; } 2> /dev/null; then
        st=0
        for i in "$lock".stale.*; do [ -e "$i" ] && st=1; done
        [ "$waited" = 1 ] || [ "$st" = 1 ] || return 0
        # After a wait, or while another session removes an abandoned lock, that session may have
        # moved ours too: give it time to put it back, then keep it only if the owner is ours.
        i=0
        sleep 0.3
        read_owner "$lock/owner"
        while [ -z "$owner_c" ] && [ "$i" -lt 10 ]; do
          sleep 0.1
          i=$((i + 1))
          read_owner "$lock/owner"
        done
        [ "$owner_c" != "$me" ] || return 0
        owned=0 waited=1
        continue
      fi
      owned=0 waited=1
      # Moved away by a session that took it for abandoned: that session handles it, try again.
      [ -d "$lock" ] || continue
      # Not writable: drop the empty folder, give up after 3 attempts.
      rmdir "$lock" 2> /dev/null || true
      wfail=$((wfail + 1))
      [ "$wfail" -lt 3 ] || die 3 "cannot write $lock_abs/owner"
      continue
    fi
    if [ ! -d "$lock" ]; then
      # Released in the meantime (try again at once), or mkdir cannot create it at all.
      nodir=$((nodir + 1)) waited=1
      [ "$nodir" -lt 3 ] || die 3 "cannot create $lock_abs"
      continue
    fi
    nodir=0 waited=1
    read_owner "$lock/owner"
    content=$owner_c
    epoch=${content%% *}
    if [[ $epoch =~ $INT_RE ]]; then
      same=0
      if [ $(($(date +%s) - epoch)) -gt "$stale_s" ]; then steal "$content" epoch; fi
    else
      # No owner (or an unreadable one): abandoned once it stays the same for 2 s.
      if [ "$content" = "$seen" ]; then same=$((same + 1)); else seen=$content same=1; fi
      if [ "$same" -ge 20 ]; then
        steal "$content" noepoch
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

# has_row <id> <rows>: sets old_state, returns 1 when <rows> has no such id.
has_row() {
  local rid rstate
  while IFS=$'\t' read -r rid rstate; do
    if [ "$rid" = "$1" ]; then old_state=$rstate; return 0; fi
  done <<< "$2"
  return 1
}

# Looks up <id> in the board: sets old_state, exit 2 when the board has no such row.
find_row() {
  has_row "$1" "$rows" || die 2 "no row $1 in $board"
}

# Writes the table edit of <mode> to the temp file.
edit_to_tmp() {
  B_MODE=$1 awk "$AWK" "$board" > "$tmp" || die 3 "cannot write $tmp"
}

# add_log <temp> <entry>: appends "- YYYY-MM-DD HH:MM · <entry>" to <temp>, creating `## Log`
# when missing.
add_log() {
  if ! grep -q '^## Log[[:space:]]*$' "$1"; then
    if [ -n "$(tail -n 1 "$1")" ]; then printf '\n' >> "$1" || die 3 "cannot write $1"; fi
    printf '## Log\n' >> "$1" || die 3 "cannot write $1"
  fi
  printf -- '- %s · %s\n' "$(date '+%Y-%m-%d %H:%M')" "$2" >> "$1" || die 3 "cannot write $1"
}

# commit <temp> <file>: replaces <file> (board or archive) with <temp>, 5 more attempts 0.2 s apart
# (Windows: file in use). The lock must still be ours: if another session took it over, nothing is
# written (exit 1).
commit() {
  local i=0
  read_owner "$lock/owner"
  # A missing owner can be a lock in transit (renamed and being put back by another session).
  while [ -z "$owner_c" ] && [ "$i" -lt 10 ]; do
    sleep 0.1
    i=$((i + 1))
    read_owner "$lock/owner"
  done
  [ "$owner_c" = "$me" ] || die 1 "board locked by another session: $lock_abs"
  i=0
  until mv -f "$1" "$2" 2> /dev/null; do
    i=$((i + 1))
    [ "$i" -le 5 ] || die 3 "cannot replace $2"
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
    if [ -f "$archive" ]; then
      arows=$(B_MODE=rows awk "$AWK" "$archive" 2> /dev/null) || arows=''
      while IFS=$'\t' read -r rid _; do consider "$rid"; done <<< "$arows"
    fi
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
    add_log "$tmp" "$new_id · created → $state${note:+ $note}"
    commit "$tmp" "$board"
    created_dir=''
    printf '%s\n' "$new_id"
    ;;
  set)
    find_row "$id"
    B_ID=$id edit_to_tmp set
    if [ -n "$B_S3" ] && [ "$B_V3" != "$old_state" ]; then
      add_log "$tmp" "$id · $old_state → $B_V3${note:+ $note}"
    fi
    commit "$tmp" "$board"
    ;;
  log)
    if has_row "$id" "$rows"; then
      edit_to_tmp copy
      add_log "$tmp" "$id · $text"
      commit "$tmp" "$board"
    else
      # An archived feature (e.g. the cleanup of a closed one) logs in the archive.
      arows=''
      if [ -f "$archive" ]; then arows=$(B_MODE=rows awk "$AWK" "$archive" 2> /dev/null) || arows=''; fi
      has_row "$id" "$arows" || die 2 "no row $id in $board or $archive"
      B_MODE=copy awk "$AWK" "$archive" > "$atmp" || die 3 "cannot write $atmp"
      add_log "$atmp" "$id · $text"
      commit "$atmp" "$archive"
    fi
    ;;
  move)
    find_row "$id"
    [ "$old_state" = queued ] || die 2 "row $id is $old_state: only queued rows are moved"
    find_row "$ref"
    [ "$old_state" = queued ] || die 2 "row $ref is $old_state: only queued rows are moved"
    B_ID=$id B_REF=$ref B_POS=$pos edit_to_tmp move
    commit "$tmp" "$board"
    ;;
  archive)
    move=''
    for id in "$@"; do
      find_row "$id"
      case $old_state in
        merged|closed) ;;
        *) die 2 "row $id is $old_state: only merged or closed rows are archived" ;;
      esac
      move=$move$id$'\n'
    done
    keep=''
    while IFS=$'\t' read -r rid _; do
      case $'\n'$move in *$'\n'"$rid"$'\n'*) ;; *) keep=$keep$rid$'\n' ;; esac
    done <<< "$rows"
    export B_MOVE="$move" B_KEEP="$keep" B_BOARD_OUT="$tmp"
    rc=0
    if [ -f "$archive" ]; then
      awk "$ARCH_AWK" "$board" "$archive" > "$atmp" || rc=$?
    else
      printf '# Factory archive\n\n| id | feature | state | round | branch | PR |\n|----|---------|-------|-------|--------|----|\n\n## Log\n' \
        | awk "$ARCH_AWK" "$board" - > "$atmp" || rc=$?
    fi
    case $rc in
      0) ;;
      4) die 2 "no table in $archive" ;;
      5) exit 0 ;;
      *) die 3 "cannot write $atmp or $tmp" ;;
    esac
    # Archive first: after an interruption between the two, a rerun finds the rows still in the
    # board, replaces them in the archive and skips the log lines already there.
    commit "$atmp" "$archive"
    commit "$tmp" "$board"
    ;;
esac
