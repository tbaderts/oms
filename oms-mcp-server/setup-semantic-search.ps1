# Semantic Search Setup Script for Windows PowerShell
# This script sets up the vector database and embedding model

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MCP Semantic Search Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker is installed
Write-Host "Checking Docker..." -ForegroundColor Yellow
$dockerVersion = docker --version 2>$null
if (-not $dockerVersion) {
    Write-Host "❌ Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
Write-Host ""

# Check Docker is running
Write-Host "Checking if Docker is running..." -ForegroundColor Yellow
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker is running" -ForegroundColor Green
Write-Host ""

# Start services
Write-Host "Starting Qdrant and Ollama services..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start services" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Services started" -ForegroundColor Green
Write-Host ""

# Wait for services to be ready
Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check Qdrant
$maxRetries = 10
$retries = 0
$qdrantReady = $false

while (-not $qdrantReady -and $retries -lt $maxRetries) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:6333/healthz" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $qdrantReady = $true
        }
    } catch {
        $retries++
        Start-Sleep -Seconds 2
    }
}

if ($qdrantReady) {
    Write-Host "✅ Qdrant is ready" -ForegroundColor Green
} else {
    Write-Host "⚠️  Qdrant may not be ready yet (check docker-compose logs qdrant)" -ForegroundColor Yellow
}
Write-Host ""

# Check Ollama
$ollamaReady = $false
$retries = 0

while (-not $ollamaReady -and $retries -lt $maxRetries) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:11434/api/version" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $ollamaReady = $true
        }
    } catch {
        $retries++
        Start-Sleep -Seconds 2
    }
}

if ($ollamaReady) {
    Write-Host "✅ Ollama is ready" -ForegroundColor Green
} else {
    Write-Host "⚠️  Ollama may not be ready yet (check docker-compose logs ollama)" -ForegroundColor Yellow
}
Write-Host ""

# Pull embedding model
Write-Host "Pulling embedding model (nomic-embed-text, ~274MB)..." -ForegroundColor Yellow
Write-Host "This may take a few minutes on first run..." -ForegroundColor Gray
docker exec mcp-ollama ollama pull nomic-embed-text

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Embedding model downloaded" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to download embedding model" -ForegroundColor Red
    Write-Host "Try manually: docker exec mcp-ollama ollama pull nomic-embed-text" -ForegroundColor Yellow
}
Write-Host ""

# List available models
Write-Host "Available Ollama models:" -ForegroundColor Cyan
docker exec mcp-ollama ollama list
Write-Host ""

# Check service status
Write-Host "Service Status:" -ForegroundColor Cyan
docker-compose ps
Write-Host ""

# Display next steps
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete! 🎉" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Enable semantic search in application.yml:" -ForegroundColor White
Write-Host "   vector.store.enabled: true" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Build the application:" -ForegroundColor White
Write-Host "   .\gradlew.bat clean build" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Run the MCP server:" -ForegroundColor White
Write-Host "   .\gradlew.bat bootRun" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Check README_SEMANTIC_SEARCH.md for usage examples" -ForegroundColor White
Write-Host ""
Write-Host "Services:" -ForegroundColor Yellow
Write-Host "  - Qdrant UI: http://localhost:6333/dashboard" -ForegroundColor White
Write-Host "  - Qdrant API: http://localhost:6333" -ForegroundColor White
Write-Host "  - Ollama API: http://localhost:11434" -ForegroundColor White
Write-Host ""
Write-Host "To stop services:" -ForegroundColor Yellow
Write-Host "  docker-compose down" -ForegroundColor White
Write-Host ""
