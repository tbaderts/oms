# PowerShell wrapper script to build and launch the Spring AI MCP server over stdio.
# It builds the project (skipping tests by default for faster startup) and then
# runs the application with the stdio transport property. Extra arguments are
# forwarded to the JVM/Boot application.

$ErrorActionPreference = "Stop"

$ProjectDir = $PSScriptRoot
Set-Location $ProjectDir

# Build the project
& "$ProjectDir\gradlew.bat" -q bootJar -x test

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}

# Find the Spring Boot executable jar (exclude the "-plain" classifier jar)
$JarFile = Get-ChildItem -Path "$ProjectDir\build\libs" -Filter "*-SNAPSHOT.jar" |
    Where-Object { $_.Name -notlike "*-plain*" } |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $JarFile -or -not (Test-Path $JarFile)) {
    Write-Error "Failed to locate built jar in build/libs"
    exit 1
}

# Allow override of transport (default stdio)
$McpTransport = if ($env:MCP_TRANSPORT) { $env:MCP_TRANSPORT } else { "stdio" }
$TransportArg = "--mcp.transport=$McpTransport"

# Build arguments
$JavaArgs = @()
if ($env:JAVA_OPTS) {
    $JavaArgs += $env:JAVA_OPTS -split ' '
}
$JavaArgs += "-jar", $JarFile

if ($env:SPRING_PROFILES_ACTIVE) {
    $JavaArgs += "--spring.profiles.active=$($env:SPRING_PROFILES_ACTIVE)"
}

$JavaArgs += "--spring.main.banner-mode=off", $TransportArg
$JavaArgs += $args

# Execute
& java $JavaArgs
