# MCP Tool Usage Examples for VS Code Copilot

Complete guide with copy-paste examples for all 10 MCP tools exposed by this server.

---

## Table of Contents

1. [Domain Knowledge Tools (6)](#domain-knowledge-tools)
   - [listDomainDocs](#1-listdomaindocs)
   - [readDomainDoc](#2-readdomaindoc)
   - [searchDomainDocs](#3-searchdomaindocs)
   - [listDocSections](#4-listdocsections)
   - [readDocSection](#5-readdocsection)
   - [searchDocSections](#6-searchdocsections)
2. [Semantic Search Tools (2)](#semantic-search-tools)
   - [semanticSearchDocs](#7-semanticsearchdocs)
   - [getVectorStoreInfo](#8-getvectorstoreinfo)
3. [OMS Query Tools (1)](#oms-query-tools)
   - [searchOrders](#9-searchorders)
4. [Health Check Tools (1)](#health-check-tools)
   - [ping](#10-ping)

---

## How to Use These Examples

In VS Code with GitHub Copilot:

1. **Open Copilot Chat** (Ctrl+Alt+I or Cmd+Alt+I)
2. **Use `@workspace` prefix** to access MCP tools
3. **Copy-paste examples** from this guide
4. **Modify parameters** as needed for your use case

**Syntax:**
```
@workspace <Your request that will trigger the MCP tool>
```

**Note:** You don't need to explicitly name the tool. Copilot will automatically choose the right tool based on your request.

---

## Domain Knowledge Tools

These tools provide access to your OMS specification documents.

### 1. `listDomainDocs`

**Purpose:** Discover what specification documents are available.

**Tool Signature:**
```java
List<DocMeta> listDomainDocs()
```

**Example Queries:**

```
@workspace What domain documentation do we have?
```

```
@workspace List all available specification documents
```

```
@workspace Show me all the spec files I can access
```

**Sample Response:**
```json
[
  {
    "path": "specs/oms_spec.md",
    "sizeBytes": 10240,
    "lastModified": "2025-10-01T12:00:00Z"
  },
  {
    "path": "specs/domain-model_spec.md",
    "sizeBytes": 4500,
    "lastModified": "2025-09-28T10:30:00Z"
  }
]
```

---

### 2. `readDomainDoc`

**Purpose:** Read the full content of a specific document (with optional pagination).

**Tool Signature:**
```java
DocContent readDomainDoc(String path, Integer offset, Integer limit)
```

**Parameters:**
- `path` - Relative path to document (from `listDomainDocs`)
- `offset` - Character offset to start reading (optional, default: 0)
- `limit` - Max characters to read (optional, default: entire file)

**Example Queries:**

```
@workspace Read the OMS specification document
```

```
@workspace Show me the contents of specs/domain-model_spec.md
```

```
@workspace Read the manifesto.md file
```

```
@workspace Read the first 5000 characters of specs/oms_spec.md
```

**Advanced Usage (with pagination):**
```
@workspace Read specs/oms_spec.md starting at character 10000, limit 5000 characters
```

**Sample Response:**
```json
{
  "path": "specs/oms_spec.md",
  "content": "# Order Management System Specification\n\n## 1. Introduction...",
  "totalLength": 10485,
  "from": 0,
  "to": 10485
}
```

---

### 3. `searchDomainDocs`

**Purpose:** Keyword search across all documents. Fast term-frequency based matching.

**Tool Signature:**
```java
List<SearchHit> searchDomainDocs(String query, Integer topK)
```

**Parameters:**
- `query` - Keywords to search for (space-separated)
- `topK` - Number of top results to return (optional, default: 5, max: 50)

**Example Queries:**

```
@workspace Search specs for "state machine"
```

```
@workspace Find documents mentioning "PostgreSQL"
```

```
@workspace Which specs discuss "validation rules"?
```

```
@workspace Search for "CQRS event sourcing" and show top 10 results
```

```
@workspace Find all references to "Kafka streaming"
```

**Sample Response:**
```json
[
  {
    "path": "specs/oms_spec.md",
    "score": 15,
    "snippet": "...implements a state machine for order lifecycle management..."
  },
  {
    "path": "specs/domain-model_spec.md",
    "score": 8,
    "snippet": "...state transitions are validated by the State Machine Engine..."
  }
]
```

---

### 4. `listDocSections`

**Purpose:** Get the table of contents (all headings) from a markdown document.

**Tool Signature:**
```java
List<DocSection> listDocSections(String path)
```

**Parameters:**
- `path` - Relative path to document

**Example Queries:**

```
@workspace Show me the table of contents for specs/oms_spec.md
```

```
@workspace List all sections in the domain model specification
```

```
@workspace What sections are in specs/streaming_spec.md?
```

```
@workspace Give me an outline of the OMS spec document
```

**Sample Response:**
```json
[
  {
    "title": "Order Management System (OMS) State Store Specification",
    "level": 1,
    "lineNumber": 1
  },
  {
    "title": "1. Introduction",
    "level": 2,
    "lineNumber": 3
  },
  {
    "title": "2. Goals",
    "level": 2,
    "lineNumber": 7
  },
  {
    "title": "5. Domain Model",
    "level": 2,
    "lineNumber": 31
  },
  {
    "title": "Core Domain Objects",
    "level": 3,
    "lineNumber": 33
  }
]
```

---

### 5. `readDocSection`

**Purpose:** Read a specific section from a document (includes all subsections).

**Tool Signature:**
```java
DocContent readDocSection(String path, String sectionTitle)
```

**Parameters:**
- `path` - Relative path to document
- `sectionTitle` - Section heading (case-insensitive, partial match supported)

**Example Queries:**

```
@workspace Read the "Domain Model" section from specs/oms_spec.md
```

```
@workspace Show me the "Goals" section from the OMS specification
```

```
@workspace Read the State Machine Engine section
```

```
@workspace Get the "Validation Engine" section from specs/domain-model_spec.md
```

```
@workspace Show me what the manifesto says about code quality
```

**Sample Response:**
```json
{
  "path": "specs/oms_spec.md#Domain Model",
  "content": "## 5. Domain Model\n\n### Core Domain Objects:\n- **Order**...",
  "totalLength": 1250,
  "from": 0,
  "to": 1250
}
```

---

### 6. `searchDocSections`

**Purpose:** Search within document sections for more precise, context-aware results.

**Tool Signature:**
```java
List<SectionSearchHit> searchDocSections(String query, Integer topK)
```

**Parameters:**
- `query` - Keywords to search for
- `topK` - Number of top results (optional, default: 5, max: 50)

**Example Queries:**

```
@workspace Search sections for "validation rules"
```

```
@workspace Find sections discussing "error handling"
```

```
@workspace Which sections mention "PostgreSQL indexes"?
```

```
@workspace Search for "state transition" in document sections, show top 10
```

**Sample Response:**
```json
[
  {
    "path": "specs/domain-model_spec.md",
    "sectionTitle": "Validation Engine",
    "sectionLevel": 2,
    "score": 12,
    "snippet": "...predicate-based validation rules that can be composed..."
  },
  {
    "path": "specs/oms_spec.md",
    "sectionTitle": "Domain Model",
    "sectionLevel": 2,
    "score": 8,
    "snippet": "...validation occurs at the entity level using JSR-303..."
  }
]
```

---

## Semantic Search Tools

These tools use vector embeddings for meaning-based search. **Requires Docker setup** (see [README_SEMANTIC_SEARCH.md](README_SEMANTIC_SEARCH.md)).

### 7. `semanticSearchDocs`

**Purpose:** Find documents by meaning and context, not just keywords. Uses AI embeddings.

**Tool Signature:**
```java
List<SemanticSearchResult> semanticSearchDocs(String query, Integer topK, Double similarityThreshold)
```

**Parameters:**
- `query` - Natural language query
- `topK` - Number of results (optional, default: 5, max: 20)
- `similarityThreshold` - Minimum similarity 0.0-1.0 (optional, default: 0.5)

**Example Queries:**

```
@workspace Use semanticSearchDocs to find information about error handling
```

```
@workspace Semantic search: "How do we handle transaction failures?"
```

```
@workspace Find docs about database persistence strategies using semantic search
```

```
@workspace Use semanticSearchDocs to find content about state management, top 10 results
```

```
@workspace Semantic search for "order lifecycle" with high precision (threshold 0.8)
```

**Advanced Usage:**
```
@workspace Use semanticSearchDocs with query "data consistency patterns", topK 15, threshold 0.6
```

**Sample Response:**
```json
[
  {
    "path": "specs/state-query-store_spec.md",
    "content": "...ensures ACID properties through PostgreSQL transactions...",
    "similarity": 0.89,
    "metadata": {
      "filename": "state-query-store_spec.md",
      "section": "Transaction Management"
    }
  },
  {
    "path": "specs/oms_spec.md",
    "content": "...implements optimistic locking for concurrent updates...",
    "similarity": 0.82,
    "metadata": {
      "filename": "oms_spec.md",
      "section": "Concurrency Control"
    }
  }
]
```

**When to Use:**
- ✅ Natural language questions ("How do we...?")
- ✅ Concept exploration (finds related topics)
- ✅ When you don't know exact terminology
- ✅ Finding synonyms (e.g., "order creation" finds "order submission")

**When NOT to Use:**
- ❌ Looking for exact technical terms (use `searchDomainDocs` instead)
- ❌ Need sub-50ms response times (semantic search is ~200-500ms)

---

### 8. `getVectorStoreInfo`

**Purpose:** Check vector database status and statistics.

**Tool Signature:**
```java
VectorStoreInfo getVectorStoreInfo()
```

**Example Queries:**

```
@workspace Is semantic search enabled? Check the vector store status
```

```
@workspace Use getVectorStoreInfo to see how many documents are indexed
```

```
@workspace Show me vector database statistics
```

**Sample Response:**
```json
{
  "type": "Qdrant",
  "collectionName": "domain-docs",
  "pointsCount": 127,
  "vectorsCount": 127,
  "segmentsCount": 1,
  "vectorSize": 768,
  "distanceMetric": "COSINE",
  "indexing": false,
  "status": "ACTIVE",
  "notes": "Vector store is operational. 127 document chunks indexed. Use semanticSearchDocs for semantic search queries."
}
```

---

## OMS Query Tools

Tools for querying the OMS backend system.

### 9. `searchOrders`

**Purpose:** Search OMS orders with typed filters, pagination, and sorting.

**Tool Signature:**
```java
OrderSearchResponse searchOrders(OrderSearchFilters filters, Integer page, Integer size, String sort)
```

**Parameters:**
- `filters` - Filter object with optional fields (see below)
- `page` - Page number, 0-based (optional, default: 0)
- `size` - Page size (optional, default: 20)
- `sort` - Sort spec like "transactTime,DESC" (optional)

**Available Filters:**
- `orderId` - Exact order ID
- `orderIdLike` - Pattern match (e.g., "01K6%")
- `symbol` - Security symbol (e.g., "INTC")
- `symbolLike` - Symbol pattern
- `account` - Account identifier
- `side` - Order side: `BUY`, `SELL`, `SELL_SHORT`, `SUBSCRIBE`, `REDEEM`
- `ordType` - Order type: `MARKET`, `LIMIT`, `STOP`, `STOP_LIMIT`, `MARKET_ON_CLOSE`
- `state` - Order state: `NEW`, `UNACK`, `LIVE`, `FILLED`, `CXL`, `REJ`, `CLOSED`, `EXP`
- `cancelState` - Cancel state: `CXL`, `PCXL`, `PMOD`, `REJ`
- `price` - Exact price
- `priceGt`, `priceGte`, `priceLt`, `priceLte` - Price comparisons
- `priceBetween` - Price range (e.g., "20.00,25.00")
- `orderQtyBetween`, `orderQtyGt`, `orderQtyLt` - Quantity filters
- `transactTimeBetween` - Time range (ISO 8601 format)
- `sendingTimeBetween`, `expireTimeBetween` - Other time ranges

**Example Queries:**

**Simple Searches:**
```
@workspace Search for all BUY orders
```

```
@workspace Find orders for symbol INTC
```

```
@workspace Show me FILLED orders
```

```
@workspace Get all LIMIT orders for account ACC123
```

**With Pagination:**
```
@workspace Search for SELL orders, show page 2 with 50 results per page
```

```
@workspace Find BUY orders, first page, 100 results
```

**With Sorting:**
```
@workspace Search for all orders, sort by transaction time descending
```

```
@workspace Find INTC orders sorted by price ascending
```

**Complex Filters:**
```
@workspace Search for LIMIT orders where symbol is INTC and price is between 20 and 25
```

```
@workspace Find BUY orders with quantity greater than 100
```

```
@workspace Search for orders created between 2025-10-01 and 2025-10-31, sorted by time
```

**Advanced Multi-Filter:**
```
@workspace Find orders matching:
- Symbol: INTC
- Side: BUY
- Price greater than 20.00
- Quantity between 100 and 500
- State: LIVE
Sort by transaction time descending, page 0, size 20
```

**Sample Response:**
```json
{
  "page": 0,
  "size": 20,
  "totalElements": 145,
  "totalPages": 8,
  "content": [
    {
      "orderId": "01K6PVA884EMR9C4ZC4FTSWKBH",
      "symbol": "INTC",
      "side": "BUY",
      "ordType": "LIMIT",
      "price": "22.35",
      "orderQty": "200",
      "state": "LIVE",
      "transactTime": "2025-10-10T14:30:00Z"
    }
  ]
}
```

---

## Health Check Tools

### 10. `ping`

**Purpose:** Verify MCP server connectivity and tool discovery.

**Tool Signature:**
```java
String ping()
```

**Example Queries:**

```
@workspace Ping the MCP server
```

```
@workspace Test connectivity
```

```
@workspace Is the MCP server running?
```

**Sample Response:**
```
"pong"
```

---

## Complete Workflow Examples

### Example 1: Implement a New Feature from Specs

**Goal:** Create the `OrderValidator` class following specifications.

```
@workspace I need to create OrderValidator:

1. Search specs for "validation"
2. Read the "Validation Engine" section from domain-model_spec.md
3. List sections in oms_spec.md to see if there's validation info
4. Generate OrderValidator.java following the predicate-based pattern from the specs
5. Include Javadoc with spec references
```

---

### Example 2: Debug Production Issue

**Goal:** Find orders that failed validation.

```
@workspace Help me debug order validation failures:

1. Search for orders with state=REJ in the last 24 hours
2. Search specs for "validation rules" to understand what might have failed
3. Read the State Machine Engine section to see valid state transitions
4. Compare the rejected orders against the spec requirements
```

---

### Example 3: Code Review with Spec Validation

**Goal:** Verify implementation matches specifications.

```
@workspace Review OrderService.java for spec compliance:

1. Read the current OrderService.java implementation
2. Search specs for "service layer" and "CQRS"
3. Read the Architecture section from oms_spec.md
4. Compare our implementation against spec requirements
5. List any deviations or missing features
6. Suggest specific improvements with spec references
```

---

### Example 4: Onboard New Developer

**Goal:** Learn the domain model quickly.

```
@workspace I'm new to the project. Help me understand the domain model:

1. List all available spec documents
2. Read the "Introduction" section from oms_spec.md
3. Read the entire domain-model_spec.md
4. Search for "state machine" to understand order lifecycle
5. Summarize the core entities and their relationships
```

---

### Example 5: Explore Related Concepts

**Goal:** Understand error handling using semantic search.

```
@workspace I need to understand our error handling strategy:

1. Use semanticSearchDocs to find information about error handling
2. Use semanticSearchDocs to find content about retry mechanisms
3. Use semanticSearchDocs to find transaction rollback procedures
4. Read the relevant sections found
5. Summarize our error handling patterns
```

---

## Tips for Effective Tool Usage

### 1. Start Broad, Then Narrow

```
# Step 1: Discover
@workspace What specs do we have?

# Step 2: Explore
@workspace List sections in specs/oms_spec.md

# Step 3: Deep Dive
@workspace Read the "Domain Model" section from specs/oms_spec.md
```

### 2. Combine Multiple Tools

```
@workspace Help me implement Order entity:
1. Search specs for "Order entity"
2. Read the Domain Model section
3. Search for existing Order orders to see real data
4. Generate Order.java following the spec pattern
```

### 3. Use Semantic Search for Concepts, Keyword Search for Terms

```
# Use keyword search for specific terms:
@workspace Search specs for "PostgreSQL"

# Use semantic search for concepts:
@workspace Use semanticSearchDocs to find database persistence strategies
```

### 4. Leverage Section Navigation for Large Docs

```
# Don't do this:
@workspace Read specs/oms_spec.md  # Might be huge!

# Do this instead:
@workspace List sections in specs/oms_spec.md
@workspace Read the "Domain Model" section from specs/oms_spec.md
```

### 5. Include Context in Your Requests

```
# Less effective:
@workspace Search for validation

# More effective:
@workspace Search specs for "order validation rules" to understand what validations are required for new orders
```

---

## Troubleshooting

### Tool Not Found

**Problem:** Copilot says "No tool found for this request"

**Solutions:**
1. Verify MCP server is running: `@workspace Ping the MCP server`
2. Check `.vscode/mcp.json` configuration exists
3. Reload VS Code window
4. Check server logs in `logs/spring-ai.log`

### No Results from Search

**Problem:** `searchDomainDocs` returns empty results

**Solutions:**
1. Try broader keywords: "order" instead of "order validation rules"
2. Check document list: `@workspace List all spec documents`
3. Verify specs exist in configured path (check `application.yml`)

### Semantic Search Not Available

**Problem:** `semanticSearchDocs` fails or returns error

**Solutions:**
1. Check vector store: `@workspace Use getVectorStoreInfo`
2. Verify Docker containers running: `docker-compose ps`
3. Check if semantic search is enabled in `application.yml`
4. See [README_SEMANTIC_SEARCH.md](README_SEMANTIC_SEARCH.md) for setup

### Section Not Found

**Problem:** `readDocSection` says "Section not found"

**Solutions:**
1. List sections first: `@workspace List sections in specs/oms_spec.md`
2. Use exact section title (case-insensitive but must match)
3. Try partial match: "Domain" instead of "5. Domain Model"

---

## Quick Reference Card

| Task | Tool | Example |
|------|------|---------|
| **Discover docs** | `listDomainDocs` | `@workspace What specs do we have?` |
| **Read full doc** | `readDomainDoc` | `@workspace Read specs/oms_spec.md` |
| **Search keywords** | `searchDomainDocs` | `@workspace Search specs for "CQRS"` |
| **Get outline** | `listDocSections` | `@workspace List sections in oms_spec` |
| **Read section** | `readDocSection` | `@workspace Read Domain Model section` |
| **Search sections** | `searchDocSections` | `@workspace Search sections for "validation"` |
| **Semantic search** | `semanticSearchDocs` | `@workspace Semantic search: "error handling"` |
| **Vector DB info** | `getVectorStoreInfo` | `@workspace Check vector store status` |
| **Query orders** | `searchOrders` | `@workspace Find BUY orders for INTC` |
| **Health check** | `ping` | `@workspace Ping the server` |

---

## Related Documentation

- **[Quick Start Guide](QUICK_START_GUIDE.md)** - Get started in 5 minutes
- **[Copilot Integration Guide](COPILOT_KNOWLEDGE_INTEGRATION_GUIDE.md)** - Complete workflow guide
- **[Copilot Prompts Library](COPILOT_PROMPTS_LIBRARY.md)** - Ready-to-use prompts
- **[Quick Reference](QUICK_REFERENCE.md)** - Tool signatures cheat sheet
- **[Semantic Search Setup](README_SEMANTIC_SEARCH.md)** - Vector search configuration

---

**Last Updated:** 2025-10-10
