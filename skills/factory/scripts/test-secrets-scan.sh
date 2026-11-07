#!/usr/bin/env bash
# Tests for secrets-scan.sh on temporary repos, with stubbed gitleaks and trufflehog.
# The script runs with a PATH reduced to a temp dir (wrappers to git and the utilities it uses,
# plus the stubs of each case), so a real scanner installed on the machine cannot skew a result.
# Run: bash skills/factory/scripts/test-secrets-scan.sh
set -u
src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
export GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
bash_bin=$(command -v bash)
fake=FAKE-SECRET-VALUE-0123456789

ok() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fails=$((fails + 1)); fi; }

# Wrappers to the commands the script (and the stubs) need, nothing else.
mkdir "$tmp/base-bin"
for c in git awk tail mktemp rm cat; do
  printf '#!%s\nexec "%s" "$@"\n' "$bash_bin" "$(command -v "$c")" > "$tmp/base-bin/$c"
  chmod +x "$tmp/base-bin/$c"
done

# Stubs: log cwd and every argument, write $STUB_REPORT (gitleaks: to --report-path; trufflehog:
# to stdout), print $STUB_STDERR to stderr, print the fake secret on stdout, exit $STUB_EXIT.
mkdir "$tmp/stubs"
cat > "$tmp/stubs/gitleaks" <<STUB
#!$bash_bin
{ echo "cwd \$(pwd)"; for a in "\$@"; do echo "arg \$a"; done; echo end; } >> "\$STUB_LOG/gitleaks.log"
rp=""; prev=""
for a in "\$@"; do [ "\$prev" = --report-path ] && rp=\$a; prev=\$a; done
echo "[]" > "\$rp"
[ -n "\${STUB_REPORT:-}" ] && cat "\$STUB_REPORT" > "\$rp"
echo "leak $fake"
[ -n "\${STUB_STDERR:-}" ] && printf '%s\n' "\$STUB_STDERR" >&2
exit "\${STUB_EXIT:-0}"
STUB
cat > "$tmp/stubs/trufflehog" <<STUB
#!$bash_bin
{ echo "cwd \$(pwd)"; for a in "\$@"; do echo "arg \$a"; done; echo end; } >> "\$STUB_LOG/trufflehog.log"
[ -n "\${STUB_REPORT:-}" ] && cat "\$STUB_REPORT"
[ -n "\${STUB_STDERR:-}" ] && printf '%s\n' "\$STUB_STDERR" >&2
exit "\${STUB_EXIT:-0}"
STUB
chmod +x "$tmp/stubs/gitleaks" "$tmp/stubs/trufflehog"

n=0
# scan <tools: none|gitleaks|trufflehog|both> <mode> <dir> [<base>]: out, err, code, log dir in $logs
scan() {
  local tools=$1; shift
  n=$((n + 1)); bin=$tmp/bin$n; logs=$tmp/logs$n
  mkdir "$bin" "$logs"
  cp "$tmp/base-bin/"* "$bin/"
  case "$tools" in gitleaks|both) cp "$tmp/stubs/gitleaks" "$bin/" ;; esac
  case "$tools" in trufflehog|both) cp "$tmp/stubs/trufflehog" "$bin/" ;; esac
  out=$(PATH="$bin" STUB_LOG="$logs" "$bash_bin" "$src/secrets-scan.sh" "$@" 2> "$tmp/err"); code=$?
  err=$(cat "$tmp/err")
}
called() { [ -s "$logs/$1.log" ]; }
calls() { grep -c '^end$' "$logs/$1.log" 2> /dev/null || echo 0; }
# files passed after `--`, one per line, sorted
scanned() { awk '$0 == "end" { on = 0 } on { sub(/^arg /, ""); print } $0 == "arg --" { on = 1 }' "$logs/$1.log" | sort; }
has_arg_seq() { # has_arg_seq <tool> <arg> <next arg>: <arg> directly followed by <next arg>
  awk -v a="arg $2" -v b="arg $3" 'p == a && $0 == b { f = 1 } { p = $0 } END { exit !f }' "$logs/$1.log"
}

# repo with every kind of change
r=$tmp/repo
git init -q -b main "$r"
( cd "$r" && echo a > a.txt && echo d > del.txt && echo o > old.txt && echo s > gone.txt &&
  git add . && git commit -qm init &&
  echo changed >> a.txt && rm del.txt && git mv old.txt new.txt && git rm -q gone.txt &&
  mkdir "sub dir" && echo n > "sub dir/new file.txt" && echo st > staged.txt && git add staged.txt )
expected=$(printf '%s\n' a.txt new.txt "sub dir/new file.txt" staged.txt | sort)
status_before=$(git -C "$r" status --porcelain -uall)

# AC1: resolution
scan both auto "$r"
ok "auto with both -> gitleaks" '[ $code -eq 0 ] && [ "$out" = "clean gitleaks" ] && called gitleaks && ! called trufflehog'
scan both "" "$r"
ok "empty mode = auto -> gitleaks" '[ $code -eq 0 ] && [ "$out" = "clean gitleaks" ]'
scan trufflehog auto "$r"
ok "auto with trufflehog only -> trufflehog" '[ $code -eq 0 ] && [ "$out" = "clean trufflehog" ] && called trufflehog'
scan both trufflehog "$r"
ok "fixed trufflehog with both -> trufflehog only" '[ "$out" = "clean trufflehog" ] && called trufflehog && ! called gitleaks'
scan both gitleaks "$r"
ok "fixed gitleaks with both -> gitleaks only" '[ "$out" = "clean gitleaks" ] && called gitleaks && ! called trufflehog'

# AC2: skipped
scan both off "$r"
ok "off -> exit 3 skipped off, nothing launched" '[ $code -eq 3 ] && [ "$out" = "skipped off" ] && ! called gitleaks && ! called trufflehog'
scan none auto "$r"
ok "auto without tools -> exit 3 skipped none" '[ $code -eq 3 ] && [ "$out" = "skipped none" ]'

# AC3: errors
scan none gitleaks "$r"
ok "fixed gitleaks missing -> exit 2, reason, empty stdout" '[ $code -eq 2 ] && [ -z "$out" ] && echo "$err" | grep -q gitleaks'
scan gitleaks trufflehog "$r"
ok "fixed trufflehog missing -> exit 2, reason, empty stdout" '[ $code -eq 2 ] && [ -z "$out" ] && echo "$err" | grep -q trufflehog'
STUB_EXIT=1 STUB_STDERR="boom: bad config" scan gitleaks gitleaks "$r"
ok "gitleaks error -> exit 2 with its stderr, empty stdout" '[ $code -eq 2 ] && [ -z "$out" ] && echo "$err" | grep -q "boom: bad config"'
STUB_EXIT=5 STUB_STDERR="crash" scan gitleaks auto "$r"
ok "auto, gitleaks error -> exit 2 (no fallback)" '[ $code -eq 2 ] && [ -z "$out" ] && echo "$err" | grep -q crash'
STUB_EXIT=1 STUB_STDERR="trufflehog broke" scan trufflehog auto "$r"
ok "auto, trufflehog error -> exit 2" '[ $code -eq 2 ] && [ -z "$out" ] && echo "$err" | grep -q "trufflehog broke"'
STUB_EXIT=1 STUB_STDERR=$(for i in $(seq 1 30); do echo "line$i"; done) scan gitleaks gitleaks "$r"
ok "tool error -> only the last 20 lines of its stderr" 'echo "$err" | grep -qx line30 && echo "$err" | grep -qx line11 && ! echo "$err" | grep -qx line10'
scan both nope "$r"
ok "unknown mode -> exit 2, reason, empty stdout" '[ $code -eq 2 ] && [ -z "$out" ] && echo "$err" | grep -q nope && ! called gitleaks'
scan gitleaks gitleaks "$tmp"
ok "git failure -> exit 2, empty stdout" '[ $code -eq 2 ] && [ -z "$out" ] && [ -n "$err" ] && ! called gitleaks'

# AC4: findings, never the secret
cat > "$tmp/gl-report.json" <<JSON
[
 {
  "RuleID": "aws-access-token",
  "Description": "AWS",
  "StartLine": 3,
  "EndLine": 3,
  "Match": "key = \"$fake\"",
  "Secret": "$fake \"File\": \"x\", {}",
  "File": "src/client.ts",
  "Tags": [],
  "Fingerprint": "src/client.ts:aws-access-token:3"
 }
]
JSON
STUB_EXIT=99 STUB_REPORT=$tmp/gl-report.json STUB_STDERR="found $fake" scan gitleaks gitleaks "$r"
ok "gitleaks finding -> exit 1, header and one line per scanned file" '[ $code -eq 1 ] && [ "$(echo "$out" | head -n 1)" = "findings gitleaks" ] && [ "$(echo "$out" | grep -cx "src/client.ts:3 aws-access-token")" -eq 4 ]'
ok "gitleaks finding -> secret not in stdout or stderr" '! echo "$out$err" | grep -q "$fake"'
printf '[{"RuleID":"generic-api-key","StartLine":7,"Secret":"%s","File":"a b.txt"}]' "$fake" > "$tmp/gl-compact.json"
STUB_EXIT=99 STUB_REPORT=$tmp/gl-compact.json scan gitleaks gitleaks "$r"
ok "gitleaks compact JSON -> parsed, path with spaces whole" 'echo "$out" | grep -qx "a b.txt:7 generic-api-key" && ! echo "$out" | grep -q "$fake"'
printf '[{"Secret":"%s"}]' "$fake" > "$tmp/gl-bad.json"
STUB_EXIT=99 STUB_REPORT=$tmp/gl-bad.json scan gitleaks gitleaks "$r"
ok "gitleaks unparsable finding -> unparsed finding" '[ $code -eq 1 ] && echo "$out" | grep -qx "unparsed finding" && ! echo "$out" | grep -q "$fake"'
echo "not json $fake" > "$tmp/gl-junk.json"
STUB_EXIT=99 STUB_REPORT=$tmp/gl-junk.json scan gitleaks gitleaks "$r"
ok "gitleaks finding without report -> unparsed finding" '[ $code -eq 1 ] && echo "$out" | grep -qx "unparsed finding" && ! echo "$out" | grep -q "$fake"'

{
  printf '{"SourceMetadata":{"Data":{"Filesystem":{"file":"src/client.ts","line":3}}},"DetectorType":2,"DetectorName":"AWS","Verified":false,"Raw":"%s","Redacted":"AKIA","ExtraData":{"file":"other","line":9}}\n' "$fake"
  printf '{"SourceMetadata":{"Data":{"Filesystem":{"file":"sub dir/new file.txt","line":12}}},"DetectorName":"Github","Raw":"%s"}\n' "$fake"
  printf '{"DetectorName":"Slack","Raw":"%s"}\n' "$fake"
} > "$tmp/th-report.json"
STUB_EXIT=183 STUB_REPORT=$tmp/th-report.json STUB_STDERR="found $fake" scan trufflehog trufflehog "$r"
th_expected=$(printf '%s\n' "findings trufflehog" "src/client.ts:3 AWS" "sub dir/new file.txt:12 Github" "unparsed finding")
ok "trufflehog findings -> exit 1, one line each, unparsable one marked" '[ $code -eq 1 ] && [ "$out" = "$th_expected" ]'
ok "trufflehog findings -> secret not in stdout or stderr" '! echo "$out$err" | grep -q "$fake"'

# AC5: files scanned
scan gitleaks gitleaks "$r"
ok "gitleaks: one call per changed file" '[ "$(calls gitleaks)" -eq 4 ]'
ok "gitleaks: status files, untracked, renamed, spaces, no deleted" '[ "$(scanned gitleaks)" = "$expected" ]'
ok "gitleaks: run from <dir>" '[ "$(grep -c "^cwd $r\$" "$logs/gitleaks.log")" -eq 4 ]'
scan trufflehog trufflehog "$r"
ok "trufflehog: one call with every changed file" '[ "$(calls trufflehog)" -eq 1 ] && [ "$(scanned trufflehog)" = "$expected" ]'
ok "trufflehog: run from <dir>" 'grep -qx "cwd $r" "$logs/trufflehog.log"'

c=$tmp/clean
git init -q -b main "$c"; ( cd "$c" && echo x > x.txt && git add . && git commit -qm init )
scan both gitleaks "$c"
ok "no changed files -> clean, gitleaks not launched" '[ $code -eq 0 ] && [ "$out" = "clean gitleaks" ] && ! called gitleaks'
scan both trufflehog "$c"
ok "no changed files -> clean, trufflehog not launched" '[ $code -eq 0 ] && [ "$out" = "clean trufflehog" ] && ! called trufflehog'

b=$tmp/based
git init -q -b main "$b"
( cd "$b" && echo k > keep.txt && echo x > x.txt && git add . && git commit -qm init &&
  git switch -q -c feat && echo b > "b 1.txt" && git rm -q keep.txt && echo y >> x.txt &&
  git add . && git commit -qm change && echo dirty > dirty.txt )
scan gitleaks gitleaks "$b" main
ok "with <base>: diff files, no deleted, no uncommitted" '[ $code -eq 0 ] && [ "$(scanned gitleaks)" = "$(printf "%s\n" "b 1.txt" x.txt | sort)" ]'
scan trufflehog trufflehog "$b" main
ok "with <base>: trufflehog gets the same files" '[ "$(scanned trufflehog)" = "$(printf "%s\n" "b 1.txt" x.txt | sort)" ]'
scan gitleaks gitleaks "$b" nobranch
ok "with unknown <base> -> exit 2" '[ $code -eq 2 ] && [ -z "$out" ] && ! called gitleaks'

# AC6: flags
scan gitleaks gitleaks "$r"
ok "gitleaks: dir --no-banner --redact --exit-code 99 --report-format json" 'grep -qx "arg dir" "$logs/gitleaks.log" && grep -qx "arg --no-banner" "$logs/gitleaks.log" && grep -qx "arg --redact" "$logs/gitleaks.log" && has_arg_seq gitleaks --exit-code 99 && has_arg_seq gitleaks --report-format json && grep -qx "arg --report-path" "$logs/gitleaks.log"'
ok "gitleaks: report path outside <dir>" '! grep "^arg --report-path" -A1 "$logs/gitleaks.log" | grep -q "$r"'
ok "gitleaks: no --config/--gitleaks-ignore-path without the files" '! grep -q -e "^arg --config" -e "^arg --gitleaks-ignore-path" "$logs/gitleaks.log"'
scan trufflehog trufflehog "$r"
ok "trufflehog: filesystem --json --no-update --no-verification --fail" '(for f in filesystem --json --no-update --no-verification --fail; do grep -qx "arg $f" "$logs/trufflehog.log" || exit 1; done)'
g=$tmp/gl-config
git init -q -b main "$g"
( cd "$g" && echo "[extend]" > .gitleaks.toml && echo "a.txt:rule:1" > .gitleaksignore && echo a > a.txt &&
  git add . && git commit -qm init && echo b >> a.txt )
scan gitleaks gitleaks "$g"
ok "gitleaks: --config and --gitleaks-ignore-path when present" 'has_arg_seq gitleaks --config .gitleaks.toml && has_arg_seq gitleaks --gitleaks-ignore-path .gitleaksignore'

# AC7: nothing written in the checkout
ok "checkout status unchanged after every run" '[ "$(git -C "$r" status --porcelain -uall)" = "$status_before" ]'

[ "$fails" -eq 0 ] || { echo "$fails failed"; exit 1; }
echo "all passed"
