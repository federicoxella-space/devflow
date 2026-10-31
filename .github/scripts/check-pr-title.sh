#!/usr/bin/env bash
# Controlla che il titolo di una PR sia Conventional Commits con un tipo standard.
# Uso: bash .github/scripts/check-pr-title.sh <title>
set -u
title=${1-}
re='^(feat|fix|docs|chore|refactor|test|ci|perf|build|style|revert)(\([^()]+\))?!?: [^ ].*$'
if [[ "$title" =~ $re ]]; then
  exit 0
fi
{
  echo "Invalid PR title: $title"
  echo "Expected: type(scope)!: subject  (scope and ! are optional)"
  echo "Allowed types: feat, fix, docs, chore, refactor, test, ci, perf, build, style, revert"
} >&2
exit 1
