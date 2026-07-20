package org.example.mcp.kb;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.example.mcp.docs.DocumentRepository;
import org.example.mcp.docs.DocumentRepository.DocMeta;
import org.example.mcp.docs.MarkdownAnchors;
import org.example.mcp.docs.MarkdownParser;
import org.example.mcp.docs.MarkdownParser.DocSection;
import org.example.mcp.index.KnowledgeIndexService;
import org.example.mcp.index.KnowledgeIndexService.IndexStats;
import org.example.mcp.index.KnowledgeIndexService.SearchHit;
import org.example.mcp.index.KnowledgeIndexService.SearchResponse;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import lombok.extern.slf4j.Slf4j;

/**
 * The consolidated agent-facing knowledge base tools.
 *
 * Three tools replace the previous eight overlapping search/read variants:
 * <ol>
 *   <li>{@code getKnowledgeBaseOverview} — orientation: what exists, where</li>
 *   <li>{@code searchKnowledgeBase} — one search entry point (hybrid BM25 +
 *       vector + RRF, falling back to BM25-only automatically)</li>
 *   <li>{@code readKnowledgeBase} — read a doc or a cited section in full</li>
 * </ol>
 *
 * All results carry stable {@code path#anchor} citations that feed directly
 * into {@code readKnowledgeBase}. Responses are markdown for reliable model
 * consumption.
 */
@Slf4j
@Component
public class KnowledgeBaseTools {

    private static final int DEFAULT_TOP_K = 5;
    private static final int MAX_TOP_K = 20;
    private static final int EXCERPT_CHARS = 400;

    private final KnowledgeIndexService index;
    private final DocumentRepository documentRepository;
    private final MarkdownParser markdownParser;

    public KnowledgeBaseTools(KnowledgeIndexService index,
                              DocumentRepository documentRepository,
                              MarkdownParser markdownParser) {
        this.index = index;
        this.documentRepository = documentRepository;
        this.markdownParser = markdownParser;
    }

    // ------------------------------------------------------------------
    // searchKnowledgeBase
    // ------------------------------------------------------------------

    @Tool(name = "searchKnowledgeBase", description = """
            Search the OMS knowledge base (specifications, domain concepts, architecture docs). \
            Hybrid retrieval: BM25 keyword search + semantic vector search, fused by rank. \
            Returns the most relevant sections with stable citations of the form 'path#anchor'. \
            To read a result in full, pass its path and anchor to readKnowledgeBase. \
            Call getKnowledgeBaseOverview first in a session to see what documentation exists. \
            Optional filters: category (e.g. 'framework', 'concepts') and status (e.g. 'Complete', 'Draft').""")
    public String searchKnowledgeBase(String query, Integer topK, String category, String status) {
        log.info("[MCP] searchKnowledgeBase query='{}' topK={} category={} status={}",
                query, topK, category, status);
        if (!StringUtils.hasText(query)) {
            return "Error: query must not be empty.";
        }
        int k = topK == null || topK <= 0 ? DEFAULT_TOP_K : Math.min(topK, MAX_TOP_K);
        SearchResponse response = index.search(query, k, category, status);

        StringBuilder md = new StringBuilder();
        md.append("## Knowledge base search: \"").append(query).append("\"\n");
        md.append("Mode: ").append(response.usedVectorSearch()
                ? "hybrid (BM25 + semantic, rank-fused)" : "BM25 keyword only").append(" — ");
        md.append(response.hits().size()).append(" of ")
                .append(response.totalMatches()).append(" matching sections\n\n");

        if (response.hits().isEmpty()) {
            md.append("No matches. Suggestions:\n");
            md.append("- Try different terms (the index covers order lifecycle, executions, quotes, ")
              .append("state machines, validation, streaming architecture, testing patterns)\n");
            md.append("- Call getKnowledgeBaseOverview() to browse all documents and sections\n");
            return md.toString();
        }

        int i = 1;
        for (SearchHit hit : response.hits()) {
            md.append("### ").append(i++).append(". `").append(hit.citation()).append("`\n");
            md.append("**").append(hit.breadcrumb()).append("**");
            md.append(" (lines ").append(hit.startLine()).append("-").append(hit.endLine());
            if (hit.status() != null) md.append(", status: ").append(hit.status());
            md.append(")\n\n");
            md.append(quote(excerpt(hit.text()))).append("\n\n");
        }

        if (response.totalMatches() > response.hits().size()) {
            md.append("_").append(response.totalMatches() - response.hits().size())
              .append(" further matching sections — refine the query or raise topK (max ")
              .append(MAX_TOP_K).append(")._\n");
        }
        md.append("\nTo read any result in full: `readKnowledgeBase(path, anchor)`.\n");
        return md.toString();
    }

    // ------------------------------------------------------------------
    // readKnowledgeBase
    // ------------------------------------------------------------------

    @Tool(name = "readKnowledgeBase", description = """
            Read a knowledge base document or a single section of it. \
            'path' is a document path as returned by searchKnowledgeBase or getKnowledgeBaseOverview \
            (e.g. 'oms-knowledge-base/oms-framework/domain-model_spec.md'). \
            'anchor' (optional) selects one section by its anchor from a citation 'path#anchor' \
            (a section title also works). Without an anchor the whole document is returned \
            with its section outline; use offset/limit (characters) to paginate very long documents.""")
    public String readKnowledgeBase(String path, String anchor, Integer offset, Integer limit) {
        log.info("[MCP] readKnowledgeBase path={} anchor={} offset={} limit={}", path, anchor, offset, limit);
        if (!StringUtils.hasText(path)) {
            return "Error: path must be provided.";
        }
        String content;
        try {
            content = documentRepository.readContent(path.trim());
        } catch (Exception e) {
            return "Error: " + e.getMessage() + "\nUse getKnowledgeBaseOverview() to list valid paths.";
        }

        if (StringUtils.hasText(anchor)) {
            return readSection(path.trim(), content, anchor.trim());
        }
        return readWholeDoc(path.trim(), content, offset, limit);
    }

    private String readSection(String path, String content, String anchor) {
        String[] lines = content.split("\n", -1);
        List<DocSection> sections = markdownParser.extractSections(content);
        List<String> anchors = MarkdownAnchors.assignAnchors(sections);

        int found = -1;
        for (int i = 0; i < sections.size(); i++) {
            if (anchors.get(i).equalsIgnoreCase(anchor)
                    || sections.get(i).title().equalsIgnoreCase(anchor)
                    || MarkdownAnchors.slugify(sections.get(i).title()).equalsIgnoreCase(
                            MarkdownAnchors.slugify(anchor))) {
                found = i;
                break;
            }
        }
        if (found < 0) {
            StringBuilder md = new StringBuilder();
            md.append("Error: no section with anchor '").append(anchor).append("' in ").append(path).append(".\n\n");
            md.append("Available sections:\n");
            for (int i = 0; i < sections.size(); i++) {
                md.append("- `#").append(anchors.get(i)).append("` — ").append(sections.get(i).title()).append("\n");
            }
            return md.toString();
        }

        DocSection section = sections.get(found);
        String sectionText = markdownParser.extractSectionContent(lines, section);
        int endLine = section.lineNumber() + (int) sectionText.lines().count() - 1;

        StringBuilder md = new StringBuilder();
        md.append("## `").append(path).append("#").append(anchors.get(found)).append("`\n");
        md.append("Lines ").append(section.lineNumber()).append("-").append(endLine).append("\n\n");
        md.append(sectionText);
        return md.toString();
    }

    private String readWholeDoc(String path, String content, Integer offset, Integer limit) {
        int length = content.length();
        int from = offset == null ? 0 : Math.clamp(offset, 0, length);
        int to = limit == null ? length : Math.clamp((long) from + Math.max(0, limit), from, length);
        String slice = content.substring(from, to);

        StringBuilder md = new StringBuilder();
        md.append("## `").append(path).append("`");
        if (from > 0 || to < length) {
            md.append(" (characters ").append(from).append("-").append(to).append(" of ").append(length).append(")");
        }
        md.append("\n\n");
        md.append(slice);

        if (from == 0 && to == length) {
            List<DocSection> sections = markdownParser.extractSections(content);
            List<String> anchors = MarkdownAnchors.assignAnchors(sections);
            if (!sections.isEmpty()) {
                md.append("\n\n---\n**Section outline** (use `readKnowledgeBase(path, anchor)` to re-read one):\n");
                for (int i = 0; i < sections.size(); i++) {
                    DocSection s = sections.get(i);
                    md.append("  ".repeat(Math.max(0, s.level() - 1)))
                      .append("- `#").append(anchors.get(i)).append("` ").append(s.title())
                      .append(" (line ").append(s.lineNumber()).append(")\n");
                }
            }
        } else if (to < length) {
            md.append("\n\n_Document continues — call again with offset=").append(to).append("._\n");
        }
        return md.toString();
    }

    // ------------------------------------------------------------------
    // getKnowledgeBaseOverview
    // ------------------------------------------------------------------

    @Tool(name = "getKnowledgeBaseOverview", description = """
            Get an index of the whole OMS knowledge base: every document with its metadata \
            (version, status, category), a one-line summary and its top-level sections with anchors. \
            Call this once at the start of a session for orientation, then use searchKnowledgeBase \
            for questions and readKnowledgeBase to read documents or sections.""")
    public String getKnowledgeBaseOverview() {
        log.info("[MCP] getKnowledgeBaseOverview");
        List<DocMeta> docs = documentRepository.listAll();
        IndexStats stats = index.getStats();

        StringBuilder md = new StringBuilder();
        md.append("# OMS Knowledge Base Overview\n\n");
        md.append("- Documents: ").append(docs.size())
          .append(" (").append(stats.totalBytes() / 1024).append(" KB, ")
          .append(stats.chunkCount()).append(" indexed sections)\n");
        md.append("- Search: ").append(stats.vectorSearchEnabled()
                ? "hybrid — BM25 + semantic embeddings (" + stats.embeddingModel() + ")"
                : "BM25 keyword (semantic embeddings unavailable)").append("\n");
        if (stats.lastIndexedIso() != null) {
            md.append("- Indexed at: ").append(stats.lastIndexedIso()).append("\n");
        }
        md.append("\n");

        // Group by top-level directory
        Map<String, List<DocMeta>> groups = new LinkedHashMap<>();
        for (DocMeta doc : docs) {
            String dir = groupOf(doc.path());
            groups.computeIfAbsent(dir, d -> new ArrayList<>()).add(doc);
        }

        for (Map.Entry<String, List<DocMeta>> group : groups.entrySet()) {
            md.append("## ").append(group.getKey()).append("\n\n");
            for (DocMeta doc : group.getValue()) {
                md.append("### `").append(doc.path()).append("`\n");
                List<String> meta = new ArrayList<>();
                if (doc.version() != null) meta.add("v" + doc.version());
                if (doc.status() != null) meta.add(doc.status());
                if (doc.category() != null) meta.add(doc.category());
                meta.add((doc.size() / 1024) + " KB");
                md.append("_").append(String.join(" · ", meta)).append("_\n");

                try {
                    String content = documentRepository.readContent(doc.path());
                    String summary = summarize(content);
                    if (!summary.isEmpty()) {
                        md.append(summary).append("\n");
                    }
                    List<DocSection> sections = markdownParser.extractSections(content);
                    List<String> anchors = MarkdownAnchors.assignAnchors(sections);
                    List<String> tocEntries = new ArrayList<>();
                    for (int i = 0; i < sections.size(); i++) {
                        if (sections.get(i).level() == 2) {
                            tocEntries.add("`#" + anchors.get(i) + "`");
                        }
                    }
                    if (!tocEntries.isEmpty()) {
                        md.append("Sections: ").append(String.join(", ", tocEntries)).append("\n");
                    }
                } catch (Exception e) {
                    log.debug("[MCP] Could not summarize {}: {}", doc.path(), e.getMessage());
                }
                md.append("\n");
            }
        }
        return md.toString();
    }

    // ----- helpers -----

    private static String groupOf(String path) {
        // "oms-knowledge-base/oms-framework/x.md" -> "oms-framework"
        String[] parts = path.split("/");
        return parts.length >= 3 ? parts[parts.length - 2] : "(root)";
    }

    /** First meaningful paragraph of the document, truncated. */
    static String summarize(String content) {
        for (String paragraph : content.split("\n\\s*\n")) {
            String p = paragraph.strip().replace("\n", " ");
            if (p.isEmpty() || p.startsWith("#") || p.startsWith("**") || p.startsWith("---")
                    || p.startsWith(">") || p.startsWith("|") || p.startsWith("```")
                    || p.startsWith("- ") || p.startsWith("* ")) {
                continue;
            }
            return p.length() <= 220 ? p : p.substring(0, 217) + "...";
        }
        return "";
    }

    private static String excerpt(String text) {
        // Drop the heading line (it is already in the breadcrumb) and compact whitespace
        String body = text.stripLeading();
        if (body.startsWith("#")) {
            int newline = body.indexOf('\n');
            body = newline > 0 ? body.substring(newline + 1) : "";
        }
        body = body.strip().replaceAll("\\n{3,}", "\n\n");
        if (body.length() > EXCERPT_CHARS) {
            int cut = body.lastIndexOf(' ', EXCERPT_CHARS);
            body = body.substring(0, cut > 0 ? cut : EXCERPT_CHARS) + " …";
        }
        return body;
    }

    private static String quote(String text) {
        return "> " + text.replace("\n", "\n> ");
    }
}
