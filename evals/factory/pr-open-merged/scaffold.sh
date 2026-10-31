set -eu

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

git init -q --bare remote.git
echo "remote.git/" >> .git/info/exclude
git remote add origin "$PWD/remote.git"
git push -q origin main

git switch -q -c feature/001-hello
echo "hello" > hello.txt
git add hello.txt
git commit -q -m "feat: add hello file"
git push -q origin feature/001-hello

git switch -q main
git merge -q --no-ff -m "Merge feature/001-hello" feature/001-hello
git push -q origin main
git reset -q --hard HEAD~1

mkdir -p factory/features/001-hello
cat > factory/board.md <<'BOARD'
# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|
| 001-hello | Hello file | pr-open | 1 | feature/001-hello | - |

## Log
BOARD

cat > factory/features/001-hello/feature.md <<'FEAT'
Add a hello.txt file with a greeting.
FEAT

cat > factory/features/001-hello/playbook.md <<'PB'
# 001-hello — Hello file

## Request
Add a hello.txt file with a greeting.

## Workspace
branch

## Interview
No questions needed.

## Agent decisions

## Deferred

## Done checklist
PB
