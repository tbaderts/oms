package org.example.mcp.docs;

import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

/**
 * Shared utility for document file detection, used by the document repository
 * and the knowledge index.
 */
public final class DocumentFileUtils {

    /** OKF reserves these names for navigation and history; they are not concepts. */
    private static final Set<String> RESERVED = Set.of("index.md", "log.md");

    private DocumentFileUtils() {
        // utility class
    }

    /**
     * Returns {@code true} if the file is a markdown document (.md, .markdown). The knowledge
     * base is an Open Knowledge Format bundle, whose documents are markdown.
     */
    public static boolean isDocFile(Path p) {
        String name = p.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".md") || name.endsWith(".markdown");
    }

    /** Returns {@code true} for the OKF reserved files {@code index.md} and {@code log.md}. */
    public static boolean isReserved(Path p) {
        return RESERVED.contains(p.getFileName().toString().toLowerCase(Locale.ROOT));
    }
}
