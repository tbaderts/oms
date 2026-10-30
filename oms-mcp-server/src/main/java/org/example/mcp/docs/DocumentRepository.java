package org.example.mcp.docs;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import lombok.extern.slf4j.Slf4j;

/**
 * Handles document discovery, path resolution, and file I/O for the domain
 * knowledge base. Shared between MCP tools and the vector-based indexer.
 */
@Slf4j
@Component
public class DocumentRepository {

    private final List<Path> baseDirs;
    private final MarkdownParser markdownParser;

    public DocumentRepository(@Value("${domain.docs.paths}") String paths,
                              MarkdownParser markdownParser) {
        this.markdownParser = markdownParser;
        this.baseDirs = new ArrayList<>();
        for (String part : paths.split(",")) {
            String trimmed = part.trim();
            if (!StringUtils.hasText(trimmed)) continue;
            Path p = Paths.get(trimmed).toAbsolutePath().normalize();
            if (Files.exists(p)) {
                baseDirs.add(p);
            }
        }
        log.info("[Docs] DocumentRepository scanning baseDirs={}", this.baseDirs);
    }

    /**
     * @return unmodifiable view of the configured base directories
     */
    public List<Path> getBaseDirs() {
        return List.copyOf(baseDirs);
    }

    /**
     * List all documentation files across all base directories.
     */
    public List<DocMeta> listAll() {
        List<DocMeta> results = new ArrayList<>();
        for (Path base : baseDirs) {
            if (!Files.isDirectory(base)) continue;
            try (Stream<Path> stream = Files.walk(base)) {
                stream.filter(Files::isRegularFile)
                        .filter(DocumentFileUtils::isDocFile)
                        .forEach(p -> results.add(toMeta(base, p)));
            } catch (IOException e) {
                log.warn("Failed to walk {}: {}", base, e.toString());
            }
        }
        results.sort(Comparator.comparing(DocMeta::path));
        return results;
    }

    /**
     * Read the content of a file resolved against the configured base
     * directories.
     *
     * @param relativePath path relative to a base directory (or prefixed with
     *                     the base dir name)
     * @return the full file content as a string
     * @throws IllegalArgumentException if the path cannot be resolved
     * @throws DomainDocReadException   on I/O failure
     */
    public String readContent(String relativePath) {
        Path resolved = resolveAgainstBases(relativePath);
        if (resolved == null) {
            throw new IllegalArgumentException("Document not found under configured base directories: " + relativePath);
        }
        try {
            return Files.readString(resolved, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new DomainDocReadException("Failed to read doc: " + relativePath, e);
        }
    }

    /**
     * Read a document without its front matter: the YAML block's lines are emptied, so line
     * numbers still match the file.
     */
    public String readBody(String relativePath) {
        return FrontMatter.parse(readContent(relativePath)).blankedContent();
    }

    /**
     * Resolve a relative path against all configured base directories.
     *
     * @return the resolved path or {@code null} if not found
     */
    public Path resolveAgainstBases(String relative) {
        log.debug("[Docs] resolveAgainstBases called with relative={}", relative);
        for (Path base : baseDirs) {
            Path p = base.resolve(relative).normalize();
            if (p.startsWith(base) && Files.exists(p) && Files.isRegularFile(p)) {
                return p;
            }
        }
        // Try stripping a base-dir-name prefix (e.g. "oms-knowledge-base/foo.md")
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

    /**
     * Produce a portable relative path from an absolute path, prefixed with
     * the base directory name.
     */
    public String relativize(Path p) {
        log.debug("[Docs] relativize called with path={}", p);
        for (Path base : baseDirs) {
            if (p.startsWith(base)) {
                String baseName = base.getFileName() == null ? base.toString() : base.getFileName().toString();
                String rel = base.relativize(p).toString().replace('\\', '/');
                return (baseName + "/" + rel).replace('\\', '/');
            }
        }
        return p.getFileName().toString();
    }

    /**
     * Walk all doc files in all base directories.
     */
    public List<Path> findAllDocFiles() {
        List<Path> files = new ArrayList<>();
        for (Path base : baseDirs) {
            if (!Files.isDirectory(base)) continue;
            try (Stream<Path> stream = Files.walk(base)) {
                stream.filter(Files::isRegularFile)
                        .filter(DocumentFileUtils::isDocFile)
                        .forEach(files::add);
            } catch (IOException e) {
                log.warn("Failed to walk {}: {}", base, e.toString());
            }
        }
        return files;
    }

    // ----- helpers -----

    private DocMeta toMeta(Path base, Path file) {
        try {
            String rel = base.relativize(file).toString().replace('\\', '/');
            long size = Files.size(file);
            Instant modified = Files.getLastModifiedTime(file).toInstant();
            String baseName = base.getFileName() == null ? base.toString() : base.getFileName().toString();
            String path = (baseName + "/" + rel).replace('\\', '/');

            // Legacy bold header plus OKF front matter; front matter wins where both exist
            String content = Files.readString(file, StandardCharsets.UTF_8);
            MarkdownParser.DocMetadata legacy = markdownParser.extractMetadata(content);
            FrontMatter frontMatter = FrontMatter.parse(content);
            if (frontMatter.error() != null) {
                log.debug("[Docs] Unparseable front matter in {}: {}", path, frontMatter.error());
            }
            OkfMetadata okf = OkfMetadata.derive(frontMatter, legacy, Instant.now());

            return new DocMeta(path, file.getFileName().toString(), size, modified.toString(),
                okf.version(), okf.status(), legacy.lastUpdated(), legacy.category(),
                !DocumentFileUtils.isReserved(file), okf);
        } catch (IOException e) {
            return new DocMeta(file.toString(), file.getFileName().toString(), -1, "",
                null, null, null, null, !DocumentFileUtils.isReserved(file), null);
        }
    }

    static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    // Structured types
    /**
     * A listed document. {@code status} is the OKF status for documents with front matter and the
     * bold-header status otherwise; {@code concept} is false for the OKF reserved files
     * ({@code index.md}, {@code log.md}); {@code okf} carries the full front matter metadata.
     */
    public record DocMeta(String path, String name, long size, String lastModifiedIso,
                          String version, String status, String lastUpdated, String category,
                          boolean concept, OkfMetadata okf) {}
    public record DocContent(String path, String content, int totalLength, int from, int to) {}

    public static class DomainDocReadException extends RuntimeException {
        public DomainDocReadException(String message, Throwable cause) { super(message, cause); }
    }
}
