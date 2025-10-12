#!/bin/bash
# Semantic Search Setup Script for Linux/macOS
# This script sets up the vector database and embedding model

set -e

echo "========================================"
echo "MCP Semantic Search Setup"
echo "========================================"
echo ""

# Check Docker is installed
echo "Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi
echo "✅ Docker found: $(docker --version)"
echo ""

# Check Docker is running
echo "Checking if Docker is running..."
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi
echo "✅ Docker is running"
echo ""

# Start services
echo "Starting Qdrant and Ollama services..."
docker-compose up -d
echo "✅ Services started"
echo ""

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 10

# Check Qdrant
echo "Checking Qdrant..."
max_retries=10
retries=0
qdrant_ready=false

while [ "$qdrant_ready" != "true" ] && [ $retries -lt $max_retries ]; do
    if curl -s http://localhost:6333/healthz > /dev/null 2>&1; then
        qdrant_ready=true
        echo "✅ Qdrant is ready"
    else
        retries=$((retries + 1))
        sleep 2
    fi
done

if [ "$qdrant_ready" != "true" ]; then
    echo "⚠️  Qdrant may not be ready yet (check docker-compose logs qdrant)"
fi
echo ""

# Check Ollama
echo "Checking Ollama..."
retries=0
ollama_ready=false

while [ "$ollama_ready" != "true" ] && [ $retries -lt $max_retries ]; do
    if curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
        ollama_ready=true
        echo "✅ Ollama is ready"
    else
        retries=$((retries + 1))
        sleep 2
    fi
done

if [ "$ollama_ready" != "true" ]; then
    echo "⚠️  Ollama may not be ready yet (check docker-compose logs ollama)"
fi
echo ""

# Pull embedding model
echo "Pulling embedding model (nomic-embed-text, ~274MB)..."
echo "This may take a few minutes on first run..."
docker exec mcp-ollama ollama pull nomic-embed-text
echo "✅ Embedding model downloaded"
echo ""

# List available models
echo "Available Ollama models:"
docker exec mcp-ollama ollama list
echo ""

# Check service status
echo "Service Status:"
docker-compose ps
echo ""

# Display next steps
echo "========================================"
echo "Setup Complete! 🎉"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Enable semantic search in application.yml:"
echo "   vector.store.enabled: true"
echo ""
echo "2. Build the application:"
echo "   ./gradlew clean build"
echo ""
echo "3. Run the MCP server:"
echo "   ./gradlew bootRun"
echo ""
echo "4. Check README_SEMANTIC_SEARCH.md for usage examples"
echo ""
echo "Services:"
echo "  - Qdrant UI: http://localhost:6333/dashboard"
echo "  - Qdrant API: http://localhost:6333"
echo "  - Ollama API: http://localhost:11434"
echo ""
echo "To stop services:"
echo "  docker-compose down"
echo ""
