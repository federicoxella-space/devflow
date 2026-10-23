#!/usr/bin/env bash
# Tests for release.sh (factory projects) against a local bare remote, with stubbed `gh` and `curl`.
# Run: bash skills/init/release/test-release.sh   (needs python for the JSON check)
set -u
src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
export GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export STUB=$tmp/stub REMOTE=$tmp/remote.git
mkdir -p "$STUB/notes" "$tmp/bin"

# gh stub: `release create <tag> --target <sha> --notes <n>` creates the tag on the remote (fails
# with "already exists" if taken, or once when $STUB/race exists: it then creates $RACE_TAG on
# $RACE_SHA first); `release view <tag> --json body -q .body`; `release edit <tag> --notes <n>`.
cat > "$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
sub="$1 $2"; tag=$3; shift 3
while [ $# -gt 0 ]; do case $1 in --target) sha=$2; shift 2 ;; --notes) notes=$2; shift 2 ;; *) shift ;; esac; done
case $sub in
  "release create")
    if [ -e "$STUB/race" ]; then
      rm "$STUB/race"; git --git-dir="$REMOTE" tag "$RACE_TAG" "$RACE_SHA"; printf '%s' "$RACE_NOTES" > "$STUB/notes/$RACE_TAG"
      echo "HTTP 422: Validation Failed (already_exists)" >&2; exit 1
    fi
    if git --git-dir="$REMOTE" rev-parse -q --verify "refs/tags/$tag" > /dev/null; then echo "already_exists" >&2; exit 1; fi
    git --git-dir="$REMOTE" tag "$tag" "$sha"; printf '%s' "$notes" > "$STUB/notes/$tag"; echo "create $tag" >> "$STUB/log" ;;
  "release view") cat "$STUB/notes/$tag" ;;
  "release edit") printf '%s' "$notes" > "$STUB/notes/$tag"; echo "edit $tag" >> "$STUB/log" ;;
esac
GH

# curl stub for the GitLab Releases API: POST .../releases creates the tag (409 if taken) and keeps
# the JSON in $STUB/gitlab-<tag>.json; prints the HTTP code like --write-out '%{http_code}'.
cat > "$tmp/bin/curl" <<'CURL'
#!/usr/bin/env bash
method=GET; out=/dev/null
while [ $# -gt 0 ]; do case $1 in -X|--request) method=$2; shift 2 ;; --data|--data-binary) data=${2#@}; shift 2 ;;
  -o|--output) out=$2; shift 2 ;; -H|--header|-w|--write-out) shift 2 ;; http*) url=$1; shift ;; *) shift ;; esac; done
command -v cygpath > /dev/null && data=$(cygpath -m "$data")   # Windows python and /tmp paths
if [ "$method" = POST ]; then
  tag=$(python -c "import json,sys;print(json.load(open(sys.argv[1]))['tag_name'])" "$data") || { echo 400; exit 0; }
  ref=$(python -c "import json,sys;print(json.load(open(sys.argv[1]))['ref'])" "$data")
  if git --git-dir="$REMOTE" rev-parse -q --verify "refs/tags/$tag" > /dev/null; then echo '{"message":"Release already exists"}' > "$out"; echo 409; exit 0; fi
  git --git-dir="$REMOTE" tag "$tag" "$ref"; cp "$data" "$STUB/gitlab-$tag.json"; echo "create $tag" >> "$STUB/log"; echo '{}' > "$out"; echo 201
fi
CURL
chmod +x "$tmp/bin/gh" "$tmp/bin/curl"
export PATH="$tmp/bin:$PATH"

ok() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fails=$((fails + 1)); fi; }
tag_at() { git --git-dir="$REMOTE" tag --points-at "$1"; }
creates() { grep -c create "$STUB/log" 2>/dev/null || echo 0; }

git init -q --bare -b main "$REMOTE"
git clone -q "$REMOTE" "$tmp/c" 2>/dev/null
cd "$tmp/c"
commit() { echo "$1" > "$1.txt"; git add "$1.txt"; git commit -qm "$1"; git push -q origin main; git rev-parse HEAD; }

run_gh() { # run_gh <sha> <title> <number>
  RELEASE_FORGE=github RELEASE_SHA=$1 PR_TITLE=$2 PR_BODY='' PR_NUMBER=$3 bash "$src/release.sh" > "$tmp/out" 2>&1
}
run_gl() { # run_gl <sha> <commit message>
  RELEASE_FORGE=gitlab RELEASE_SHA=$1 CI_COMMIT_MESSAGE=$2 CI_API_V4_URL=https://gitlab.test/api/v4 \
    CI_PROJECT_ID=7 CI_JOB_TOKEN=x bash "$src/release.sh" > "$tmp/out" 2>&1
}

# 1. first release: non-SemVer tags are ignored
c1=$(commit one)
git --git-dir="$REMOTE" tag release-2024 "$c1"; git --git-dir="$REMOTE" tag v1.2 "$c1"
run_gh "$c1" 'feat: a' 5
ok "first release v0.1.0 on c1" '[ "$(tag_at "$c1" | grep -x v0.1.0)" = v0.1.0 ]'
ok "notes with PR number" '[ "$(cat "$STUB/notes/v0.1.0")" = "- feat: a (#5)" ]'

# 2. next release
c2=$(commit two)
run_gh "$c2" 'fix: b' 6
ok "patch release v0.1.1 on c2" '[ "$(tag_at "$c2")" = v0.1.1 ]'

# 3. re-run of a released commit
run_gh "$c2" 'fix: b' 6
ok "re-run creates nothing" '[ "$(creates)" -eq 2 ]'

# 4. out of order: a later merge (c4) is released first while c3 is creating its release
c3=$(commit three); c4=$(commit four)
touch "$STUB/race"
RACE_TAG=v0.2.0 RACE_SHA=$c4 RACE_NOTES='- feat: d (#8)' run_gh "$c3" 'feat: c' 7
ok "out of order: no tag on c3" '[ -z "$(tag_at "$c3")" ]'
ok "out of order: note appended to v0.2.0" 'grep -qxF -- "- feat: c (#7)" "$STUB/notes/v0.2.0" && grep -qxF -- "- feat: d (#8)" "$STUB/notes/v0.2.0"'

# 5. GitLab merge commit (default template): title on the third line, MR number, JSON escaping
c5=$(commit five)
run_gl "$c5" $'Merge branch \'f\' into \'main\'\n\nfeat(api): x "q" \\ y\n\nSee merge request grp/proj!12'
expected='- feat(api): x "q" \ y (!12)'
ok "gitlab: v0.3.0 on c5" '[ "$(tag_at "$c5")" = v0.3.0 ]'
ok "gitlab: valid JSON, ref and description" 'python -c "
import json,sys
d=json.load(open(sys.argv[1]))
assert d[\"ref\"]==sys.argv[2] and d[\"description\"]==sys.argv[3], d
" "$STUB/gitlab-v0.3.0.json" "$c5" "$expected"'

# 6. GitLab commit that is not a merge commit
c6=$(commit six)
run_gl "$c6" 'fix: plain'
ok "gitlab: plain commit v0.3.1, note without number" '[ "$(tag_at "$c6")" = v0.3.1 ] && python -c "
import json,sys; assert json.load(open(sys.argv[1]))[\"description\"]==\"- fix: plain\"" "$STUB/gitlab-v0.3.1.json"'

[ "$fails" -eq 0 ] || { echo "$fails failed"; exit 1; }
echo "all passed"
