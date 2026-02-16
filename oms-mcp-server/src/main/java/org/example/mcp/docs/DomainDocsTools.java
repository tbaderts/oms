package org.example.mcp.docs;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.example.mcp.docs.DocumentRepository.DocContent;
import org.example.mcp.docs.DocumentRepository.DocMeta;
import org.example.mcp.docs.MarkdownParser.DocSection;
import org.example.mcp.vector.SemanticSearchTools;
import org.example.mcp.vector.SemanticSearchTools.SemanticSearchResult;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import lombok.extern.slf4j.Slf4j;

/**
 * MCP tools to make domain knowledge files available to LLM clients.
 * <p>
 * Delegates to {@link DocumentRepository} for file I/O,
 * {@link MarkdownParser} for section extraction,
 * and {@link KeywordSearchEngine} for term-frequency scoring.
 */
@Slf4j
@Component
public class DomainDocsTools {

    private final DocumentRepository docRepo;
    private final MarkdownParser markdownParser;
    private final KeywordSearchEngine searchEngine;
    private final Optional<SemanticSearchTools> semanticSearchTools;

    public DomainDocsTools(DocumentRepository docRepo,
                           MarkdownParser markdownParser,
                           KeywordSearchEngine searchEngine,
                           @Autowired(required = false) SemanticSearchTools semanticSearchTools) {
        this.docRepo = docRepo;
        this.markdownParser = markdownParser;
        this.searchEngine = searchEngine;
        this.semanticSearchTools = Optional.ofNullable(semanticSearchTools);
        log.info("[MCP] DomainDocsTools initialized. Semantic search available: {}",
            this.semanticSearchTools.isPresent());
    }

    @Tool(name = "listDomainDocs", description = "List available domain documents with metadata.")
    public List<DocMeta> listDomainDocs() {
        return docRepo.listAll();
    }

    @Tool(name = "readDomainDoc", description = "Read the content of a domain document (use listDomainDocs to discover paths).")
    public DocContent readDomainDoc(String path, Integer offset, Integer limit) {
        log.info("[MCP] readDomainDoc called with path={}", path);
        if (!StringUtils.hasText(path)) {
            throw new IllegalArgumentException("path must be provided (relative to a base dir)");
        }
        String content = docRepo.readContent(path);
        int len = content.length();
        int from = offset == null ? 0 : DocumentRepository.clamp(offset, 0, len);
        int to = limit == null ? len : DocumentRepository.clamp(from + Math.max(0, limit), 0, len);
        String slice = content.substring(from, to);
        Path resolved = docRepo.resolveAgainstBases(path);
        String relativePath = resolved != null ? docRepo.relativize(resolved) : path;
        return new DocContent(relativePath, slice, len, from, to);
    }

    @Tool(name = "searchDomainDocs", description = "Keyword search across domain documents with optional metadata filtering. Returns top matches with brief snippets. Filter by status (e.g., 'Complete', 'Draft') or category to narrow results.")
    public List<SearchHit> searchDomainDocs(String query, Integer topK, String filterStatus, String filterCategory) {
        log.info("[MCP] searchDomainDocs called with query={}, topK={}, filterStatus={}, filterCategory={}",
            query, topK, filterStatus, filterCategory);

        if (!StringUtils.hasText(query)) {
            return List.of();
        }
        Set<String> terms = parseTerms(query);
        if (terms.isEmpty()) return List.of();

        int k = (topK == null || topK <= 0) ? 5 : Math.min(topK, 50);
        List<SearchHit> hits = new ArrayList<>();

        for (Path p : docRepo.findAllDocFiles()) {
            String content;
            try { content = Files.readString(p, StandardCharsets.UTF_8); }
            catch (IOException e) { continue; }

            // Extract metadata for filtering
            MarkdownParser.DocMetadata metadata = markdownParser.extractMetadata(content);

            // Apply metadata filters
            if (filterStatus != null && !filterStatus.isBlank()) {
                if (metadata.status() == null || !metadata.status().equalsIgnoreCase(filterStatus.trim())) {
                    continue; // Skip documents that don't match status filter
                }
            }
            if (filterCategory != null && !filterCategory.isBlank()) {
                if (metadata.category() == null || !metadata.category().equalsIgnoreCase(filterCategory.trim())) {
                    continue; // Skip documents that don't match category filter
                }
            }

            int score = searchEngine.scoreContent(content, terms);
            if (score > 0) {
                String snippet = searchEngine.makeSnippet(content, terms.iterator().next());
                hits.add(new SearchHit(docRepo.relativize(p), score, snippet));
            }
        }
        hits.sort(Comparator.comparingInt(SearchHit::score).reversed().thenComparing(SearchHit::path));
        return hits.size() <= k ? hits : new ArrayList<>(hits.subList(0, k));
    }

    @Tool(name = "listDocSections", description = "List all sections/headings in a markdown document for navigation.")
    public List<DocSection> listDocSections(String path) {
        log.info("[MCP] listDocSections called with path={}", path);
        if (!StringUtils.hasText(path)) {
            throw new IllegalArgumentException("path must be provided");
        }
        String content = docRepo.readContent(path);
        return markdownParser.extractSections(content);
    }

    @Tool(name = "readDocSection", description = "Read a specific section from a document by section title (use listDocSections to discover section names).")
    public DocContent readDocSection(String path, String sectionTitle) {
        log.info("[MCP] readDocSection called with path={}, sectionTitle={}", path, sectionTitle);
        if (!StringUtils.hasText(path)) {
            throw new IllegalArgumentException("path must be provided");
        }
        if (!StringUtils.hasText(sectionTitle)) {
            throw new IllegalArgumentException("sectionTitle must be provided");
        }
        String content = docRepo.readContent(path);
        String sectionContent = markdownParser.readSection(content, sectionTitle);
        Path resolved = docRepo.resolveAgainstBases(path);
        String relativePath = resolved != null ? docRepo.relativize(resolved) : path;
        return new DocContent(
                relativePath + "#" + sectionTitle,
                sectionContent,
                sectionContent.length(),
                0,
                sectionContent.length()
        );
    }

    @Tool(name = "searchDocSections", description = "Search within document sections for more precise results. Returns matching sections with context.")
    public List<SectionSearchHit> searchDocSections(String query, Integer topK) {
        log.info("[MCP] searchDocSections called with query={}, topK={}", query, topK);
        if (!StringUtils.hasText(query)) {
            return List.of();
        }
        Set<String> terms = parseTerms(query);
        if (terms.isEmpty()) return List.of();

        int k = (topK == null || topK <= 0) ? 5 : Math.min(topK, 50);
        List<SectionSearchHit> hits = new ArrayList<>();

        for (Path p : docRepo.findAllDocFiles()) {
            String content;
            try { content = Files.readString(p, StandardCharsets.UTF_8); }
            catch (IOException e) { continue; }

            String[] lines = content.split("\n");
            List<DocSection> sections = markdownParser.extractSections(content);
            for (DocSection section : sections) {
                String sectionContent = markdownParser.extractSectionContent(lines, section);
                int score = searchEngine.scoreContent(sectionContent, terms);
                if (score > 0) {
                    String snippet = searchEngine.makeSnippet(sectionContent, terms.iterator().next());
                    hits.add(new SectionSearchHit(
                            docRepo.relativize(p),
                            section.title(),
                            section.level(),
                            score,
                            snippet
                    ));
                }
            }
        }

        hits.sort(Comparator.comparingInt(SectionSearchHit::score).reversed()
                .thenComparing(SectionSearchHit::path)
                .thenComparing(SectionSearchHit::sectionTitle));
        return hits.size() <= k ? hits : new ArrayList<>(hits.subList(0, k));
    }

    @Tool(name = "hybridSearchDocs",
          description = "Hybrid search combining keyword (TF-IDF) and semantic (vector) search for best results. " +
                       "Returns documents ranked by both keyword relevance and semantic similarity. " +
                       "Use this for comprehensive search when you want the benefits of both exact keyword matching and semantic understanding. " +
                       "Requires vector store to be enabled. Weights: keywordWeight (0.0-1.0, default 0.4), semanticWeight (0.0-1.0, default 0.6).")
    public List<HybridSearchHit> hybridSearchDocs(String query, Integer topK,
                                                    Double keywordWeight, Double semanticWeight) {
        log.info("[MCP] hybridSearchDocs called with query={}, topK={}, kwWeight={}, semWeight={}",
            query, topK, keywordWeight, semanticWeight);

        if (!StringUtils.hasText(query)) {
            return List.of();
        }

        // Check if semantic search is available
        if (semanticSearchTools.isEmpty()) {
            log.warn("[MCP] Semantic search not available, falling back to keyword-only search");
            // Fallback to keyword search only
            List<SearchHit> keywordHits = searchDomainDocs(query, topK, null, null);
            return keywordHits.stream()
                .map(hit -> new HybridSearchHit(hit.path(), hit.score(), 0.0, hit.score(),
                    hit.snippet(), "keyword-only"))
                .toList();
        }

        int k = (topK == null || topK <= 0) ? 10 : Math.min(topK, 50);
        double kwWeight = (keywordWeight == null || keywordWeight < 0) ? 0.4 : Math.min(keywordWeight, 1.0);
        double semWeight = (semanticWeight == null || semanticWeight < 0) ? 0.6 : Math.min(semanticWeight, 1.0);

        // Normalize weights to sum to 1.0
        double totalWeight = kwWeight + semWeight;
        if (totalWeight > 0) {
            kwWeight = kwWeight / totalWeight;
            semWeight = semWeight / totalWeight;
        }

        log.info("[MCP] Using normalized weights: keyword={}, semantic={}", kwWeight, semWeight);

        // Perform keyword search (get more results for better coverage)
        List<SearchHit> keywordHits = searchDomainDocs(query, k * 2, null, null);

        // Perform semantic search
        List<SemanticSearchResult> semanticHits = semanticSearchTools.get()
            .semanticSearchDocs(query, k * 2, 0.3);  // Lower threshold for better recall

        // Build a map to combine scores by document path
        Map<String, HybridScore> scoreMap = new HashMap<>();

        // Normalize and add keyword scores
        int maxKeywordScore = keywordHits.stream()
            .mapToInt(SearchHit::score)
            .max()
            .orElse(1);

        for (SearchHit hit : keywordHits) {
            double normalizedScore = (double) hit.score() / maxKeywordScore;
            scoreMap.computeIfAbsent(hit.path(), p -> new HybridScore(p, hit.snippet()))
                .keywordScore = normalizedScore;
        }

        // Add semantic scores (similarity scores are already normalized 0-1)
        for (SemanticSearchResult result : semanticHits) {
            String docPath = extractDocPath(result.source());
            Double simScore = (Double) result.metadata().get("similarity_score");
            double semanticScore = simScore != null ? simScore : 0.5;

            HybridScore hybridScore = scoreMap.computeIfAbsent(docPath,
                p -> new HybridScore(p, result.snippet()));
            hybridScore.semanticScore = semanticScore;

            // Prefer semantic snippet if keyword snippet is empty
            if (hybridScore.snippet == null || hybridScore.snippet.isEmpty()) {
                hybridScore.snippet = result.snippet();
            }
        }

        // Calculate final hybrid scores and create results
        List<HybridSearchHit> hybridHits = new ArrayList<>();
        for (HybridScore score : scoreMap.values()) {
            double finalScore = (score.keywordScore * kwWeight) + (score.semanticScore * semWeight);

            // Determine match type based on the weights used, not just score presence
            String matchType;
            if (kwWeight > 0 && semWeight > 0) {
                // Both weights are non-zero = hybrid search
                matchType = "hybrid";
            } else if (kwWeight > 0) {
                // Only keyword weight is non-zero = keyword-only search
                matchType = "keyword";
            } else {
                // Only semantic weight is non-zero = semantic-only search
                matchType = "semantic";
            }

            hybridHits.add(new HybridSearchHit(
                score.path,
                score.keywordScore,
                score.semanticScore,
                finalScore,
                score.snippet,
                matchType
            ));
        }

        // Sort by final score and limit results
        hybridHits.sort(Comparator.comparingDouble(HybridSearchHit::hybridScore).reversed()
            .thenComparing(HybridSearchHit::path));

        List<HybridSearchHit> topResults = hybridHits.size() <= k
            ? hybridHits
            : new ArrayList<>(hybridHits.subList(0, k));

        log.info("[MCP] hybridSearchDocs returning {} results (from {} keyword, {} semantic)",
            topResults.size(), keywordHits.size(), semanticHits.size());

        return topResults;
    }

    // ----- helpers -----

    /**
     * Extract document path from semantic search source string.
     * Source format: "oms-knowledge-base/path/to/doc.md" or similar.
     */
    private String extractDocPath(String source) {
        if (source == null) return "unknown";
        // Remove base directory prefix if present
        int lastSlash = source.lastIndexOf('/');
        if (lastSlash > 0) {
            return source; // Keep full path
        }
        return source;
    }

    /**
     * Internal class to accumulate hybrid scores.
     */
    private static class HybridScore {
        final String path;
        String snippet;
        double keywordScore = 0.0;
        double semanticScore = 0.0;

        HybridScore(String path, String snippet) {
            this.path = path;
            this.snippet = snippet;
        }
    }

    private static Set<String> parseTerms(String query) {
        Set<String> terms = new LinkedHashSet<>();
        for (String t : query.toLowerCase(Locale.ROOT).split("\\s+")) {
            if (StringUtils.hasText(t)) terms.add(t);
        }
        return terms;
    }

    // Structured types for MCP rendering
    public record SearchHit(String path, int score, String snippet) {}
    public record SectionSearchHit(String path, String sectionTitle, int level, int score, String snippet) {}
    public record HybridSearchHit(String path, double keywordScore, double semanticScore,
                                  double hybridScore, String snippet, String matchType) {}
}
