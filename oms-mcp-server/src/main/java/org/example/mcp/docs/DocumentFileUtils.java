package org.example.mcp.docs;

import java.nio.file.Path;
import java.util.Locale;

/**
 * Shared utility for document file detection, used by both
 * {@link DomainDocsTools} and
 * {@link org.example.mcp.vector.DocumentIndexerService}.
 */
public final class DocumentFileUtils {

    private DocumentFileUtils() {
        // utility class
    }

    /**
     * Returns {@code true} if the file extension indicates a documentation file
     * (.md, .markdown, .txt, .adoc).
     */
    public static boolean isDocFile(Path p) {
        String name = p.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".md")
                || name.endsWith(".markdown")
                || name.endsWith(".txt")
                || name.endsWith(".adoc");
    }
}
