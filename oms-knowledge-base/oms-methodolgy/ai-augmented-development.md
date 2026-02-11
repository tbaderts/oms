# AI-Augmented Development with MCP, Agents & Skills

A practical guide to using MCP servers as domain knowledge bases, customizing GitHub Copilot with agents and chat modes, and delegating tasks to external AI agents — all grounded in how the OMS project does it today.

---

## Table of Contents

1. [Why MCP as a Knowledge Base](#1-why-mcp-as-a-knowledge-base)
2. [OMS MCP Server — Anatomy of a Knowledge-Serving MCP](#2-oms-mcp-server--anatomy-of-a-knowledge-serving-mcp)
3. [Customizing GitHub Copilot](#3-customizing-github-copilot)
   - 3.1 Copilot Instructions
   - 3.2 Custom Agents
   - 3.3 Chat Modes
   - 3.4 Skills (Tool Binding)
4. [The Design / Build / Review Workflow](#4-the-design--build--review-workflow)
5. [Delegating to External Agents](#5-delegating-to-external-agents)
6. [Configuration Reference](#6-configuration-reference)
7. [Best Practices & Pitfalls](#7-best-practices--pitfalls)

---

## 1. Why MCP as a Knowledge Base

Large Language Models are powerful but **stateless** — they carry no memory of your project's domain model, state machine rules, or allocation algorithms. Training data goes stale. RAG pipelines add infrastructure complexity.

An **MCP (Model Context Protocol) server** solves this by exposing project-specific knowledge as **live, queryable tools** that any AI agent can invoke at runtime. The benefits:

| Approach | Freshness | Precision | Setup Cost | Runtime Cost |
|----------|-----------|-----------|------------|--------------|
| Training data alone | Stale | Low | None | None |
| Copy-paste context | Manual | Medium | None | Token-heavy |
| RAG pipeline | Good | Good | High | Medium |
| **MCP knowledge server** | **Live** | **High** | **Medium** | **Low** |

MCP wins because:
- **Single source of truth** — specs live in markdown, served directly; no embedding drift
- **Structured retrieval** — keyword search, section navigation, and semantic search available side-by-side
- **Live data access** — same server can expose order queries, system health, or any domain API
- **Agent-agnostic** — Copilot, Claude, Codex, or any MCP-compatible client can consume it
- **Version-controlled** — knowledge base lives alongside code in the repo

---

## 2. OMS MCP Server — Anatomy of a Knowledge-Serving MCP

The OMS MCP server (`oms-mcp-server/`) is a Spring Boot application that serves two categories of tools: **domain knowledge** and **live data**.

### 2.1 Knowledge Tools

These tools expose the `oms-knowledge-base/` markdown documents through multiple retrieval strategies:

| Tool | Strategy | Best For |
|------|----------|----------|
| `listDomainDocs` | Enumerate | Discovering what documents exist |
| `readDomainDoc` | Full read (paginated) | Reading entire specs with offset/limit |
| `listDocSections` | TOC navigation | Browsing large document structure |
| `readDocSection` | Targeted read | Reading a specific section by title |
| `searchDomainDocs` | Keyword search | Finding exact terms: class names, fields, APIs |
| `searchDocSections` | Section-level keyword | Precise hits within document sections |
| `semanticSearchDocs` | Vector/embedding search | Natural language: "how does pro-rata allocation work?" |
| `getVectorStoreInfo` | Index status | Checking how many documents are indexed |

### 2.2 Data Tools

| Tool | Purpose |
|------|---------|
| `searchOrders` | Query live order data with typed filters (symbol, side, state, price ranges, dates, pagination, sorting) |
| `ping` | Health check |

### 2.3 Architecture of the Knowledge Base

```
oms-knowledge-base/
├── oms-concepts/          # Domain concepts (order grouping, quantity calcs, replace, streaming)
├── oms-framework/         # Framework specs (state machine, task orchestration, domain model, stores)
├── oms-methodolgy/        # Process docs (agent profile, manifesto, skills, this document)
├── illustrations/         # Diagrams and visual specs
└── ui/                    # UI specifications
```

Each markdown file is:
- **Authoritative** — the spec, not a summary of it
- **Structured** — with clear headings that `listDocSections` / `readDocSection` can navigate
- **Searchable** — indexed by keyword and (optionally) by vector embeddings via Qdrant

### 2.4 How It Connects to VS Code

The MCP server is registered in `.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "oms-mcp": {
      "type": "stdio",
      "command": "powershell.exe",
      "args": [
        "-ExecutionPolicy", "Bypass",
        "-File", "${workspaceFolder}\\oms-mcp-server\\run-mcp.ps1"
      ],
      "env": {
        "SPRING_PROFILES_ACTIVE": "mcp",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Once registered, every Copilot agent and chat mode in the workspace can bind to `oms-mcp/*` tools.

### 2.5 Optional: Semantic Search with Qdrant

For natural language queries, the MCP server supports vector-based semantic search via Qdrant + Ollama embeddings:

```powershell
# One-time setup
.\oms-mcp-server\setup-semantic-search.ps1

# Verify
docker-compose -f oms-mcp-server/docker-compose.yml ps
```

This enables `semanticSearchDocs` with configurable similarity thresholds — the most powerful retrieval mode for conceptual questions.

---

## 3. Customizing GitHub Copilot

GitHub Copilot in VS Code supports three layers of customization. Use them together for a domain-aware development experience.

### 3.1 Copilot Instructions (`.github/copilot-instructions.md`)

**What**: A global system prompt injected into every Copilot interaction in the workspace.

**When to use**: Always. This is the baseline context layer. It tells Copilot about the project structure, conventions, build commands, and safety guardrails — without requiring users to select a specific agent.

**What to include**:
- Project description and tech stack
- Module structure and key file pointers
- Build / run / test commands
- Coding conventions (OpenAPI-first, thin controllers, RFC 7807 errors)
- Safety guardrails (no secrets, always test, flag migrations)

**OMS example** (excerpt from `.github/copilot-instructions.md`):
```markdown
## Quick context for AI coding agents
- Repo: OMS — Java 21+, Spring Boot microservices with OpenAPI + Avro specs.
- Spec-driven: APIs and DTOs are defined in OpenAPI YAML under `src/main/openapi/`.
- Two API families: Command APIs and Query APIs.
- Error format: RFC7807 Problem+JSON.
```

**Key principle**: Keep it factual and concise. This file is included in every request, so token budget matters.

### 3.2 Custom Agents (`.github/agents/<name>.agent.md`)

**What**: Specialized personas with dedicated tool sets, system prompts, and task workflows. Users invoke them with `@agent-name` in chat.

**When to use**: When a development activity needs a specific combination of:
- **Persona** — role, expertise, behavioral guidelines
- **Tools** — curated subset of available tools (MCP tools, terminal, file editing, etc.)
- **Workflows** — step-by-step patterns for common tasks

**OMS example** — the `@oms` agent (`.github/agents/oms.agent.md`):

```yaml
---
name: oms
description: OMS development agent with access to domain specs and order data via MCP tools.
tools: ['oms-mcp/searchOrders', 'oms-mcp/semanticSearchDocs', 'oms-mcp/readDocSection', ...]
---
```

The agent definition includes:
1. **Role definition** — "You are a senior Java backend developer specializing in the OMS"
2. **Critical behavioral rule** — "ALWAYS use MCP tools first, never answer from general knowledge"
3. **Tool catalog** — every MCP tool + standard edit/search/terminal tools
4. **Task patterns** — implementing features, debugging orders, code review, architecture questions
5. **Key documents table** — maps knowledge areas to specific spec files

**Agent design guidelines**:

| Guideline | Why |
|-----------|-----|
| Make MCP tool usage mandatory, not optional | Prevents hallucinated domain answers |
| Include concrete tool invocation patterns | Agents follow examples better than abstract rules |
| List key knowledge base documents by area | Speeds up retrieval for common queries |
| Define task-specific workflows | Ensures consistent quality across interactions |
| Keep the agent focused on one domain | Broad agents dilute tool selection accuracy |

### 3.3 Chat Modes (`.github/chatmodes/<Name>.chatmode.md`)

**What**: Lightweight conversation presets that configure tone, tool availability, and behavioral rules — without the full agent persona. Think of them as "Copilot themes."

**When to use**: When you want to quickly switch Copilot's behavior without needing a full agent identity. Useful for:
- **Exploration mode** — read-only, search-heavy, no file edits
- **Domain Q&A** — answer questions using only MCP knowledge, no code generation
- **Strict compliance** — enforce that every answer cites a spec reference

**OMS example** — the `Oms` chat mode (`.github/chatmodes/Oms.chatmode.md`) enforces:
- Mandatory MCP tool invocation for all queries
- Spec-referenced answers with document citations
- Structured response format with headings and code blocks

**When to use a chat mode vs. an agent**:

| Need | Chat Mode | Agent |
|------|-----------|-------|
| Quick domain Q&A | Yes | Overkill |
| Implementing a feature with file edits | No | Yes |
| Enforcing tool-usage rules | Yes | Yes |
| Multi-step task orchestration | Limited | Yes |
| Sub-agent delegation | No | Yes |

### 3.4 Skills (Tool Binding)

**What**: Skills are the individual tools that agents and chat modes can access. In VS Code, these map to:
- **MCP tools** — e.g., `oms-mcp/searchOrders`, `oms-mcp/semanticSearchDocs`
- **Built-in tools** — e.g., `read/readFile`, `edit/editFiles`, `execute/runInTerminal`
- **Extension tools** — e.g., `azure-mcp/search`

**When to design custom skills**: When your MCP server needs a new retrieval or action capability. For the OMS, each tool was designed around a specific retrieval pattern:

```
Discover → Navigate → Search → Read → Act
  │           │          │        │       │
  listDocs  listSections  keyword  readSection  searchOrders
              │          semantic    readDoc
              TOC        search
```

**Skill composition in agents**: The `tools` array in the agent frontmatter controls which skills are available:

```yaml
tools: [
  # MCP knowledge tools
  'oms-mcp/semanticSearchDocs',
  'oms-mcp/searchDomainDocs',
  'oms-mcp/readDocSection',
  'oms-mcp/readDomainDoc',
  'oms-mcp/listDomainDocs',
  'oms-mcp/listDocSections',
  'oms-mcp/searchDocSections',
  # MCP data tools
  'oms-mcp/searchOrders',
  # Standard development tools
  'edit/editFiles',
  'execute/runInTerminal',
  'search/codebase',
  'search/textSearch',
  # Delegation
  'agent/runSubagent'
]
```

**Principle**: Grant the minimum set of tools needed for the agent's purpose. A review-only agent doesn't need `edit/editFiles`. A knowledge Q&A mode doesn't need `execute/runInTerminal`.

---

## 4. The Design / Build / Review Workflow

The goal: augment every phase of development with domain knowledge from the MCP knowledge base.

### 4.1 Design Phase

**Objective**: Ensure new features are spec-consistent before any code is written.

```
Developer: "I need to implement cancel/replace for grouped orders"
    │
    ▼
@oms agent: semanticSearchDocs("cancel replace grouped order")
    │
    ▼
Read: order-replace.md → "Cancel/Replace Workflow" section
Read: order-grouping.md → "Member Order Allocation" section
Read: state-machine-framework_spec.md → valid transitions for CXL/PMOD states
    │
    ▼
Agent outputs: Design summary with spec references, state diagrams,
               edge cases, and recommended OpenAPI changes
```

**Recommended workflow**:
1. Describe the feature to `@oms`
2. Agent searches knowledge base for relevant specs
3. Agent produces a design summary citing specific spec sections
4. Developer reviews, asks clarifying questions (agent re-queries specs)
5. Agreement on approach before any code is written

### 4.2 Build Phase

**Objective**: Generate spec-compliant code grounded in domain terminology and patterns.

```
Developer: "Implement the order cancel endpoint per the spec"
    │
    ▼
@oms agent:
  1. readDocSection("order-replace.md", "Cancel Request Processing")
  2. readDocSection("state-machine-framework_spec.md", "Transition Validation")
  3. grep_search existing controllers for cancel patterns
  4. Read OpenAPI spec (oms-cmd-api.yml) for endpoint contract
    │
    ▼
Agent generates:
  - OpenAPI path addition (if needed)
  - Controller method (thin, delegates to service)
  - Service implementation (spec-compliant state transitions)
  - Unit tests (JUnit 5 + Mockito)
  - Integration test skeleton (Testcontainers)
```

**Key rules during build**:
- Agent must cite which spec section informed each implementation decision
- Domain terminology must match specs exactly (e.g., "member orders" not "child orders")
- State transitions must be validated against the state machine spec
- OpenAPI spec is modified first; generated code follows

### 4.3 Review Phase

**Objective**: Validate implementation against specifications and catch spec deviations.

```
Developer: "Review this cancel endpoint implementation against the spec"
    │
    ▼
@oms agent:
  1. searchDomainDocs("cancel") → find relevant specs
  2. readDocSection → read the requirements
  3. Read the implementation code
  4. Compare implementation vs spec
    │
    ▼
Agent outputs:
  - Compliance checklist (✓/✗ per spec requirement)
  - Deviations flagged with spec references
  - Missing edge cases from spec
  - Suggested test scenarios
```

### 4.4 Summary: Tool Usage by Phase

| Phase | Primary MCP Tools | Purpose |
|-------|-------------------|---------|
| **Design** | `semanticSearchDocs`, `readDocSection`, `listDocSections` | Discover specs, understand constraints |
| **Build** | `readDocSection`, `searchDomainDocs`, `searchOrders` | Ground code in specs, validate with live data |
| **Review** | `searchDomainDocs`, `readDocSection`, `searchOrders` | Verify compliance, check real order states |

---

## 5. Delegating to External Agents

Not every task requires the full OMS context. Some tasks benefit from specialized external agents with different strengths.

### 5.1 When to Delegate

| Task Type | Preferred Agent | Why |
|-----------|----------------|-----|
| OMS feature implementation | `@oms` (local) | Has MCP knowledge tools, understands domain |
| Complex multi-file refactoring | Anthropic Claude (Code) | Strong at large-scale code reasoning |
| Autonomous background tasks | OpenAI Codex | Runs in a sandboxed cloud environment |
| Exploratory research | `runSubagent` (local) | Stateless, parallel, disposable |
| Infrastructure / Azure | `@azure` / Azure MCP | Specialized cloud tooling |

### 5.2 Sub-Agent Delegation (within VS Code)

The `@oms` agent can delegate sub-tasks using the `agent/runSubagent` tool:

```
@oms: "Search the codebase for all places where order state transitions 
       are handled, and return a summary of which states and transitions 
       each file handles"
    │
    ▼
runSubagent({
  description: "Survey state transition handlers",
  prompt: "Search for all files in oms-core/src that handle order state 
           transitions. For each file, list which states and transitions 
           it handles. Return a markdown table."
})
```

Sub-agents are:
- **Stateless** — each invocation starts fresh
- **Autonomous** — they run to completion, then return one final message
- **Good for research** — searching, reading, analyzing without side effects

### 5.3 Delegating to Anthropic Claude (Agentic Coding)

For complex, multi-step coding tasks that benefit from Claude's deep reasoning:

**Option A: Claude via GitHub Copilot** (model selector)
- Select `claude-opus-4.6` or `claude-sonnet-4.5` in the Copilot model picker
- Full access to workspace tools, MCP servers, and file editing
- Best for in-IDE work with domain context

**Option B: Claude Code (CLI agent)**
- Runs as a terminal-based agent with full filesystem access
- Can be configured to use the same MCP server:
  ```json
  // claude_desktop_config.json or .mcp.json
  {
    "mcpServers": {
      "oms-mcp": {
        "command": "powershell.exe",
        "args": ["-ExecutionPolicy", "Bypass", "-File", "oms-mcp-server/run-mcp.ps1"],
        "env": { "SPRING_PROFILES_ACTIVE": "mcp", "MCP_TRANSPORT": "stdio" }
      }
    }
  }
  ```
- Best for large autonomous refactoring, implementation marathons

**Handoff pattern**: Provide Claude with the spec context upfront:
```
"Read the order-replace.md spec from the MCP knowledge base, then 
implement the full cancel/replace flow in oms-core following the 
thin-controller pattern. Include unit and integration tests."
```

### 5.4 Delegating to OpenAI Codex

Codex agents run in sandboxed cloud environments with their own compute. Best for:
- **Background tasks** — "while I work on feature X, have Codex refactor the test suite"
- **Parallel work streams** — multiple Codex agents tackling independent modules
- **CI-integrated tasks** — triggered from GitHub Actions for automated code fixes

**Setup**: Configure Codex to clone the repo and connect to an MCP endpoint. Since Codex runs remotely, the MCP server needs to be accessible over HTTP (not just stdio):

```bash
# Run MCP server with HTTP transport for remote agents
./gradlew bootRun --args='--spring.main.web-application-type=servlet --server.port=8091'
```

### 5.5 Delegation Decision Matrix

```
                     ┌─────────────────────────────────┐
                     │      Task arrives                │
                     └────────────┬────────────────────┘
                                  │
                     ┌────────────▼────────────────────┐
                     │  Needs OMS domain knowledge?     │
                     └────┬───────────────────────┬────┘
                          │ Yes                    │ No
                     ┌────▼────────┐    ┌─────────▼──────────┐
                     │  @oms agent │    │  General purpose     │
                     │  (MCP tools)│    │  Copilot / Claude    │
                     └────┬────────┘    └────────────────────┘
                          │
                ┌─────────▼─────────────────┐
                │  Single file or multi-file? │
                └──────┬──────────────┬──────┘
                       │ Single       │ Multi / Complex
                  ┌────▼─────┐  ┌────▼──────────────┐
                  │ @oms     │  │  Claude Code or    │
                  │ inline   │  │  Codex (with MCP)  │
                  └──────────┘  └───────────────────┘
```

---

## 6. Configuration Reference

### 6.1 File Inventory

| File | Purpose |
|------|---------|
| `.vscode/mcp.json` | Register MCP servers for the workspace |
| `.vscode/settings.json` | Configure MCP sampling, model allowlists |
| `.github/copilot-instructions.md` | Global Copilot system prompt |
| `.github/agents/oms.agent.md` | Domain-specific coding agent with MCP tools |
| `.github/chatmodes/Oms.chatmode.md` | Lightweight Q&A mode with MCP tools |

### 6.2 MCP Server Registration (`.vscode/mcp.json`)

```jsonc
{
  "servers": {
    "oms-mcp": {
      "type": "stdio",                              // stdio for local, sse for remote
      "command": "powershell.exe",
      "args": ["-ExecutionPolicy", "Bypass", "-File", "${workspaceFolder}\\oms-mcp-server\\run-mcp.ps1"],
      "env": {
        "SPRING_PROFILES_ACTIVE": "mcp",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### 6.3 Model Allowlist for MCP Sampling (`.vscode/settings.json`)

When the MCP server needs to use LLM sampling (e.g., for generating summaries), configure which models are allowed:

```jsonc
{
  "chat.mcp.serverSampling": {
    "oms/.vscode/mcp.json: oms-mcp": {
      "allowedModels": [
        "copilot/claude-sonnet-4.5",
        "copilot/claude-haiku-4.5",
        "copilot/claude-opus-4.6"
      ]
    }
  }
}
```

### 6.4 Agent Frontmatter Reference

```yaml
---
name: oms                             # Invoked as @oms
description: OMS development agent... # Shown in agent picker
argument-hint: A development task...  # Placeholder text in chat input
tools: [                              # Skills available to this agent
  'oms-mcp/semanticSearchDocs',       # MCP knowledge tools
  'oms-mcp/searchOrders',             # MCP data tools
  'edit/editFiles',                   # Standard IDE tools
  'agent/runSubagent',                # Delegation capability
  ...
]
---
```

---

## 7. Best Practices & Pitfalls

### Do

- **Write specs first, then serve them via MCP** — the knowledge base is only as good as the specs in it. Invest in clear, structured markdown with meaningful headings.
- **Make MCP tool usage mandatory in agent prompts** — explicitly say "ALWAYS use MCP tools first, NEVER answer from general knowledge." Repeat it. Agents follow repeated instructions.
- **Structure documents with navigable headings** — `listDocSections` and `readDocSection` depend on well-structured markdown. Use `##` and `###` consistently.
- **Keep knowledge base version-controlled** — specs evolve with code. The knowledge base lives in the repo and follows the same PR/review process.
- **Use semantic search for conceptual questions, keyword search for exact terms** — "how does allocation work?" → semantic. "pro-rata" → keyword.
- **Grant minimum tools per agent** — a review-only agent doesn't need `edit/editFiles`.
- **Test your MCP tools in chat mode first** — validate tool behavior with the lightweight chat mode before wiring it into a full agent workflow.
- **Provide concrete examples in agent prompts** — agents follow demonstrated patterns far better than abstract instructions.

### Don't

- **Don't put secrets in MCP server config** — use environment variables
- **Don't skip the knowledge base for "obvious" answers** — even experienced developers misremember domain details. The spec is the source of truth.
- **Don't overload a single agent with too many domains** — keep agents focused. An OMS agent shouldn't also be a Kubernetes deployment expert.
- **Don't manually edit OpenAPI-generated code** — modify the spec, re-generate, then customize via partial classes or mixins.
- **Don't index stale documents** — if a spec is outdated, update it or remove it. Stale knowledge is worse than no knowledge.
- **Don't use semantic search for exact terms** — vector similarity can miss exact class names or field names. Use keyword search for those.

### Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Agent ignores MCP tools | Answers from general knowledge | Add stronger "MUST use tools" instructions with examples |
| Semantic search returns nothing | Threshold too high | Lower `similarityThreshold` from 0.5 to 0.3 |
| Keyword search too broad | Irrelevant results | Use `searchDocSections` instead of `searchDomainDocs` |
| Agent reads wrong section | Section title mismatch | Use `listDocSections` first to discover exact titles |
| MCP server won't start | Port conflict or build error | Run `.\gradlew.bat bootJar -x test` first, check logs |
| Token budget exceeded | Too much context loaded | Use `readDocSection` for targeted reads instead of `readDomainDoc` |

---

## Appendix: Building Your Own Knowledge-Serving MCP

If you want to replicate this pattern for another project:

1. **Organize specs as structured markdown** — one file per concept, clear headings, consistent format
2. **Build an MCP server** with these minimum tools:
   - `listDocs` — enumerate available documents
   - `readDoc` — read full document content (with pagination)
   - `searchDocs` — keyword search across documents
   - `readSection` — read a specific section by heading title
3. **Add semantic search** (optional but recommended) — use Qdrant, Chroma, or pgvector with an embedding model
4. **Add domain data tools** — expose live application data (orders, users, metrics) for debugging and analysis
5. **Register in `.vscode/mcp.json`** — make it available to all Copilot agents
6. **Write an agent** that mandates tool usage — the agent is only as good as its instructions
7. **Iterate on both the knowledge base and the agent** — treat them as code, review them in PRs, measure their effectiveness

---

*This document is part of the OMS methodology. See also: [agent.md](agent.md), [manifesto.md](manifesto.md), [skill-profiles.md](skill-profiles.md).*
