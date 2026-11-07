#!/usr/bin/env bash
# Scans the changed files of a checkout for secrets with gitleaks or trufflehog.
# Usage: secrets-scan.sh <mode> <dir> [<base>]
#   <mode>: auto (empty = auto) | gitleaks | trufflehog | off
#   without <base>: the files of `git status --porcelain -uall`, deleted ones excluded
#   with <base>: the files of `git diff <base>...HEAD`, deleted ones excluded
# Exit and stdout:
#   0  `clean <tool>`
#   1  `findings <tool>`, then one `<file>:<line> <rule>` per finding (never the secret itself)
#   2  nothing on stdout, the reason on stderr (tool missing or broken, unknown mode, git failed)
#   3  `skipped off` or `skipped none`
# Writes nothing in <dir>: temporary files go in a mktemp dir, removed on exit.
set -u

mode=${1:-}
dir=${2:-}
base=${3:-}
[ -n "$mode" ] || mode=auto

fail() { echo "secrets-scan: $*" >&2; exit 2; }

case "$mode" in
  auto)
    if command -v gitleaks > /dev/null 2>&1; then tool=gitleaks
    elif command -v trufflehog > /dev/null 2>&1; then tool=trufflehog
    else echo "skipped none"; exit 3
    fi ;;
  gitleaks|trufflehog)
    tool=$mode
    command -v "$tool" > /dev/null 2>&1 || fail "$tool not found in PATH (secrets_scan: $mode)" ;;
  off) echo "skipped off"; exit 3 ;;
  *) fail "unknown mode '$mode' (expected auto, gitleaks, trufflehog or off)" ;;
esac

[ -n "$dir" ] || fail "missing <dir>"
cd "$dir" 2> /dev/null || fail "cannot enter $dir"
case "$base" in -*) fail "invalid base '$base'" ;; esac

tmp=$(mktemp -d "${TMPDIR:-/tmp}/secrets-scan.XXXXXX") || fail "mktemp failed"
trap 'rm -rf "$tmp"' EXIT

# Changed files, NUL-separated, relative to <dir>.
files=()
if [ -n "$base" ]; then
  git diff --name-only -z --diff-filter=d "$base...HEAD" > "$tmp/list" 2> "$tmp/git-err" ||
    { tail -n 20 "$tmp/git-err" >&2; fail "git diff $base...HEAD failed in $dir"; }
  while IFS= read -r -d '' path; do
    [ -n "$path" ] && files+=("$path")
  done < "$tmp/list"
else
  git status --porcelain -z -uall > "$tmp/list" 2> "$tmp/git-err" ||
    { tail -n 20 "$tmp/git-err" >&2; fail "git status failed in $dir"; }
  skip_next=0
  while IFS= read -r -d '' entry; do
    # A rename or copy record is followed by its original path: skip that one.
    if [ "$skip_next" = 1 ]; then skip_next=0; continue; fi
    xy=${entry:0:2}
    path=${entry:3}
    case "$xy" in R*|C*) skip_next=1 ;; esac
    case "$xy" in *D*) continue ;; esac
    [ -n "$path" ] && files+=("$path")
  done < "$tmp/list"
fi

if [ "${#files[@]}" -eq 0 ]; then echo "clean $tool"; exit 0; fi

# Prints `<file>:<line> <rule>` for each top-level JSON object of the input, reading only the
# named keys at the given object depth; any other object -> `unparsed finding`. Never prints any
# other field (Secret, Match, Raw, ...).
parse() { # parse <file key> <file depth> <line key> <line depth> <rule key> <rule depth>
  awk -v fk="$1" -v fd="$2" -v lk="$3" -v ld="$4" -v rk="$5" -v rd="$6" '
    function put(k, v) {
      if (k == fk && od == fd && f == "") f = v
      if (k == lk && od == ld && l == "") l = v
      if (k == rk && od == rd && r == "") r = v
    }
    function flush() { if (tok != "") { if (top > 0 && ct[top] == "o" && colon) put(key, tok); tok = ""; colon = 0 } }
    { buf = buf $0 "\n" }
    END {
      n = length(buf); top = 0; od = 0; instr = 0; esc = 0; colon = 0; tok = ""; key = ""
      for (i = 1; i <= n; i++) {
        c = substr(buf, i, 1)
        if (instr) {
          if (esc) { s = s (c == "\"" || c == "\\" || c == "/" ? c : "\\" c); esc = 0 }
          else if (c == "\\") esc = 1
          else if (c == "\"") {
            instr = 0
            if (top > 0 && ct[top] == "o") {
              if (colon) { put(key, s); colon = 0 } else key = s
            }
          }
          else s = s c
          continue
        }
        if (c == "\"") { flush(); instr = 1; s = ""; continue }
        if (c == "{" || c == "[") {
          flush(); colon = 0
          ct[++top] = (c == "{" ? "o" : "a")
          if (c == "{") { od++; if (od == 1) { f = ""; l = ""; r = "" } }
          key = ""
          continue
        }
        if (c == "}" || c == "]") {
          flush()
          if (top > 0) {
            if (ct[top] == "o") {
              if (od == 1) {
                if (f != "" && l ~ /^[0-9]+$/ && r != "") print f ":" l " " r
                else print "unparsed finding"
              }
              od--
            }
            top--
          }
          key = ""; colon = 0
          continue
        }
        if (c == ":") { colon = 1; continue }
        if (c == ",") { flush(); colon = 0; key = ""; continue }
        if (c == " " || c == "\t" || c == "\n" || c == "\r") { flush(); continue }
        if (colon) tok = tok c
      }
    }'
}

: > "$tmp/found"
status=0
if [ "$tool" = gitleaks ]; then
  extra=()
  [ -f .gitleaks.toml ] && extra+=(--config .gitleaks.toml)
  [ -f .gitleaksignore ] && extra+=(--gitleaks-ignore-path .gitleaksignore)
  for file in "${files[@]}"; do
    rm -f "$tmp/report.json"
    gitleaks dir --no-banner --redact --exit-code 99 --report-format json \
      --report-path "$tmp/report.json" ${extra[@]+"${extra[@]}"} -- "$file" \
      > /dev/null 2> "$tmp/err"
    code=$?
    case "$code" in
      0) ;;
      99)
        status=1
        lines=$(parse File 1 StartLine 1 RuleID 1 < "$tmp/report.json" 2> /dev/null)
        [ -n "$lines" ] || lines="unparsed finding"
        printf '%s\n' "$lines" >> "$tmp/found" ;;
      *)
        tail -n 20 "$tmp/err" >&2
        fail "gitleaks exited $code on $file" ;;
    esac
  done
else
  trufflehog filesystem --json --no-update --no-verification --fail -- "${files[@]}" \
    > "$tmp/out.json" 2> "$tmp/err"
  code=$?
  case "$code" in
    0) ;;
    183)
      status=1
      lines=$(parse file 4 line 4 DetectorName 1 < "$tmp/out.json" 2> /dev/null)
      [ -n "$lines" ] || lines="unparsed finding"
      printf '%s\n' "$lines" >> "$tmp/found" ;;
    *)
      tail -n 20 "$tmp/err" >&2
      fail "trufflehog exited $code" ;;
  esac
fi

if [ "$status" = 1 ]; then
  echo "findings $tool"
  cat "$tmp/found"
  exit 1
fi
echo "clean $tool"
exit 0
