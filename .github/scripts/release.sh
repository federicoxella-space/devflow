#!/usr/bin/env bash
# Releases one merged pull request: bumps .claude-plugin/plugin.json (see next-version.sh), adds a
# CHANGELOG.md entry, commits `chore(release): vX.Y.Z`, tags, pushes main and the tag atomically,
# creates the GitHub Release. Retries from a fresh origin/main when another push gets there first.
# Env: PR_TITLE, PR_BODY, PR_NUMBER. Runs in the repo root, with `origin` writable and `gh` logged in.
set -euo pipefail

dir=$(cd "$(dirname "$0")" && pwd)
plugin=.claude-plugin/plugin.json
body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT
printf '%s' "$PR_BODY" > "$body_file"
entry="- $PR_TITLE (#$PR_NUMBER)"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

for attempt in 1 2 3 4 5; do
  git fetch -q --tags origin main
  git checkout -q -B main origin/main

  # Already released (re-run): only make sure the GitHub Release exists.
  if line=$(grep -n "(#$PR_NUMBER)\$" CHANGELOG.md | head -1); then
    tag=$(head -n "${line%%:*}" CHANGELOG.md | grep '^## v' | tail -1 | cut -d' ' -f2)
    if gh release view "$tag" > /dev/null 2>&1; then
      echo "PR #$PR_NUMBER is already released as $tag, nothing to do"
    else
      gh release create "$tag" --title "$tag" --notes "${line#*:}"
    fi
    exit 0
  fi

  current=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$plugin")
  last_tag=$(git tag -l 'v*' --sort=-v:refname | head -1)
  next=$(bash "$dir/next-version.sh" "$PR_TITLE" "$body_file" "$current" "${last_tag#v}")
  if git rev-parse -q --verify "refs/tags/v$next" > /dev/null; then
    echo "v$next already exists, nothing to release"
    exit 0
  fi

  sed -i "s/^\( *\"version\": *\"\)[^\"]*\"/\1$next\"/" "$plugin"
  ENTRY=$entry HEAD_LINE="## v$next — $(date -u +%F)" awk '
    NR == 1 { print; print ""; print ENVIRON["HEAD_LINE"]; print ENVIRON["ENTRY"]; print ""; next }
    NR == 2 && $0 == "" { next }
    { print }
  ' CHANGELOG.md > CHANGELOG.tmp
  mv CHANGELOG.tmp CHANGELOG.md

  git add "$plugin" CHANGELOG.md
  git commit -q -m "chore(release): v$next"
  git tag -a "v$next" -m "v$next"
  if git push -q --atomic origin main "v$next"; then
    gh release create "v$next" --title "v$next" --notes "$entry"
    echo "released v$next"
    exit 0
  fi

  echo "push rejected (attempt $attempt), retrying on the new main"
  git tag -d "v$next" > /dev/null
  sleep $((attempt * 2))
done

echo "could not push the release after 5 attempts" >&2
exit 1
