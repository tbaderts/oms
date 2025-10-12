#!/usr/bin/env bash
set -euo pipefail

# Wrapper script to build and launch the Spring AI MCP server over stdio.
# It builds the project (skipping tests by default for faster startup) and then
# runs the application with the stdio transport property. Extra arguments are
# forwarded to the JVM/Boot application.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

cd "$PROJECT_DIR"

./gradlew -q bootJar -x test

# Prefer the Spring Boot executable jar (exclude the "-plain" classifier jar)
JAR_FILE=$(ls -1 build/libs/*-SNAPSHOT.jar 2>/dev/null | grep -v -- '-plain' | head -n1 || true)

# Fallback: if not found (e.g. naming changed), try any snapshot jar as last resort
if [[ -z "${JAR_FILE}" ]]; then
  JAR_FILE=$(ls -1 build/libs/*-SNAPSHOT.jar 2>/dev/null | head -n1 || true)
fi

if [[ -z "${JAR_FILE}" || ! -f "${JAR_FILE}" ]]; then
  echo "Failed to locate built jar in build/libs" >&2
  exit 1
fi

# Allow override of transport (default stdio)
MCP_TRANSPORT_PROP="--mcp.transport=${MCP_TRANSPORT:-stdio}"

exec java ${JAVA_OPTS:-} -jar "$JAR_FILE" \
  ${SPRING_PROFILES_ACTIVE:+--spring.profiles.active=${SPRING_PROFILES_ACTIVE}} \
  --spring.main.banner-mode=off \
  ${MCP_TRANSPORT_PROP} "$@"
