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

: > gradlew

cat > settings.gradle.kts <<'KTS'
rootProject.name = "tool"
KTS

cat > build.gradle.kts <<'KTS'
plugins {
    kotlin("jvm") version "2.0.0"
    id("com.diffplug.spotless") version "6.25.0"
    id("io.gitlab.arturbosch.detekt") version "1.23.6"
}

repositories {
    mavenCentral()
}
KTS
