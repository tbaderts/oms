package org.example.mcp.docs;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * MCP tools to make domain knowledge files available to LLM clients.
 *
 * Tools:
 * - listDomainDocs: enumerate known docs with basic metadata
 * - readDomainDoc: read a specific doc's content (optionally partial)
 * - searchDomainDocs: simple keyword search across docs (term frequency sum)
 * - listDocSections: list sections/headings in a markdown document
 * - readDocSection: read a specific section from a document
 * - searchDocSections: search within sections for more precise results
 *
 * Configure base directories via property "domain.docs.paths" (comma-separated absolute or
 * project-relative paths). Defaults include known repo specs folders.
 */
@Component
public class DomainDocsTools {

    private static final Logger log = LoggerFactory.getLogger(DomainDocsTools.class);

    private final List<Path> baseDirs;

    public DomainDocsTools(@Value("${domain.docs.paths}") String paths) {
        this.baseDirs = new ArrayList<>();
        for (String part : paths.split(",")) {
            String trimmed = part.trim();
            if (!StringUtils.hasText(trimmed)) continue;
            Path p = Paths.get(trimmed).toAbsolutePath().normalize();
            if (Files.exists(p)) {
                baseDirs.add(p);
            }
        }
        log.info("[MCP] DomainDocsTools scanning baseDirs={}", this.baseDirs);
    }

    @Tool(name = "listDomainDocs", description = "List available domain documents with metadata.")
    public List<DocMeta> listDomainDocs() {
        List<DocMeta> results = new ArrayList<>();
        for (Path base : baseDirs) {
            if (!Files.isDirectory(base)) continue;
            try (Stream<Path> stream = Files.walk(base)) {
                stream.filter(Files::isRegularFile)
                        .filter(DomainDocsTools::isDocFile)
                        .forEach(p -> results.add(toMeta(base, p)));
            } catch (IOException e) {
                log.warn("Failed to walk {}: {}", base, e.toString());
            }
        }
        results.sort(Comparator.comparing(DocMeta::path));
        return results;
    }

    @Tool(name = "readDomainDoc", description = "Read the content of a domain document (use listDomainDocs to discover paths).")
    public DocContent readDomainDoc(String path, Integer offset, Integer limit) {
    log.info("[MCP] readDomainDoc called with path={}", path);
    if (!StringUtils.hasText(path)) {
            throw new IllegalArgumentException("path must be provided (relative to a base dir)");
        }
        Path resolved = resolveAgainstBases(path);
        if (resolved == null) {
            throw new IllegalArgumentException("Document not found under configured base directories: " + path);
        }
        try {
            String content = Files.readString(resolved, StandardCharsets.UTF_8);
            int len = content.length();
            int from = offset == null ? 0 : clamp(offset, 0, len);
            int to = limit == null ? len : clamp(from + Math.max(0, limit), 0, len);
            String slice = content.substring(from, to);
            return new DocContent(relativizeToAnyBase(resolved), slice, len, from, to);
        } catch (IOException e) {
            throw new DomainDocReadException("Failed to read doc: " + path, e);
        }
    }

    @Tool(name = "searchDomainDocs", description = "Keyword search across domain documents. Returns top matches with brief snippets.")
    public List<SearchHit> searchDomainDocs(String query, Integer topK) {
        if (!StringUtils.hasText(query)) {
            return List.of();
        }
        Set<String> terms = new LinkedHashSet<>();
        for (String t : query.toLowerCase(Locale.ROOT).split("\\s+")) {
            if (StringUtils.hasText(t)) terms.add(t);
        }
        if (terms.isEmpty()) return List.of();

        int k = (topK == null || topK <= 0) ? 5 : Math.min(topK, 50);
        List<SearchHit> hits = new ArrayList<>();
        for (Path base : baseDirs) {
            if (!Files.isDirectory(base)) continue;
            try (Stream<Path> stream = Files.walk(base)) {
                for (Path p : stream.filter(Files::isRegularFile).filter(DomainDocsTools::isDocFile).toList()) {
                    String content;
                    try { content = Files.readString(p, StandardCharsets.UTF_8); }
                    catch (IOException e) { continue; }
                    int score = scoreContent(content, terms);
                    if (score > 0) {
                        String snippet = makeSnippet(content, terms.iterator().next());
                        hits.add(new SearchHit(relativizeToAnyBase(p), score, snippet));
                    }
                }
            } catch (IOException e) {
                log.warn("Failed to search {}: {}", base, e.toString());
            }
        }
        hits.sort(Comparator.comparingInt(SearchHit::score).reversed().thenComparing(SearchHit::path));
        if (hits.size() <= k) return hits;
        return new ArrayList<>(hits.subList(0, k));
    }

    @Tool(name = "listDocSections", description = "List all sections/headings in a markdown document for navigation.")
    public List<DocSection> listDocSections(String path) {
    log.info("[MCP] listDocSections called with path={}", path);
    if (!StringUtils.hasText(path)) {
            throw new IllegalArgumentException("path must be provided");
        }
        Path resolved = resolveAgainstBases(path);
        if (resolved == null) {
            throw new IllegalArgumentException("Document not found: " + path);
        }
        try {
            String content = Files.readString(resolved, StandardCharsets.UTF_8);
            return extractSections(content);
        } catch (IOException e) {
            throw new DomainDocReadException("Failed to read doc: " + path, e);
        }
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
        Path resolved = resolveAgainstBases(path);
        if (resolved == null) {
            throw new IllegalArgumentException("Document not found: " + path);
        }
        try {
            String content = Files.readString(resolved, StandardCharsets.UTF_8);
            String[] lines = content.split("\n");
            
            // Find the section
            int startLine = -1;
            int sectionLevel = -1;
            String normalizedTitle = sectionTitle.trim().toLowerCase(Locale.ROOT);
            
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i].trim();
                if (line.startsWith("#")) {
                    int level = 0;
                    while (level < line.length() && line.charAt(level) == '#') {
                        level++;
                    }
                    String title = line.substring(level).trim().toLowerCase(Locale.ROOT);
                    if (title.equals(normalizedTitle) || title.startsWith(normalizedTitle)) {
                        startLine = i;
                        sectionLevel = level;
                        break;
                    }
                }
            }
            
            if (startLine == -1) {
                throw new IllegalArgumentException("Section not found: " + sectionTitle);
            }
            
            // Find the end of the section (next heading of same or higher level)
            int endLine = lines.length;
            for (int i = startLine + 1; i < lines.length; i++) {
                String line = lines[i].trim();
                if (line.startsWith("#")) {
                    int level = 0;
                    while (level < line.length() && line.charAt(level) == '#') {
                        level++;
                    }
                    if (level <= sectionLevel) {
                        endLine = i;
                        break;
                    }
                }
            }
            
            // Extract section content
            StringBuilder sectionContent = new StringBuilder();
            for (int i = startLine; i < endLine; i++) {
                sectionContent.append(lines[i]).append("\n");
            }
            
            String result = sectionContent.toString();
            return new DocContent(
                relativizeToAnyBase(resolved) + "#" + sectionTitle,
                result,
                result.length(),
                0,
                result.length()
            );
        } catch (IOException e) {
            throw new DomainDocReadException("Failed to read doc: " + path, e);
        }
    }

    @Tool(name = "searchDocSections", description = "Search within document sections for more precise results. Returns matching sections with context.")
    public List<SectionSearchHit> searchDocSections(String query, Integer topK) {
    log.info("[MCP] searchDocSections called with query={}, topK={}", query, topK);
    if (!StringUtils.hasText(query)) {
            return List.of();
        }
        Set<String> terms = new LinkedHashSet<>();
        for (String t : query.toLowerCase(Locale.ROOT).split("\\s+")) {
            if (StringUtils.hasText(t)) terms.add(t);
        }
        if (terms.isEmpty()) return List.of();

        int k = (topK == null || topK <= 0) ? 5 : Math.min(topK, 50);
        List<SectionSearchHit> hits = new ArrayList<>();
        
        for (Path base : baseDirs) {
            if (!Files.isDirectory(base)) continue;
            try (Stream<Path> stream = Files.walk(base)) {
                for (Path p : stream.filter(Files::isRegularFile).filter(DomainDocsTools::isDocFile).toList()) {
                    String content;
                    try { content = Files.readString(p, StandardCharsets.UTF_8); }
                    catch (IOException e) { continue; }
                    
                    List<DocSection> sections = extractSections(content);
                    for (DocSection section : sections) {
                        String sectionContent = extractSectionContent(content, section);
                        int score = scoreContent(sectionContent, terms);
                        if (score > 0) {
                            String snippet = makeSnippet(sectionContent, terms.iterator().next());
                            hits.add(new SectionSearchHit(
                                relativizeToAnyBase(p),
                                section.title(),
                                section.level(),
                                score,
                                snippet
                            ));
                        }
                    }
                }
            } catch (IOException e) {
                log.warn("Failed to search sections in {}: {}", base, e.toString());
            }
        }
        
        hits.sort(Comparator.comparingInt(SectionSearchHit::score).reversed()
                .thenComparing(SectionSearchHit::path)
                .thenComparing(SectionSearchHit::sectionTitle));
        if (hits.size() <= k) return hits;
        return new ArrayList<>(hits.subList(0, k));
    }

    // Helper methods for section extraction
    private List<DocSection> extractSections(String content) {
        List<DocSection> sections = new ArrayList<>();
        String[] lines = content.split("\n");
        
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.startsWith("#")) {
                int level = 0;
                while (level < line.length() && line.charAt(level) == '#') {
                    level++;
                }
                if (level > 0 && level < line.length()) {
                    String title = line.substring(level).trim();
                    // Remove trailing # if present
                    if (title.endsWith("#")) {
                        title = title.substring(0, title.length() - 1).trim();
                    }
                    sections.add(new DocSection(title, level, i + 1));
                }
            }
        }
        
        return sections;
    }

    private String extractSectionContent(String content, DocSection section) {
        String[] lines = content.split("\n");
        int startLine = section.lineNumber() - 1; // Convert to 0-based
        if (startLine >= lines.length) return "";
        
        int sectionLevel = section.level();
        int endLine = lines.length;
        
        // Find the next heading of same or higher level
        for (int i = startLine + 1; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.startsWith("#")) {
                int level = 0;
                while (level < line.length() && line.charAt(level) == '#') {
                    level++;
                }
                if (level <= sectionLevel) {
                    endLine = i;
                    break;
                }
            }
        }
        
        StringBuilder sectionContent = new StringBuilder();
        for (int i = startLine; i < endLine; i++) {
            sectionContent.append(lines[i]).append("\n");
        }
        
        return sectionContent.toString();
    }

    private static boolean isDocFile(Path p) {
        String name = p.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt") || name.endsWith(".adoc");
    }

    private static String makeSnippet(String content, String firstTerm) {
        String lc = content.toLowerCase(Locale.ROOT);
        int pos = firstTerm == null ? -1 : lc.indexOf(firstTerm.toLowerCase(Locale.ROOT));
        int start = Math.max(0, pos < 0 ? 0 : pos - 80);
        int end = Math.min(content.length(), start + 240);
        String snippet = content.substring(start, end).replace('\n', ' ').trim();
        if (start > 0) snippet = "… " + snippet;
        if (end < content.length()) snippet = snippet + " …";
        return snippet;
    }

    private static int scoreContent(String content, Set<String> terms) {
        String lc = content.toLowerCase(Locale.ROOT);
        int score = 0;
        for (String t : terms) {
            score += countOccurrences(lc, t);
        }
        return score;
    }

    private static int countOccurrences(String text, String term) {
        if (term.isEmpty()) return 0;
        int count = 0;
        int idx = 0;
        while ((idx = text.indexOf(term, idx)) != -1) {
            count++; idx += term.length();
        }
        return count;
    }

    private DocMeta toMeta(Path base, Path file) {
        try {
            String rel = base.relativize(file).toString().replace('\\', '/');
            long size = Files.size(file);
            Instant modified = Files.getLastModifiedTime(file).toInstant();
            String baseName = base.getFileName() == null ? base.toString() : base.getFileName().toString();
            String path = String.join(FileSystems.getDefault().getSeparator(), baseName, rel).replace('\\', '/');
            return new DocMeta(path, file.getFileName().toString(), size, modified.toString());
        } catch (IOException e) {
            return new DocMeta(file.toString(), file.getFileName().toString(), -1, "");
        }
    }

    private Path resolveAgainstBases(String relative) {
    log.info("[MCP] resolveAgainstBases called with relative={}", relative);
        for (Path base : baseDirs) {
            Path p = base.resolve(relative).normalize();
            if (p.startsWith(base) && Files.exists(p) && Files.isRegularFile(p)) {
                return p;
            }
        }
        for (Path base : baseDirs) {
            String baseName = base.getFileName() == null ? base.toString() : base.getFileName().toString();
            if (relative.startsWith(baseName + "/")) {
                String sub = relative.substring((baseName + "/").length());
                Path p = base.resolve(sub).normalize();
                if (p.startsWith(base) && Files.exists(p) && Files.isRegularFile(p)) {
                    return p;
                }
            }
        }
        return null;
    }

    private String relativizeToAnyBase(Path p) {
    log.info("[MCP] relativizeToAnyBase called with path={}", p);
        for (Path base : baseDirs) {
            if (p.startsWith(base)) {
                String baseName = base.getFileName() == null ? base.toString() : base.getFileName().toString();
                String rel = base.relativize(p).toString().replace('\\', '/');
                return (baseName + "/" + rel).replace('\\', '/');
            }
        }
        return p.getFileName().toString();
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    // Structured types for nicer MCP rendering
    public record DocMeta(String path, String name, long size, String lastModifiedIso) {}
    public record DocContent(String path, String content, int totalLength, int from, int to) {}
    public record SearchHit(String path, int score, String snippet) {}
    public record DocSection(String title, int level, int lineNumber) {}
    public record SectionSearchHit(String path, String sectionTitle, int level, int score, String snippet) {}

    public static class DomainDocReadException extends RuntimeException {
        public DomainDocReadException(String message, Throwable cause) { super(message, cause); }
    }
}
