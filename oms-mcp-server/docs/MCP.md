# MCP Setup Guide

Complete guide for connecting the Spring AI MCP Server to GitHub Copilot and Claude Desktop.

---

## Table of Contents

1. [What is MCP?](#what-is-mcp)
2. [Available Tools](#available-tools)
3. [GitHub Copilot Setup (VS Code)](#github-copilot-setup-vs-code)
4. [Claude Desktop Setup](#claude-desktop-setup)
5. [Configuration](#configuration)
6. [Using the Tools](#using-the-tools)
7. [Troubleshooting](#troubleshooting)

---

## What is MCP?

**Model Context Protocol (MCP)** is an open protocol that enables AI assistants (like GitHub Copilot and Claude) to access external tools and data sources.

**How it works:**
- MCP servers expose "tools" via JSON-RPC over stdio (or other transports)
- AI assistants launch your server, discover available tools, and call them as needed
- Tools can read files, search data, query APIs, etc.

**This MCP server provides:**
- Access to your OMS specification documents
- Keyword and semantic search across documentation
- OMS backend query capabilities
- Health check utilities

---

## Available Tools

The server exposes **10 MCP tools** across 4 categories:

### Domain Knowledge Tools (6)
- **`listDomainDocs`** - List all available specification documents with metadata
- **`readDomainDoc`** - Read full document content (with pagination support)
- **`searchDomainDocs`** - Keyword search across all documents
- **`listDocSections`** - Get document table of contents (all headings)
- **`readDocSection`** - Read specific section by title
- **`searchDocSections`** - Search within document sections for precision

### Semantic Search Tools (2 - Optional)
- **`semanticSearchDocs`** - Vector-based semantic search (requires Docker setup)
- **`getVectorStoreInfo`** - Check vector database status

### OMS Query Tools (1)
- **`searchOrders`** - Query OMS backend with filters, pagination, sorting

### Health Check (1)
- **`ping`** - Verify server connectivity

**See [TOOL_USAGE_EXAMPLES.md](TOOL_USAGE_EXAMPLES.md) for complete usage examples.**

---

## GitHub Copilot Setup (VS Code)

### Windows Setup

**1. Create `.vscode/mcp.json` in your workspace:**

```json
{
  "servers": {
    "oms-mcp-server": {
      "type": "stdio",
      "command": "powershell.exe",
      "args": [
        "-ExecutionPolicy", "Bypass",
        "-File", "${workspaceFolder}\\run-mcp.ps1"
      ],
      "env": {
        "SPRING_PROFILES_ACTIVE": "mcp",
        "MCP_TRANSPORT": "stdio"
      },
      "description": "Spring AI MCP server with OMS specs and query tools"
    }
  }
}
```

**2. Reload VS Code window**
- Press `F1` or `Ctrl+Shift+P`
- Type "Developer: Reload Window"
- Or restart VS Code

**3. Verify Connection**

In GitHub Copilot Chat:
```
@workspace What MCP tools are available?
```

You should see all 10 tools: `listDomainDocs`, `readDomainDoc`, `searchDomainDocs`, `listDocSections`, `readDocSection`, `searchDocSections`, `semanticSearchDocs`, `getVectorStoreInfo`, `searchOrders`, `ping`

### Linux/macOS Setup

**1. Create `~/.config/github-copilot/mcp.json`:**

```json
{
  "mcpServers": {
    "oms-mcp-server": {
      "command": "bash",
      "args": [
        "-lc",
        "cd /path/to/mcp-server-lib && ./run-mcp.sh"
      ],
      "env": {
        "JAVA_TOOL_OPTIONS": "-Xmx512m",
        "MCP_TRANSPORT": "stdio",
        "SPRING_PROFILES_ACTIVE": "mcp"
      },
      "description": "Spring AI MCP server with OMS specs and query tools"
    }
  }
}
```

**Note:** Update `/path/to/mcp-server-lib` to your actual path.

**2. Reload VS Code** and verify as above.

---

## Claude Desktop Setup

### Windows Setup

**1. Locate Claude Desktop config:**
- `%APPDATA%\Claude\claude_desktop_config.json`
- Or: `C:\Users\<YourName>\AppData\Roaming\Claude\claude_desktop_config.json`

**2. Add MCP server configuration:**

```json
{
  "mcpServers": {
    "oms-mcp-server": {
      "command": "powershell.exe",
      "args": [
        "-ExecutionPolicy", "Bypass",
        "-File", "C:\\path\\to\\mcp-server-lib\\run-mcp.ps1"
      ],
      "env": {
        "SPRING_PROFILES_ACTIVE": "mcp",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

**Note:** Use full absolute path and double backslashes (`\\`) in Windows paths.

### Linux/macOS Setup

**1. Create `~/.config/Claude/claude_desktop_config.json`:**

```json
{
  "mcpServers": {
    "oms-mcp-server": {
      "command": "bash",
      "args": [
        "-lc",
        "cd /path/to/mcp-server-lib && ./run-mcp.sh"
      ],
      "env": {
        "JAVA_TOOL_OPTIONS": "-Xmx512m",
        "MCP_TRANSPORT": "stdio",
        "SPRING_PROFILES_ACTIVE": "mcp"
      }
    }
  }
}
```

**2. Restart Claude Desktop**

**3. Verify in Claude:**
- Open a new chat
- "List available MCP tools"
- You should see all 10 tools

---

## Configuration

### Document Paths

**Default:** The server scans `oms/specs` by default (configured in `application.yml`)

**To add more directories:**

**Option 1: Environment Variable**

```json
"env": {
  "SPRING_PROFILES_ACTIVE": "mcp",
  "MCP_TRANSPORT": "stdio",
  "DOMAIN_DOCS_PATHS": "C:/data/oms/specs,C:/data/team-docs,C:/data/manifesto"
}
```

**Option 2: application.yml**

```yaml
domain:
  docs:
    paths: "C:/data/oms/specs,C:/data/team-docs,C:/data/manifesto"
```

**Supported formats:** `.md`, `.markdown`, `.txt`, `.adoc`

### Memory Configuration

For large document sets, increase JVM memory:

```json
"env": {
  "JAVA_TOOL_OPTIONS": "-Xmx1024m",
  "SPRING_PROFILES_ACTIVE": "mcp"
}
```

### Semantic Search (Optional)

To enable semantic search tools, see [README_SEMANTIC_SEARCH.md](README_SEMANTIC_SEARCH.md) for Docker setup.

---

## Using the Tools

### Discovery

```
@workspace What MCP tools are available?
@workspace List all domain documentation files
```

### Reading Documents

```
@workspace Read the OMS specification
@workspace Show me the table of contents for specs/oms_spec.md
@workspace Read the "Domain Model" section from the OMS spec
```

### Searching

**Keyword Search:**
```
@workspace Search specs for "state machine"
@workspace Which documents mention "PostgreSQL"?
@workspace Find sections about "validation rules"
```

**Semantic Search (if enabled):**
```
@workspace Use semantic search to find information about error handling
@workspace How do we handle transaction failures? (semantic search)
```

### Querying OMS

```
@workspace Find all BUY orders for symbol INTC
@workspace Search for orders with price > 20 in the last week
```

### Complete Examples

See [TOOL_USAGE_EXAMPLES.md](TOOL_USAGE_EXAMPLES.md) for comprehensive usage examples with all 10 tools.

---

## Troubleshooting

### Tools Not Showing Up

**Check MCP config:**
- Windows: `.vscode/mcp.json` in workspace root
- Linux/macOS: `~/.config/github-copilot/mcp.json`

**Verify server starts:**
```powershell
# Windows
.\run-mcp.ps1

# Linux/macOS
./run-mcp.sh
```

You should see:
```
Starting Spring AI MCP Server...
MCP Transport: stdio
```

### Connection Errors

**Check Java version:**
```powershell
java -version
```
Must be Java 21+

**Check Gradle:**
```powershell
.\gradlew --version
```

**Rebuild:**
```powershell
.\gradlew clean build -x test
```

### Tool Not Found Errors

**Verify tool registration:**

In Copilot Chat:
```
@workspace ping the MCP server
```

If `ping` works but other tools don't, check `application.yml` for disabled tools.

### Memory Issues

**Symptoms:** Server crashes, "OutOfMemoryError"

**Solution:** Increase JVM memory in config:

```json
"env": {
  "JAVA_TOOL_OPTIONS": "-Xmx1024m"
}
```

### Path Issues (Windows)

**Symptoms:** "File not found", "Cannot find path"

**Solution:** Use double backslashes in JSON:

```json
"args": ["C:\\path\\to\\run-mcp.ps1"]
```

Or use forward slashes:
```json
"args": ["C:/path/to/run-mcp.ps1"]
```

### Semantic Search Not Working

**Symptoms:** `semanticSearchDocs` tool not available

**Cause:** Docker containers not running

**Solution:** See [README_SEMANTIC_SEARCH.md](README_SEMANTIC_SEARCH.md) for setup:

```powershell
docker-compose up -d
.\setup-semantic-search.ps1
```

### Document Not Found

**Symptoms:** "Document not found: specs/my_spec.md"

**Check:**
1. File exists in specified path
2. Path is relative to `domain.docs.paths` configured directories
3. File extension is supported (.md, .markdown, .txt, .adoc)

**Debug:**
```
@workspace List all domain docs
```

Should show all indexed documents with their paths.

### Logs

**View server logs:**

```powershell
Get-Content logs/spring-ai.log -Tail 50
```

**Enable debug logging:**

In `src/main/resources/application.yml`:
```yaml
logging:
  level:
    org.example.spring_ai: DEBUG
```

---

## Next Steps

1. **Explore Tools** - Try all 10 tools with [TOOL_USAGE_EXAMPLES.md](TOOL_USAGE_EXAMPLES.md)
2. **Add Your Docs** - Configure `DOMAIN_DOCS_PATHS` to include your specifications
3. **Enable Semantic Search** - Follow [README_SEMANTIC_SEARCH.md](README_SEMANTIC_SEARCH.md)
4. **Query OMS** - Use `searchOrders` to explore backend data
5. **Share Setup** - Export your config for team members

---

## Resources

- [Main README](../README.md) - Project overview
- [TOOL_USAGE_EXAMPLES.md](TOOL_USAGE_EXAMPLES.md) - Complete usage guide
- [README_SEMANTIC_SEARCH.md](README_SEMANTIC_SEARCH.md) - Vector search setup
- [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) - 5-minute quickstart
- [MCP Specification](https://spec.modelcontextprotocol.io/) - Official MCP docs
