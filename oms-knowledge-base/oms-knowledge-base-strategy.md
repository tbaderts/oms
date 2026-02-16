# OMS Knowledge Base Strategy

**Version:** 2.0  
**Last Updated:** February 15, 2026  
**Status:** Active  
**Scope:** Optimizing the `oms-knowledge-base/` for AI-assisted development with GitHub Copilot and MCP

---

## 1. Current State Assessment

### 1.1 What We Have

The OMS knowledge base is a collection of **20 well-structured markdown documents** (~300 KB, ~7,400 lines) organized into five categories:

| Folder | Documents | Purpose |
|--------|-----------|---------|
| `oms-concepts/` | 4 | Domain logic: order grouping, quantity calcs, replace, streaming |
| `oms-framework/` | 5 | Technical specs: state machine, task orchestration, domain model, stores |
| `oms-methodolgy/` | 5 | Process: agent profile, AI-augmented dev, manifesto, skills, architecture methodology |
| `illustrations/` | 3 | Diagrams: allocation flows, task orchestration, order state indicators |
| `ui/` | 1 | UI spec: OMS Admin Tool (React 18, AG Grid) |

### 1.2 Two Access Channels Today

**Channel A — MCP Server** (`oms-mcp-server/`):
- 10 tools exposed via stdio MCP protocol
- Tier 1 (always available): `listDomainDocs`, `readDomainDoc`, `searchDomainDocs`, `listDocSections`, `readDocSection`, `searchDocSections`
- Tier 2 (requires Docker/Qdrant/Ollama): `semanticSearchDocs`, `getVectorStoreInfo`
- Configured in `.vscode/mcp.json`, used by `@oms` agent and OMS chat mode

**Channel B — Filesystem** (Copilot's built-in workspace indexing):
- Copilot automatically indexes all `.md` files in the workspace
- Available via `@workspace` references, `#file` includes, and `semantic_search` tool
- No setup required — just open the workspace
- Used by default Copilot chat, `copilot-instructions.md`, `CLAUDE.md`

### 1.3 Copilot Configuration Files

| File | Role | Accesses KB Via |
|------|------|-----------------|
| `.github/copilot-instructions.md` | Global context injected into every Copilot interaction | Filesystem (file pointers) |
| `.github/agents/oms.agent.md` | `@oms` agent — full dev agent with tool binding | MCP tools (mandatory) |
| `.github/chatmodes/Oms.chatmode.md` | OMS chat mode — knowledge Q&A | MCP tools (mandatory) |
| `CLAUDE.md` | Claude Code CLI agent instructions | Filesystem (file pointers) |

---

## 2. The Core Question: Filesystem vs MCP

### 2.1 Comparison Matrix

| Dimension | Filesystem (Copilot built-in) | MCP Server |
|-----------|-------------------------------|------------|
| **Setup cost** | Zero — works out of the box | Medium — requires `run-mcp.ps1`, optionally Docker+Ollama |
| **Availability** | Always on | Requires running server process |
| **Search type** | Copilot's internal embedding + keyword | Keyword (TF scoring) + semantic (Qdrant/Ollama) |
| **Granularity** | File-level, sometimes snippet-level | Section-level navigation (`readDocSection`) |
| **Context window** | Copilot selects snippets automatically | Agent controls exactly what chunks to retrieve |
| **Live data** | No — files only | Yes — order queries via `searchOrders` |
| **Cross-agent** | VS Code Copilot only | Any MCP client (Copilot, Claude, Codex, etc.) |
| **Latency** | Near-instant | ~200-500ms per tool call |
| **Token efficiency** | Copilot auto-trims to fit context | Developer/agent controls chunk size |
| **Freshness** | File-save triggers re-index | Server restart re-indexes (auto-index on startup) |

### 2.2 Verdict: Hybrid — Both Channels, Different Purposes

Neither channel alone is optimal. **Use both strategically:**

| Scenario | Best Channel | Why |
|----------|-------------|-----|
| Quick inline code completion | **Filesystem** | Zero-latency, Copilot auto-selects relevant snippets |
| "How does pro-rata allocation work?" | **MCP** | Semantic search finds the exact spec section |
| Implementing a new controller | **MCP → Filesystem** | MCP finds the spec, then Copilot uses code patterns from workspace files |
| Debugging order state transitions | **MCP** | `searchOrders` + spec lookup in one workflow |
| Code review against specs | **MCP** | Structured section reads, cross-reference with spec requirements |
| Writing tests for existing code | **Filesystem** | Pattern-match existing test files in workspace |
| Quick "what's the package for X?" | **Filesystem** | Faster than MCP round-trip for simple lookups |
| New team member onboarding | **MCP** | Guided navigation through `listDomainDocs` → `readDocSection` |

### 2.3 The Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Developer in VS Code                                               │
│                                                                     │
│  ┌──────────────────────┐    ┌────────────────────────────────────┐ │
│  │ Default Copilot Chat  │    │ @oms Agent / OMS Chat Mode         │ │
│  │ (inline completions)  │    │ (spec-driven dev, debugging)       │ │
│  └──────────┬───────────┘    └──────────────┬─────────────────────┘ │
│             │                               │                       │
│    ┌────────▼────────┐            ┌─────────▼──────────┐           │
│    │ Filesystem Index │            │ MCP Server (stdio)  │           │
│    │ (auto, always on)│            │ (10 tools)          │           │
│    │                  │            │                     │           │
│    │ • @workspace     │            │ • Keyword search    │           │
│    │ • #file refs     │            │ • Section nav       │           │
│    │ • semantic_search│            │ • Semantic search    │           │
│    │                  │            │ • Order queries     │           │
│    └────────┬─────────┘            └─────────┬──────────┘           │
│             │                                │                      │
│             └────────────┬───────────────────┘                      │
│                          │                                          │
│                ┌─────────▼──────────┐                               │
│                │  oms-knowledge-base/ │                               │
│                │  (single source     │                               │
│                │   of truth)         │                               │
│                └────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle:** The knowledge base markdown files are the **single source of truth**. Both channels read from the same files. Optimize the files for both access patterns.

---

## 3. Document Structure Guidelines

### 3.1 Optimal Markdown Structure for Dual Access

Documents should be structured to work well for **both** filesystem indexing (Copilot's built-in) and MCP structured navigation (`listDocSections` / `readDocSection`).

**Template for specification documents:**

```markdown
# [Concept Name] Specification

**Version:** X.Y
**Last Updated:** YYYY-MM-DD
**Author:** [Team/Individual]
**Status:** Draft | Active | Deprecated

---

## 1. Overview

[2-3 sentence summary. This is what Copilot's filesystem search will often match on.]

## 2. Key Concepts

### 2.1 [Concept A]
[Definition, behavior, constraints]

### 2.2 [Concept B]
[Definition, behavior, constraints]

## 3. Domain Model

[Entity definitions, field-level specs, relationships — Java class examples]

```java
// Pattern: [what this demonstrates]
@Entity
public class OrderGroup {
    private String groupId;
    private List<Order> memberOrders;
    private AllocationMethod allocationMethod;
    // ...
}
```

## 4. State Transitions / Workflows

[Mermaid diagrams + transition tables]

## 5. API Contract

[OpenAPI path references, request/response samples]

## 6. Implementation Patterns

[Java code patterns that Copilot can use for code generation]

```java
// Pattern: Service method for [operation]
public OrderGroup createGroupedOrder(CreateGroupRequest request) {
    // 1. Validate member orders
    // 2. Calculate aggregated quantity
    // 3. Create parent order
    // 4. Link member orders
    // 5. Publish event
}
```

## 7. Related Documents

- [Document A](../folder/doc-a.md) — [why it's related]
- [Document B](../folder/doc-b.md) — [why it's related]
```

### 3.2 Why This Structure Works for Both Channels

| Structural Element | Filesystem Benefit | MCP Benefit |
|---|---|---|
| Clear `# H1` title | Copilot matches file by name/title | `listDomainDocs` shows meaningful names |
| Version/status header | Copilot context includes freshness signal | Human reviewers see document age |
| Numbered sections (`## 1.`, `## 2.`) | Scannable when Copilot shows snippets | `listDocSections` returns clean TOC |
| Named subsections (`### 2.1 Concept A`) | Copilot can reference specific concepts | `readDocSection` retrieves exact section |
| Java code blocks with `// Pattern:` comments | Copilot pattern-matches for code generation | Keyword search (`searchDomainDocs`) finds patterns |
| Related documents links | Copilot resolves relative paths in workspace | MCP tools can follow references |

### 3.3 Language-Specific Code Examples

This project uses **Java** (backend) and **TypeScript/React** (frontend). Code examples in specs must match:

- **Backend specs** (`oms-concepts/`, `oms-framework/`): Java 21+ with Spring Boot, Lombok, MapStruct
- **UI specs** (`ui/`): TypeScript with React 18, AG Grid, Tailwind CSS
- **API specs**: OpenAPI YAML snippets + curl examples

**Never** include generic TypeScript/JavaScript examples in backend specs. Code examples should be directly usable.

---

## 4. Knowledge Base Inventory & Gap Analysis

### 4.1 Current Coverage

| Area | Covered By | Quality | Gaps |
|------|-----------|---------|------|
| Order grouping & allocation | `order-grouping.md` (1,289 lines) | Excellent | None — comprehensive spec |
| Quantity calculations | `order-quantity-calculations.md` (747 lines) | Excellent | None |
| Cancel/replace workflows | `order-replace.md` (1,237 lines) | Excellent | None — largest spec |
| Streaming architecture | `streaming-architecture.md` (253 lines) | Good | Could add WebSocket error handling patterns |
| Domain model | `domain-model_spec.md` (92 lines) | **Thin** | Needs field-level specs for Order, Execution, Quote |
| State machine | `state-machine-framework_spec.md` (745 lines) | Excellent | None |
| Task orchestration | `task-orchestration-framework_spec.md` (665 lines) | Excellent | None |
| State store (event sourcing) | `oms-state-store.md` (174 lines) | Good | Could add more Java examples |
| Query store (CQRS) | `state-query-store_spec.md` (141 lines) | Good | Could add ReadySet/cache patterns |
| Admin UI | `oms-admin-ui_spec.md` (579 lines) | Excellent | None |
| AI-augmented development | `ai-augmented-development.md` (586 lines) | Excellent | Reflects actual setup well |

### 4.2 Missing Documents (Priority Order)

| Priority | Missing Document | Why It's Needed |
|----------|-----------------|-----------------|
| **P1** | `order-lifecycle.md` | Core concept — state transitions from NEW to CLOSED with business triggers. Currently split across state-machine spec and order-replace. Needs a unified reference. |
| **P1** | `openapi-contracts.md` | Guide to the OpenAPI specs (`oms-cmd-api.yml`, `oms-query-api.yml`), endpoint inventory, and code generation workflow. The agent needs this to implement controllers correctly. |
| **P2** | `execution-reporting.md` | Execution create, whack (cancel), bust workflows. Order-replace covers some but executions deserve a standalone spec. |
| **P2** | `validation-rules.md` | Predicate-based validation engine usage. Referenced in domain model but no standalone spec. |
| **P3** | `error-handling.md` | RFC 7807 Problem+JSON patterns, error code catalog, retry policies. |
| **P3** | `testing-patterns.md` | JUnit 5 + Mockito patterns, Testcontainers setup, test data builders. Helps Copilot generate better tests. |

### 4.3 Document Size Optimization

For MCP semantic search (chunked at 1,000 tokens with 200-token overlap):

| Document | Lines | Estimated Chunks | Assessment |
|----------|-------|-----------------|------------|
| `order-replace.md` | 1,237 | ~50 | Large but well-sectioned — chunks work well |
| `order-grouping.md` | 1,289 | ~45 | Large but well-sectioned — chunks work well |
| `domain-model_spec.md` | 92 | ~4 | **Too thin** — all content in few chunks, low search coverage |
| Most others | 150-750 | 6-30 | Ideal range for both access patterns |

**Recommendation:** Don't split large, well-structured docs. The section-level MCP tools (`readDocSection`) handle navigation within large docs effectively. Focus on expanding thin docs instead.

---

## 5. Copilot Configuration Optimization

### 5.1 `.github/copilot-instructions.md` — Filesystem Channel

This file is injected into **every** Copilot interaction (not just `@oms`). It should:
- Provide project context that helps Copilot understand code without MCP
- Point to key files in the workspace for pattern matching
- Stay concise (it consumes context window every time)

**Current state:** Good — covers project structure, conventions, build commands, file pointers.

**Recommended improvements:**
- Add explicit pointers to knowledge base files for common tasks
- Include a "decision table" mapping coding tasks to relevant KB files
- Add key code patterns inline (not just file pointers) for the most common operations

**Suggested addition to `copilot-instructions.md`:**

```markdown
## Knowledge Base Quick Reference

When working on these areas, consult these spec files in `oms-knowledge-base/`:

| Task | Spec Files |
|------|-----------|
| Order create/accept | `oms-concepts/order-grouping.md`, `oms-framework/domain-model_spec.md` |
| State transitions | `oms-framework/state-machine-framework_spec.md` |
| Cancel/replace orders | `oms-concepts/order-replace.md` |
| Execution reporting | `oms-concepts/order-quantity-calculations.md` |
| Task pipelines | `oms-framework/task-orchestration-framework_spec.md` |
| Event sourcing | `oms-framework/oms-state-store.md` |
| Query/search APIs | `oms-framework/state-query-store_spec.md` |
| WebSocket streaming | `oms-concepts/streaming-architecture.md` |
| UI components | `oms-knowledge-base/ui/oms-admin-ui_spec.md` |
```

### 5.2 `@oms` Agent — MCP Channel

**Current state:** Excellent — enforces MCP-first workflow, comprehensive tool binding, spec-driven task patterns.

**No major changes needed.** Minor improvements:
- Add the missing P1/P2 documents to the "Key Knowledge Base Documents" table as they're created
- Consider adding a `## Context Loading Strategy` section that instructs the agent to also read relevant workspace code files after MCP lookup

### 5.3 OMS Chat Mode — MCP Channel

**Current state:** Good — enforces tool usage for every query.

**Recommended addition:** Add a section on when to **combine** MCP results with workspace file reads:

```markdown
## Hybrid Workflow
After finding specs via MCP tools, use workspace file reads to see actual implementation:
1. MCP: `semanticSearchDocs("order validation")` → finds the spec
2. File: Read `oms-core/src/main/java/org/example/oms/api/OrderController.java` → see current implementation
3. Compare spec vs implementation, identify gaps or deviations
```

---

## 6. Content Authoring Best Practices

### 6.1 Write for Chunking

The MCP server chunks documents at ~1,000 tokens with 200-token overlap. To maximize retrieval quality:

- **Start each section with a summary sentence** — this becomes the "topic sentence" of the chunk
- **Keep related information together** — don't split a concept across sections with unrelated content between them
- **Use explicit section headings** — `## 3. Order State Transitions` is better than `## Details`
- **Include entity/class names in section text** — keyword search relies on term frequency within sections

### 6.2 Write for Code Generation

Copilot generates better code when it sees:

- **Complete, compilable code examples** — not pseudocode, not snippets with `...`
- **Pattern comments** — `// Pattern: Pro-rata allocation across member orders`
- **Import statements** — helps Copilot resolve the right packages
- **Test examples** — shows expected behavior alongside implementation

```java
// GOOD: Complete, usable pattern
import org.example.oms.model.Order;
import org.example.oms.model.OrderState;

// Pattern: State transition validation
public boolean canTransition(Order order, OrderState target) {
    return stateMachine.isValidTransition(order.getState(), target);
}

// BAD: Incomplete, not directly usable
// check if order can move to new state
// use state machine to validate
```

### 6.3 Cross-Reference Between Documents

Use explicit markdown links to related docs. Both channels benefit:
- Filesystem: Copilot resolves relative links
- MCP: `readDocSection("Related Documents")` returns navigable references

```markdown
## 7. Related Documents

- [State Machine Framework](../oms-framework/state-machine-framework_spec.md) — defines valid order state transitions
- [Order Quantity Calculations](order-quantity-calculations.md) — fill quantity math for grouped orders
- [Task Orchestration](../oms-framework/task-orchestration-framework_spec.md) — pipeline pattern used for order processing
```

---

## 7. MCP Server Improvements

### 7.1 Current Strengths

The MCP server already implements:
- Multi-strategy retrieval (keyword + structural + semantic)
- Section-level navigation (`listDocSections` → `readDocSection`)
- Configurable semantic search (threshold, topK)
- Rich chunk metadata (source, filename, path, chunk_index, total_chunks)
- Auto-indexing on startup with `TokenTextSplitter(1000, 200)`

### 7.2 Recommended Enhancements

| Enhancement | Impact | Effort |
|-------------|--------|--------|
| **Add `relatedDocs` tool** — given a doc, return its `## Related Documents` section links | Enables graph navigation for agents | Low |
| **Improve keyword scoring** — add TF-IDF or BM25 instead of raw term frequency | Better keyword search ranking | Medium |
| **Add metadata filters** — filter by folder, file size, last modified in `searchDomainDocs` | More precise retrieval | Low |
| **Health endpoint for vector store** — include chunk count and last-indexed time in `ping` | Faster debugging of index issues | Low |
| **Combine keyword + semantic in one tool** — `hybridSearch` that merges both ranking signals | Reduces agent tool calls from 2 to 1 | Medium |

### 7.3 What NOT to Build

- ❌ **YAML frontmatter parsing** — the MCP server uses `MarkdownParser` which parses `#` headings. Adding YAML frontmatter parsing adds complexity with marginal search improvement. The heading structure already provides good section-level retrieval.
- ❌ **Knowledge graph database** — the KB has 20 documents. A graph database is overkill. Simple `## Related Documents` sections + relative links are sufficient.
- ❌ **Custom embedding model** — `nomic-embed-text` via Ollama works well for technical docs. Fine-tuning isn't justified at this scale.
- ❌ **LLMs.txt / context guide file** — the `@oms` agent already has a "Key Knowledge Base Documents" table that serves this purpose. Duplicating it in a separate file creates maintenance burden.

---

## 8. Filesystem Optimization (No MCP Required)

These improvements make the knowledge base more effective for **all** Copilot interactions, even without the MCP server:

### 8.1 Instruction File Knowledge Pointers

The `.github/copilot-instructions.md` file is the **most impactful** context for filesystem access because it's always loaded. Adding a document index here (see Section 5.1) gives Copilot a task-to-file mapping without any MCP calls.

### 8.2 `CLAUDE.md` Knowledge Pointers

Similarly, `CLAUDE.md` (used by Claude Code) should include the same document index. It already links to key knowledge areas but could be more specific about which spec to consult for which coding task.

### 8.3 In-Code Documentation Links

Add Javadoc `@see` references to knowledge base specs in key classes:

```java
/**
 * Manages order state transitions using the generic state machine engine.
 *
 * @see <a href="../../oms-knowledge-base/oms-framework/state-machine-framework_spec.md">
 *      State Machine Framework Specification</a>
 */
@Service
public class OrderStateMachineService {
    // ...
}
```

This creates a direct link from code to spec that Copilot can follow during filesystem indexing.

---

## 9. Action Plan

### Immediate (This Week)

| # | Action | Channel Improved | File(s) to Change |
|---|--------|------------------|--------------------|
| 1 | Add KB quick reference table to `copilot-instructions.md` | Filesystem | `.github/copilot-instructions.md` |
| 2 | Add `## Related Documents` sections to all KB specs | Both | All 20 KB files |
| 3 | Expand `domain-model_spec.md` with field-level entity definitions | Both | `oms-framework/domain-model_spec.md` |
| 4 | Ensure all code examples use Java (not TypeScript) in backend specs | Both | Audit all KB files |

### Short-Term (Next 2 Weeks)

| # | Action | Channel Improved | Effort |
|---|--------|------------------|--------|
| 5 | Create `order-lifecycle.md` — unified state transition reference | Both | Medium |
| 6 | Create `openapi-contracts.md` — API endpoint inventory + code gen guide | Both | Medium |
| 7 | Add `Javadoc @see` links to KB specs in key service classes | Filesystem | Low |
| 8 | Add metadata filtering to MCP `searchDomainDocs` tool | MCP | Low |

### Medium-Term (Next Month)

| # | Action | Channel Improved | Effort |
|---|--------|------------------|--------|
| 9 | Create `execution-reporting.md` and `validation-rules.md` | Both | Medium |
| 10 | Create `testing-patterns.md` — JUnit/Mockito/Testcontainers patterns | Filesystem (mainly) | Medium |
| 11 | Add `hybridSearch` tool to MCP server (keyword + semantic combined) | MCP | Medium |
| 12 | Add `error-handling.md` — RFC 7807, error codes, retry patterns | Both | Medium |

---

## 10. Measuring Effectiveness

### 10.1 Qualitative Signals

- Are agents finding the right spec on the first MCP tool call?
- Is Copilot generating code that matches spec patterns (correct entity names, state transitions, API paths)?
- Do developers need to manually paste spec content, or do the tools surface it automatically?

### 10.2 Practical Checks

Run these periodically to validate KB health:

```powershell
# Check all KB files have Related Documents sections
Select-String -Path "oms-knowledge-base\**\*.md" -Pattern "## .*Related" -SimpleMatch | Select-Object Filename

# Check all code examples use correct language tags
Select-String -Path "oms-knowledge-base\**\*.md" -Pattern "```typescript" | Select-Object Filename, LineNumber

# Count sections per doc (should be 4+ for substantial docs)
Get-ChildItem "oms-knowledge-base\**\*.md" -Recurse | ForEach-Object {
    $sections = (Select-String -Path $_.FullName -Pattern "^## " | Measure-Object).Count
    [PSCustomObject]@{ File = $_.Name; Sections = $sections }
} | Sort-Object Sections
```

### 10.3 MCP Server Diagnostics

```powershell
# Check vector store health
# Use @oms agent: "ping" and "getVectorStoreInfo"
# Expected: 800+ chunks indexed from 20 documents
```

---

## 11. Summary

**The most effective approach is hybrid: filesystem (always-on, zero-config) + MCP (structured, precise, live data).**

The knowledge base files themselves are the single source of truth. Both channels read from the same markdown files. Optimizations should focus on:

1. **Document quality** — clear headings, Java code examples, related document links
2. **Instruction file pointers** — `copilot-instructions.md` and `CLAUDE.md` with task-to-file mappings
3. **Fill coverage gaps** — missing specs for order lifecycle, OpenAPI contracts, execution reporting
4. **Don't over-engineer** — 20 documents don't need a graph database, custom embeddings, or YAML frontmatter parsing

The MCP server is already well-built. Incremental improvements (metadata filtering, hybrid search) will help, but the biggest wins come from **better document content** — which improves both channels simultaneously.

---

**Document Version**: 2.0
**Last Updated**: 2026-02-15
**Author**: OMS Knowledge Management

---

## Related Documents

- [AI-Augmented Development](oms-methodolgy/ai-augmented-development.md) — MCP server and Copilot integration context
- All knowledge base documents — This strategy applies to optimizing all KB specifications for AI access