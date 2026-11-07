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

mkdir -p lib spec

cat > main.lua <<'LUA'
local parser = require("lib.parser")

print(parser.parse("a=1"))
LUA

cat > lib/parser.lua <<'LUA'
local M = {}

function M.parse(line)
  local key, value = line:match("^(%w+)=(%w+)$")
  return key, value
end

return M
LUA

cat > spec/parser_spec.lua <<'LUA'
local parser = require("lib.parser")

describe("parser", function()
  it("splits key and value", function()
    local key, value = parser.parse("a=1")
    assert.are.equal("a", key)
    assert.are.equal("1", value)
  end)
end)
LUA
