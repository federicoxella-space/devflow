#!/usr/bin/env bash
set -eu

if [ -n "$(ls -A)" ]; then
  echo "scaffold.sh: the current directory is not empty; run it only through claude plugin eval --scaffold" >&2
  exit 1
fi

git init -q -b main
git config user.name eval
git config user.email eval@example.invalid
git config commit.gpgsign false

mkdir -p factory src
cat > factory/config.md <<'CFG'
---
base_branch: main
forge: git
build: ""
lint: ""
test: ""
ui_review: none
release: "off"
workspace: branch
---
Eval fixture project.
CFG

cat > factory/playbook.md <<'PB'
# Project playbook

## Conventions
- Legacy helpers live in `src/legacy/old.ts`; new code must not import from it.
- The entry point is `src/app.ts`.
PB

cat > factory/board.md <<'BOARD'
# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|

## Log
BOARD

cat > src/app.ts <<'TS'
export function main(): void {
  console.log('hello');
}
TS

cat > .gitignore <<'GI'
factory/*
!factory/config.md
!factory/playbook.md
!factory/backlog.md
GI

git add .gitignore factory/config.md factory/playbook.md src/app.ts
git commit -q -m "chore: add factory config and playbook"
