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

: > mvnw

cat > pom.xml <<'XML'
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>example.com</groupId>
  <artifactId>tool</artifactId>
  <version>0.1.0</version>
  <build>
    <plugins>
      <plugin>
        <artifactId>maven-checkstyle-plugin</artifactId>
        <version>3.3.1</version>
      </plugin>
      <plugin>
        <artifactId>maven-pmd-plugin</artifactId>
        <version>3.21.2</version>
      </plugin>
    </plugins>
  </build>
</project>
XML
