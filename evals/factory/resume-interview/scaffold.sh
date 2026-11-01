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

mkdir -p factory
cat > factory/config.md <<'EOF'
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
EOF

cat > factory/playbook.md <<'EOF'
# Project playbook

## Definition of Done
- [gate] Build, lint and tests are green.
- [code] Every acceptance criterion has an automated test or a precise manual step.
EOF

cat > .gitignore <<'EOF'
factory/*
!factory/config.md
!factory/playbook.md
!factory/backlog.md
EOF

git add .gitignore factory/config.md factory/playbook.md
git commit -q -m "chore: add factory config and playbook"

cat > cli.py <<'PY'
import argparse

parser = argparse.ArgumentParser(prog="cli")
sub = parser.add_subparsers(dest="command")
sub.add_parser("hello", help="print hello")

args = parser.parse_args()
if args.command == "hello":
    print("hello")
PY

mkdir -p factory/features/002-greeting
cat > factory/board.md <<'BOARD'
# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|
| 002-greeting | Greet command | interview | | | |

## Log
BOARD

cat > factory/features/002-greeting/feature.md <<'FEAT'
Add a `greet` command to `cli.py` that greets the user.
FEAT

cat > factory/features/002-greeting/playbook.md <<'PB'
# 002-greeting — Greet command

## Request
Add a `greet` command to `cli.py` that greets the user.

## Workspace
branch

## Interview
**Q1.** Which language should the greeting use?
**A1.** English only.

## Agent decisions

## Deferred

## Done checklist
PB
