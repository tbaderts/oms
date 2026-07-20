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
- Hybrid search (BM25 + semantic) over the OMS knowledge base with stable citations
- Full-document and section-level reading
- Every knowledge base doc as an MCP resource (`kb://...`), plus spec-driven prompts
- OMS backend query capabilities
- Health check utilities

---

## Available Tools

The server exposes **5 MCP tools**:

### Knowledge Base Tools (3)
- **`getKnowledgeBaseOverview`** - Index of all docs with metadata, summaries and section anchors
- **`searchKnowledgeBase`** - Hybrid BM25 + semantic search with `path#anchor` citations
- **`readKnowledgeBase`** - Read a whole doc (with outline) or one cited section

### OMS Query Tools (1)
- **`searchOrders`** - Query OMS backend with filters, pagination, sorting

### Health Check (1)
- **`ping`** - Verify server connectivity

### MCP Resources & Prompts
- Resources: every KB doc as `kb://oms-knowledge-base/<path>` (attachable in supporting clients)
- Prompts: `implement-from-spec`, `validate-against-spec`

**See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for the full tool signatures and [ARCHITECTURE.md](ARCHITECTURE.md) for how agents use them.**

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

You should see all 5 tools: `getKnowledgeBaseOverview`, `searchKnowledgeBase`, `readKnowledgeBase`, `searchOrders`, `ping`

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
- You should see all 5 tools

### Claude Code

Add to `.mcp.json` in the repository root:

```json
{
  "mcpServers": {
    "oms-knowledge": {
      "command": "powershell.exe",
      "args": ["-ExecutionPolicy", "Bypass", "-File", "C:\\data\\workspace\\oms\\oms-mcp-server\\run-mcp.ps1"]
    }
  }
}
```

Then `/mcp` in Claude Code shows the server, its tools, resources and prompts.

---

## Configuration

### Document Paths

**Default:** The server scans `../oms-knowledge-base` (configured in `application.yml`)

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

Semantic search needs only a local Ollama install (no Docker):

```bash
ollama pull mxbai-embed-large
```

Without it, search automatically runs BM25-only — still fully functional.

---

## Using the Tools

### Discovery

```
@workspace What MCP tools are available?
@workspace Give me an overview of the OMS knowledge base
```

### Reading Documents

```
@workspace Read the order lifecycle spec
@workspace Read section #4-state-transition-details of order-lifecycle.md
```

### Searching

```
@workspace Search the knowledge base for "state machine guards"
@workspace What do the specs say about validation rules? Cite sections.
```

### Querying OMS

```
@workspace Find all BUY orders for symbol INTC
@workspace Search for orders with price > 20 in the last week
```

### Complete Examples

See [ARCHITECTURE.md](ARCHITECTURE.md) for the agent workflow (orient → search → read → cite) and [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for tool signatures.

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
Must be Java 25+ (the Gradle toolchain resolves it for the build)

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

### Search Says "BM25 keyword only"

**Cause:** Ollama not reachable, or the embedding model is not pulled.

**Solution (optional — keyword search is fully functional):**

```bash
ollama pull mxbai-embed-large
```

Then restart the server. The startup log shows
`vector search: enabled, 1024-dim mxbai-embed-large` when hybrid search is active.

### Document Not Found

**Symptoms:** "Document not found: oms-knowledge-base/my_spec.md"

**Check:**
1. File exists in specified path
2. Path is relative to `domain.docs.paths` configured directories
3. File extension is supported (.md, .markdown, .txt, .adoc)

**Debug:**
```
@workspace Get the knowledge base overview
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
    org.example.mcp: DEBUG
```

---

## Next Steps

1. **Explore Tools** - Try the tools with the [Quick Start Guide](QUICK_START_GUIDE.md)
2. **Add Your Docs** - Configure `DOMAIN_DOCS_PATHS` to include your specifications
3. **Enable Semantic Search** - `ollama pull mxbai-embed-large` (optional)
4. **Query OMS** - Use `searchOrders` to explore backend data
5. **Share Setup** - Export your config for team members

---

## Resources

- [Main README](../README.md) - Project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - How it works and how agents use it
- [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) - 5-minute quickstart
- [MCP Specification](https://spec.modelcontextprotocol.io/) - Official MCP docs
