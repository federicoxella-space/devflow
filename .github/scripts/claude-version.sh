#!/usr/bin/env bash
# Stampa la versione di Claude Code scritta nella prima riga dei tipi della mod.
# Uso: bash .github/scripts/claude-version.sh <file>
set -u
file=${1-}
first=$(head -n 1 -- "$file" 2>/dev/null | tr -d '\r')
if [[ "$first" =~ ^//\ Written\ by\ Claude\ Code\ ([0-9]+\.[0-9]+\.[0-9]+)\.$ ]]; then
  echo "${BASH_REMATCH[1]}"
  exit 0
fi
echo "Cannot read the Claude Code version from $file: expected \"// Written by Claude Code X.Y.Z.\" on line 1" >&2
exit 1
