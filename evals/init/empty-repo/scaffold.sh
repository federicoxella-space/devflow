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

cat > README.md <<'MD'
# new-project
MD

cat > LICENSE <<'TXT'
MIT License

Copyright (c) 2026 eval

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
TXT
