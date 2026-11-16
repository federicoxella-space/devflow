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

cat > mvnw <<'SH'
#!/bin/sh
exec mvn "$@"
SH
chmod +x mvnw

cat > pom.xml <<'XML'
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>example.com</groupId>
  <artifactId>tool</artifactId>
  <version>0.1.0</version>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
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

mkdir -p src/main/java/com/example/tool src/test/java/com/example/tool

cat > src/main/java/com/example/tool/Greeter.java <<'JAVA'
package com.example.tool;

public final class Greeter {
    private Greeter() {}

    public static String greet(String name) {
        return "hello " + name;
    }
}
JAVA

cat > src/test/java/com/example/tool/GreeterTest.java <<'JAVA'
package com.example.tool;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GreeterTest {
    @Test
    void greetsByName() {
        assertEquals("hello java", Greeter.greet("java"));
    }
}
JAVA
