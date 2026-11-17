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

cat > gradlew <<'SH'
#!/bin/sh
exec gradle "$@"
SH
chmod +x gradlew

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

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
KTS

mkdir -p src/main/kotlin src/test/kotlin

cat > src/main/kotlin/Main.kt <<'KT'
fun greet(name: String): String = "hello " + name

fun main() {
    println(greet("world"))
}
KT

cat > src/test/kotlin/MainTest.kt <<'KT'
import kotlin.test.Test
import kotlin.test.assertEquals

class MainTest {
    @Test
    fun greetsByName() {
        assertEquals("hello kotlin", greet("kotlin"))
    }
}
KT
