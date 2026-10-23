#!/usr/bin/env bash
# Tests for release.sh against a local bare remote, with a stubbed `gh`.
# Run: bash .github/scripts/test-release.sh
set -u
src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
export GH_LOG=$tmp/gh.log GIT_CONFIG_NOSYSTEM=1
: > "$GH_LOG"

# gh stub: logs `release create <tag>`; `release view <tag>` succeeds only if created; GH_FAIL=1 fails create
mkdir "$tmp/bin"
cat > "$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
case "$1 $2" in
  "release view") grep -qx "create $3" "$GH_LOG" ;;
  "release create") [ "${GH_FAIL:-0}" = 1 ] && exit 1; echo "create $3" >> "$GH_LOG" ;;
esac
GH
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"

ok() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fails=$((fails + 1)); fi; }

# remote with plugin.json 0.6.0, changelog and tag v0.6.0
git init -q --bare -b main "$tmp/remote.git"
git clone -q "$tmp/remote.git" "$tmp/seed" 2>/dev/null
( cd "$tmp/seed" && mkdir .claude-plugin &&
  printf '{\n  "name": "devflow",\n  "version": "0.6.0",\n  "description": "x"\n}\n' > .claude-plugin/plugin.json &&
  printf '# Changelog\n\n## v0.6.0 — 2026-10-23\n- feat: old (#2)\n' > CHANGELOG.md &&
  git add . && git -c user.name=t -c user.email=t@t commit -qm init && git tag -a v0.6.0 -m v0.6.0 &&
  git push -q origin main v0.6.0 )
git clone -q "$tmp/remote.git" "$tmp/a"
git clone -q "$tmp/remote.git" "$tmp/b"

run() { # run <clone> <number> <title>
  ( cd "$tmp/$1" && PR_NUMBER=$2 PR_TITLE=$3 PR_BODY='' bash "$src/release.sh" ) > "$tmp/out" 2>&1
}
remote_file() { git --git-dir="$tmp/remote.git" show "main:$1"; }

# 1. race: while clone a pushes #10, clone b releases #11 first -> a retries on top of it
cat > "$tmp/a/.git/hooks/pre-push" <<HOOK
#!/usr/bin/env bash
[ -e "$tmp/raced" ] && exit 0
touch "$tmp/raced"
cd "$tmp/b" && env -u GIT_DIR -u GIT_INDEX_FILE -u GIT_WORK_TREE PR_NUMBER=11 PR_TITLE='feat: b' PR_BODY='' bash "$src/release.sh" > "$tmp/out-b" 2>&1
HOOK
chmod +x "$tmp/a/.git/hooks/pre-push"
run a 10 'fix: a'
ok "race: push rejected once, then retried" 'grep -q "push rejected (attempt 1)" "$tmp/out" && grep -q "released v0.7.1" "$tmp/out"'
ok "race: version 0.7.1 on remote" 'remote_file .claude-plugin/plugin.json | grep -q "\"version\": \"0.7.1\""'
ok "race: both entries in changelog" 'remote_file CHANGELOG.md | grep -q "(#10)$" && remote_file CHANGELOG.md | grep -q "(#11)$"'
ok "race: tags v0.7.0 and v0.7.1" 'git --git-dir="$tmp/remote.git" tag | grep -qx v0.7.0 && git --git-dir="$tmp/remote.git" tag | grep -qx v0.7.1'
ok "race: two GitHub releases" '[ "$(grep -c create "$GH_LOG")" -eq 2 ]'
rm "$tmp/a/.git/hooks/pre-push"

# 2. gh fails after the push -> a re-run creates the missing GitHub Release
GH_FAIL=1 run a 12 'fix: c'; code=$?
ok "gh failure: run fails" '[ $code -ne 0 ]'
ok "gh failure: no release yet" '! grep -qx "create v0.7.2" "$GH_LOG"'
run a 12 'fix: c'
ok "gh failure: re-run creates v0.7.2" 'grep -qx "create v0.7.2" "$GH_LOG"'

# 3. re-run of a fully released PR does nothing
before=$(git --git-dir="$tmp/remote.git" rev-parse main)
run a 12 'fix: c'
ok "re-run: remote unchanged" '[ "$(git --git-dir="$tmp/remote.git" rev-parse main)" = "$before" ]'
ok "re-run: no duplicate release" '[ "$(grep -c "create v0.7.2" "$GH_LOG")" -eq 1 ]'

[ "$fails" -eq 0 ] || { echo "$fails failed"; exit 1; }
echo "all passed"
