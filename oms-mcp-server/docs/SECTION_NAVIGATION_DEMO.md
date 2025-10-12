# Section Navigation Feature Demo

## New MCP Tools for Better Spec Navigation

Your MCP server now includes powerful section-level navigation tools that make it much easier to work with large specification documents.

## The Problem

Your OMS specs are comprehensive (200+ lines) with multiple sections. Previously:
- Had to read entire documents or use character offsets
- Keyword search returned snippets but not structured sections
- Hard to navigate to specific topics like "Domain Model" or "Query API"

## The Solution

Three new tools that understand markdown structure:

### 1. `listDocSections` - Get Document Outline

**Purpose**: See the structure of a document at a glance

**Example Request**:
```json
{
  "tool": "listDocSections",
  "path": "specs/oms_spec.md"
}
```

**Returns**:
```json
[
  {"title": "Order Management System (OMS) State Store Specification", "level": 1, "lineNumber": 1},
  {"title": "1. Introduction", "level": 2, "lineNumber": 3},
  {"title": "2. Goals", "level": 2, "lineNumber": 7},
  {"title": "3. Architecture and Principles", "level": 2, "lineNumber": 15},
  {"title": "4. Technology Stack", "level": 2, "lineNumber": 22},
  {"title": "5. Domain Model", "level": 2, "lineNumber": 31},
  {"title": "Core Domain Objects", "level": 3, "lineNumber": 33},
  ...
]
```

**Use Cases**:
- "Show me the table of contents for the OMS spec"
- "What sections are in the domain model spec?"
- Understanding document structure before diving in

### 2. `readDocSection` - Read Specific Section

**Purpose**: Extract just the content you need from a large document

**Example Request**:
```json
{
  "tool": "readDocSection",
  "path": "specs/oms_spec.md",
  "sectionTitle": "Domain Model"
}
```

**Returns**:
```json
{
  "path": "specs/oms_spec.md#Domain Model",
  "content": "## 5. Domain Model\n\n*   **Core Domain Objects:**\n    *   `Order`\n    ...",
  "totalLength": 1250,
  "from": 0,
  "to": 1250
}
```

**Features**:
- Automatically finds section by title (case-insensitive, fuzzy matching)
- Includes all subsections (e.g., "5.1", "5.2" under "5. Domain Model")
- Stops at next same-level or higher-level heading
- Returns section with full context

**Use Cases**:
- "Read the Domain Model section from the OMS spec"
- "Show me what the spec says about the Query API"
- "Get the Technology Stack section"

### 3. `searchDocSections` - Smart Section Search

**Purpose**: Find relevant sections across all documents, not just snippets

**Example Request**:
```json
{
  "tool": "searchDocSections",
  "query": "state machine validation",
  "topK": 5
}
```

**Returns**:
```json
[
  {
    "path": "specs/domain-model_spec.md",
    "sectionTitle": "State Machine Engine",
    "level": 3,
    "score": 15,
    "snippet": "… generic state machine implementation for managing lifecycle of domain objects. It enforces state transition rules …"
  },
  {
    "path": "specs/oms_spec.md",
    "sectionTitle": "Validation Engine",
    "level": 2,
    "score": 12,
    "snippet": "… validation engine based on Java predicates. It allows defining and executing validation rules …"
  }
]
```

**Advantages over `searchDomainDocs`**:
- Returns section context (you know which part of the document matches)
- Better precision (matches in focused sections)
- Includes section title and level for navigation
- Can directly follow up with `readDocSection`

**Use Cases**:
- "Find all sections mentioning state machines"
- "Where do the specs discuss validation?"
- "Search for API contracts in the specifications"

## Workflow Examples

### Example 1: Understanding a New Concept

**User**: "What does the OMS use for orchestration?"

**Copilot Workflow**:
1. Calls `searchDocSections(query="orchestration", topK=5)`
2. Finds "Orchestration Engine" section in domain-model_spec.md
3. Calls `readDocSection(path="specs/domain-model_spec.md", sectionTitle="Orchestration Engine")`
4. Responds with full context about the orchestration engine

### Example 2: Navigating Specifications

**User**: "Give me an overview of the OMS spec structure"

**Copilot Workflow**:
1. Calls `listDocSections(path="specs/oms_spec.md")`
2. Returns formatted outline showing all major sections
3. User asks: "Tell me more about section 5"
4. Calls `readDocSection(path="specs/oms_spec.md", sectionTitle="5. Domain Model")`

### Example 3: Multi-Document Research

**User**: "How do specs handle DTOs and mapping?"

**Copilot Workflow**:
1. Calls `searchDocSections(query="DTO mapping MapStruct", topK=5)`
2. Finds relevant sections in domain-model_spec.md
3. Reads matching sections
4. Synthesizes answer from multiple section contexts

## Technical Details

### Markdown Parsing
- Recognizes standard markdown headings (`#`, `##`, `###`, etc.)
- Preserves heading hierarchy
- Handles various heading styles (trailing `#` optional)

### Section Extraction
- A section includes its heading and all content until the next same-level or higher-level heading
- Subsections are included (e.g., `###` under `##`)
- Line numbers are 1-based for easy reference

### Search Scoring
- Same keyword frequency scoring as `searchDomainDocs`
- But applied to individual sections
- More focused results since search scope is smaller

### Case Insensitivity
- Section title matching is case-insensitive
- Supports fuzzy matching (prefix match)
- "domain model" matches "5. Domain Model" or "Domain Model Organization"

## Migration from Old Approach

### Before (Reading Full Documents)
```
User: "What does the spec say about validation?"
Copilot: reads entire 220-line oms_spec.md, searches for keywords
Problem: Lots of irrelevant content, token waste
```

### After (Section Navigation)
```
User: "What does the spec say about validation?"
Copilot: searchDocSections("validation") → finds "Validation Engine" section
         → readDocSection to get just that section
Result: Precise, focused content
```

## Best Practices for Copilot

1. **Start with Search**: Use `searchDocSections` to find relevant content
2. **Get Structure First**: Use `listDocSections` when users ask "what's in" or "show me sections"
3. **Read Precisely**: Use `readDocSection` instead of full document when you know the section
4. **Combine Tools**: Search → List Sections → Read Section for complex queries

## Configuration

No changes needed! The new tools work with your existing configuration:
- Same `domain.docs.paths` property
- Same file type support (`.md`, `.markdown`, `.txt`, `.adoc`)
- Same path resolution and security

## Performance

- **Faster**: Reading sections is faster than full documents
- **Cheaper**: Fewer tokens consumed (only relevant sections)
- **Smarter**: Better context understanding with section boundaries

## Try It Out

In GitHub Copilot Chat:

1. **List sections**: "@workspace Call listDocSections with path='specs/oms_spec.md'"
2. **Read a section**: "@workspace Read the 'Domain Model' section from specs/oms_spec.md"
3. **Search sections**: "@workspace Search sections for 'state machine' in specs"

The tools will automatically be available once you rebuild and restart the MCP server.
