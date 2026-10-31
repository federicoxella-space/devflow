#!/usr/bin/env bash
set -eu

git init -q -b main
git config user.name eval
git config user.email eval@example.invalid
git config commit.gpgsign false

cat > go.mod <<'MOD'
module example.com/tool

go 1.22
MOD

cat > main.go <<'GO'
package main

import "fmt"

func Greet(name string) string {
	return "hello " + name
}

func main() {
	fmt.Println(Greet("world"))
}
GO

cat > main_test.go <<'GO'
package main

import "testing"

func TestGreet(t *testing.T) {
	if got := Greet("go"); got != "hello go" {
		t.Fatalf("unexpected greeting: %q", got)
	}
}
GO
