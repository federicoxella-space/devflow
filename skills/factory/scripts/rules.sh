#!/usr/bin/env bash
# Merges the feature rule files factory/rules/*.md of the base branch into factory/playbook.md.
# Usage: rules.sh <main> <base_branch>
# Prints `none` or `merged <id> <id>...`. Exit: 0 ok, 2 invalid input, 3 git error, 4 push refused.
# Works in a temporary detached worktree: the <main> checkout is never touched, except for the
# final update of the local base branch.
set -euo pipefail
export LC_ALL=C

if [ "$#" -ne 2 ]; then
  echo "usage: rules.sh <main> <base_branch>" >&2
  exit 2
fi
main=$1
base=$2

if ! git check-ref-format --branch "$base" > /dev/null 2>&1; then
  echo "invalid base branch: $base" >&2
  exit 2
fi
if [ ! -d "$main" ] || ! git -C "$main" rev-parse --git-dir > /dev/null 2>&1; then
  echo "not a git repository: $main" >&2
  exit 2
fi

# Lists the rule files (factory/rules/*.md, direct children) of a ref, in name order, one
# `<mode><TAB><path>` per line: the mode tells regular blobs (100644) from symlinks (120000),
# executables (100755) and submodules (160000).
rule_files() {
  git -C "$main" ls-tree -r -z "$1" -- factory/rules/ 2> /dev/null \
    | while IFS= read -r -d '' e; do
        p=${e#*$'\t'}
        case "$p" in
          factory/rules/*/* | *$'\n'*) continue ;;
          factory/rules/*.md) printf '%s\t%s\n' "${e%% *}" "$p" ;;
        esac
      done | sort -t "$(printf '\t')" -k 2
}

# Echoes the first existing ref of the arguments if it has rule files; nothing otherwise.
ref_with_rules() {
  local r
  for r in "$@"; do
    if git -C "$main" rev-parse --verify -q "$r^{commit}" > /dev/null 2>&1; then
      if [ -n "$(rule_files "$r")" ]; then
        echo "$r"
      fi
      return 0
    fi
  done
  return 0
}

local_ref="refs/heads/$base"
remote_ref="refs/remotes/origin/$base"
ref=$(ref_with_rules "$local_ref" "$remote_ref")
if [ -z "$ref" ]; then
  echo none
  exit 0
fi

if ! out=$(git -C "$main" fetch -q origin "$base" 2>&1); then
  printf '%s\n' "$out" >&2
  exit 3
fi
ref=$(ref_with_rules "$remote_ref")
if [ -z "$ref" ]; then
  echo none
  exit 0
fi

tmp=$(mktemp -d "${TMPDIR:-/tmp}/devflow-rules.XXXXXX")
cleanup() {
  git -C "$main" worktree remove -f "$tmp" > /dev/null 2>&1 || true
  rm -rf "$tmp"
  git -C "$main" worktree prune > /dev/null 2>&1 || true
}
trap cleanup EXIT

if ! out=$(git -C "$main" worktree add -q --detach "$tmp" "$remote_ref" 2>&1); then
  printf '%s\n' "$out" >&2
  exit 3
fi

# awk program: argv[1] = playbook, argv[2] = rule file. Prints the new playbook. The two files
# are told apart by FILENAME, not by FNR == NR: with an empty playbook the rule file would be
# read as the playbook.
merge_awk='
function strip(s) { sub(/[ \t\r]+$/, "", s); return s }
FILENAME == ARGV[1] {
  line = $0
  if (line ~ /^## /) {
    t = strip(line); ns++; idx[t] = ns; n[ns] = 0; hdr[ns] = line
    cur = ns
  } else if (cur == 0) { pre[++np] = line }
  else { n[cur]++; body[cur, n[cur]] = line; seen[cur, strip(line)] = 1 }
  next
}
{
  line = strip($0)
  if (line ~ /^## /) {
    t = line
    if (!(t in idx)) { ns++; idx[t] = ns; n[ns] = 0; hdr[ns] = t }
    rc = idx[t]; next
  }
  if (rc == 0 || line == "") next
  if ((rc, line) in seen) next
  seen[rc, line] = 1; na[rc]++; add[rc, na[rc]] = line
}
END {
  for (i = 1; i <= np; i++) print pre[i]
  for (s = 1; s <= ns; s++) {
    print hdr[s]
    last = n[s]
    while (last > 0 && strip(body[s, last]) == "") last--
    for (j = 1; j <= last; j++) print body[s, j]
    for (j = 1; j <= na[s]; j++) print add[s, j]
    for (j = last + 1; j <= n[s]; j++) print body[s, j]
  }
}'

ids=""
playbook="$tmp/factory/playbook.md"
if [ ! -f "$playbook" ]; then
  mkdir -p "$tmp/factory"
  : > "$playbook"
fi
list=$(rule_files "$remote_ref")
name_re='^[A-Za-z0-9._-]+\.md$'
while IFS=$'\t' read -r mode path; do
  [ -n "$path" ] || continue
  name=${path#factory/rules/}
  if ! [[ $name =~ $name_re ]]; then
    echo "skipped rule file with an invalid name: $name" >&2
    continue
  fi
  # A symlink, executable or submodule is never read (nor is a symlink target).
  if [ "$mode" != 100644 ]; then
    echo "skipped rule file that is not a regular file: $name" >&2
    continue
  fi
  if ! awk "$merge_awk" "$playbook" "$tmp/$path" > "$tmp/.playbook.new"; then
    echo "cannot merge $name" >&2
    exit 3
  fi
  mv "$tmp/.playbook.new" "$playbook"
  git -C "$tmp" rm -q -f -- "$path" > /dev/null
  ids="$ids ${name%.md}"
done <<< "$list"

if [ -z "$ids" ]; then
  echo none
  exit 0
fi

msg="$tmp/.commit-msg"
{
  echo "docs(factory): merge feature rules into playbook"
  echo
  for id in $ids; do echo "Factory: $id"; done
} > "$msg"
git -C "$tmp" add -- factory/playbook.md
if ! out=$(git -C "$tmp" commit -q -F "$msg" 2>&1); then
  printf '%s\n' "$out" >&2
  exit 3
fi

if ! out=$(git -C "$tmp" push -q origin "HEAD:refs/heads/$base" 2>&1); then
  printf '%s\n' "$out" >&2
  exit 4
fi

current=$(git -C "$main" symbolic-ref -q --short HEAD 2> /dev/null || true)
if [ "$current" = "$base" ]; then
  upd=(pull -q --ff-only)
else
  upd=(fetch -q origin "$base:$base")
fi
if ! out=$(git -C "$main" "${upd[@]}" 2>&1); then
  echo "warning: local $base not updated: $out" >&2
fi

echo "merged${ids}"
