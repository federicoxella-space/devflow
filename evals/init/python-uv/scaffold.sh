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

cat > pyproject.toml <<'TOML'
[project]
name = "tool"
version = "0.1.0"
requires-python = ">=3.11"

[tool.ruff]
line-length = 100

[tool.mypy]
strict = true
TOML

printf 'version = 1\n' > uv.lock

cat > tool.py <<'PY'
def greet(name: str) -> str:
    return "hello " + name
PY

cat > test_tool.py <<'PY'
from tool import greet


def test_greet() -> None:
    assert greet("py") == "hello py"
PY
