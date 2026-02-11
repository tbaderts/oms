package org.example.mcp.docs;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.example.mcp.docs.DocumentRepository.DocContent;
import org.example.mcp.docs.DocumentRepository.DocMeta;
import org.example.mcp.docs.MarkdownParser.DocSection;
import org.springframework.ai.tool.annotation.Tool;
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

    public DomainDocsTools(DocumentRepository docRepo,
                           MarkdownParser markdownParser,
                           KeywordSearchEngine searchEngine) {
        this.docRepo = docRepo;
        this.markdownParser = markdownParser;
        this.searchEngine = searchEngine;
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

    @Tool(name = "searchDomainDocs", description = "Keyword search across domain documents. Returns top matches with brief snippets.")
    public List<SearchHit> searchDomainDocs(String query, Integer topK) {
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

    // ----- helpers -----

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
}
