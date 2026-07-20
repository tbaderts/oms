# Quick Start: OMS MCP Knowledge Server

Get the server running and do your first spec-driven task in 5 minutes.

---

## 1. Start the Server

```powershell
# Windows
.\run-mcp.ps1

# Linux/macOS
./run-mcp.sh
```

Optional (for semantic search — keyword search works without it):
```bash
ollama pull mxbai-embed-large
```

## 2. Register with Your Client

**Claude Code** — add to `.mcp.json` in the repo root, **VS Code Copilot** — `.vscode/mcp.json`, **Claude Desktop** — `claude_desktop_config.json`. See [MCP.md](MCP.md) for exact snippets.

## 3. Verify

Ask your agent:
```
Ping the oms-knowledge MCP server, then call getKnowledgeBaseOverview.
```

You should see "pong" and an index of ~26 documents with section anchors.

---

## The 3-Tool Pattern

Every knowledge interaction uses three tools, usually in this order:

| Step | Tool | Example |
|---|---|---|
| Orient | `getKnowledgeBaseOverview()` | once per session |
| Find | `searchKnowledgeBase(query)` | `searchKnowledgeBase("order cancel workflow")` |
| Read | `readKnowledgeBase(path, anchor)` | follow a citation from the search result |

Search results carry **citations** like `oms-knowledge-base/oms-concepts/order-replace.md#5-order-cancel-workflow` — pass the path and anchor straight into `readKnowledgeBase` to get the full section.

---

## Your First 3 Tasks

### Task 1: Understand the Domain (2 min)
```
Use the oms-knowledge server: search for "order lifecycle states" and
summarize the states an order can be in, citing the spec sections.
```

### Task 2: Generate Spec-Compliant Code (5 min)
```
1. Search the knowledge base for "Execution entity"
2. Read the relevant domain-model_spec.md sections
3. Generate Execution.java following the spec, citing path#anchor in the Javadoc
```

### Task 3: Validate Existing Code (3 min)
```
Validate OrderStateMachine.java against the state machine spec:
search the knowledge base, read the governing sections, and report
deviations with citations.
```

Or use the built-in MCP prompts: **`implement-from-spec`** and **`validate-against-spec`** (your client lists them under prompts).

---

## Power Tips

- **Chain, don't dump**: search → read the cited section → then generate. Agents do this naturally with the 3-tool pattern.
- **Demand citations**: ask for `path#anchor` references in generated Javadoc, PR descriptions, and review comments — that's what makes the spec the source of truth.
- **Filter when you know the area**: `searchKnowledgeBase(query, category: "framework")` or `status: "Complete"`.
- **Attach whole specs**: every doc is also an MCP resource (`kb://...`) — pin one to the conversation when working in a single spec for a while.

---

## Troubleshooting

**Agent doesn't see the tools?**
- Ask: "What MCP tools are available?" — expect `searchKnowledgeBase`, `readKnowledgeBase`, `getKnowledgeBaseOverview`, `searchOrders`, `ping`
- If missing: reload the client / check the MCP registration

**Empty overview?**
- Check `domain.docs.paths` in `application.yml` points at `../oms-knowledge-base`
- Rebuild: `./gradlew bootJar`

**Search says "BM25 keyword only"?**
- That's fine — keyword search is fully functional. For semantic search, start Ollama and pull the embedding model, then restart the server.

More: [Architecture](ARCHITECTURE.md) · [MCP Setup](MCP.md) · [Quick Reference](QUICK_REFERENCE.md)
