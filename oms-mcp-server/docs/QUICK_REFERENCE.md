# Quick Reference: MCP Server Tools for OMS Specs

## 🎯 Use This When You Need To...

### Discover What's Available
**"What specs do we have?"**
```
Tool: listDomainDocs()
Returns: List of all .md/.txt files with metadata
```

### See Document Structure  
**"What's in the OMS spec?"**
```
Tool: listDocSections(path="specs/oms_spec.md")
Returns: Outline with all headings and levels
```

### Read Entire Document
**"Show me the whole manifesto"**
```
Tool: readDomainDoc(path="specs/manifesto.md")
Returns: Full document content
```

### Read Just One Section
**"What does section 5 say about domain models?"**
```
Tool: readDocSection(path="specs/oms_spec.md", sectionTitle="Domain Model")
Returns: Just that section and its subsections
```

### Find Documents by Keyword
**"Which docs mention PostgreSQL?"**
```
Tool: searchDomainDocs(query="PostgreSQL", topK=5)
Returns: Top 5 documents with snippets
```

### Find Sections by Keyword
**"Where do specs discuss state machines?"**
```
Tool: searchDocSections(query="state machine", topK=5)
Returns: Top 5 matching sections with titles and snippets
```

### Semantic Search (Optional - Requires Docker)
**"Find documents about error handling concepts"**
```
Tool: semanticSearchDocs(query="how to handle failures", topK=5, similarityThreshold=0.5)
Returns: Documents ranked by semantic similarity (not just keywords)
```

### Check Vector Database Status
**"Is semantic search available?"**
```
Tool: getVectorStoreInfo()
Returns: Vector DB status, document count, configuration
```

---

## 💡 Common Patterns

### Pattern 1: Explore Unknown Territory
```
1. listDomainDocs() → see what files exist
2. listDocSections(path=...) → see structure of interesting file
3. readDocSection(path=..., sectionTitle=...) → read relevant section
```

### Pattern 2: Answer Specific Question
```
1. searchDocSections(query="your topic", topK=5) → find relevant sections
2. readDocSection(path=..., sectionTitle=...) → get full section content
3. Synthesize answer from section(s)
```

### Pattern 3: Deep Dive
```
1. searchDomainDocs(query="broad topic") → find relevant documents
2. listDocSections(path=...) → see document structure  
3. readDocSection → read specific sections of interest
```

### Pattern 4: Semantic Discovery (Requires Docker)
```
1. semanticSearchDocs(query="conceptual question") → find by meaning
2. readDomainDoc(path=...) → read top matches
3. Cross-reference with keyword search if needed
```

---

## 🚀 Example Copilot Queries

Try these in Copilot Chat:

```
@workspace What domain specs are available?

@workspace List all sections in the OMS specification

@workspace What does the OMS spec say about validation?

@workspace Read the Technology Stack section from the OMS spec

@workspace Find all sections that mention Kafka

@workspace Show me the table of contents for the domain model spec

@workspace What are the core domain objects according to the specs?

@workspace Search specs for information about state machines

@workspace Use semantic search to find how we handle transaction failures

@workspace Is semantic search enabled? Check vector store status
```

---

## 📁 Your Spec Files

Located in: `/home/tbaderts/data/workspace/oms/specs/`

- **oms_spec.md** - Main OMS State Store specification
- **domain-model_spec.md** - Domain model organization & libraries
- **state-query-store_spec.md** - State store design details
- **streaming_spec.md** - Streaming architecture
- **software-architecture-methodology_spec.md** - Development methodology
- **manifesto.md** - Team manifesto
- **skill_profiles.md** - Skill profiles
- **oms_future_considerations.md** - Future enhancements
- **todo.txt** - TODO items

---

## ⚙️ Configuration

### Current Setup
```yaml
# application.yml
domain:
  docs:
    paths: "oms/specs"  # Scans this directory
```

### Add More Directories
```yaml
domain:
  docs:
    paths: "oms/specs,simulator/specs,/abs/path/to/more/docs"
```

Or via environment variable:
```bash
DOMAIN_DOCS_PATHS="oms/specs,other/docs"
```

### Enable Semantic Search (Optional)
```bash
# Start Qdrant + Ollama with Docker
docker-compose up -d

# Index documents
.\setup-semantic-search.ps1  # Windows
./setup-semantic-search.sh   # Linux/macOS
```

See [README_SEMANTIC_SEARCH.md](README_SEMANTIC_SEARCH.md) for details.

---

## 🔧 Troubleshooting

### Tool Not Found
- Reload VS Code window
- Check Copilot MCP config: `~/.config/github-copilot/mcp.json`
- Verify MCP server is running

### Document Not Found
- Use `listDomainDocs()` to see available paths
- Path should be relative: `specs/oms_spec.md` not `/full/path/...`

### Section Not Found
- Use `listDocSections()` first to see available section titles
- Section matching is case-insensitive and fuzzy
- Try just the main words: "Domain Model" instead of "5. Domain Model"

### Semantic Search Not Available
- Check Docker containers: `docker ps` (should see qdrant & ollama)
- Run setup script: `.\setup-semantic-search.ps1`
- Verify with: `getVectorStoreInfo()`
- See [README_SEMANTIC_SEARCH.md](README_SEMANTIC_SEARCH.md)

---

## 📊 Cheat Sheet

| What You Want | Tool to Use | Key Parameters |
|---------------|-------------|----------------|
| List all specs | `listDomainDocs` | none |
| Full document | `readDomainDoc` | path |
| Partial document | `readDomainDoc` | path, offset, limit |
| Document outline | `listDocSections` | path |
| One section | `readDocSection` | path, sectionTitle |
| Find documents | `searchDomainDocs` | query, topK |
| Find sections | `searchDocSections` | query, topK |
| Semantic search | `semanticSearchDocs` | query, topK, similarityThreshold |
| Vector DB status | `getVectorStoreInfo` | none |

---

## 🎓 Pro Tips

1. **Start with search** if you don't know which doc to read
2. **List sections first** for unfamiliar documents
3. **Read sections** instead of full docs to save tokens
4. **Use section search** for more precise results than document search
5. **Fuzzy matching** works for section titles - don't need exact match
6. **Semantic search** finds by meaning, not just keywords - great for "how do we..." questions
7. **Check vector store** with `getVectorStoreInfo()` before using semantic search

---

## 🔍 Keyword vs Semantic Search

### Use Keyword Search When:
- Looking for specific terms: "PostgreSQL", "Kafka", "validation"
- You know the exact terminology used in docs
- Fast lookups needed

### Use Semantic Search When:
- Conceptual questions: "how do we handle errors?"
- Don't know exact keywords
- Looking for related concepts
- Understanding patterns and approaches

**Example:**
- Keyword: `searchDomainDocs(query="PostgreSQL")` → finds "PostgreSQL" mentions
- Semantic: `semanticSearchDocs(query="database technology")` → finds PostgreSQL, MySQL, etc.

---

Made with ❤️ for efficient OMS spec navigation in GitHub Copilot
