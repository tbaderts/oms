package org.example.mcp.index;

/**
 * One indexable unit of the knowledge base: a markdown section (or part of an
 * oversized section), carrying everything needed for a stable citation.
 *
 * @param path       portable doc path, e.g. "oms-knowledge-base/oms-framework/domain-model_spec.md"
 * @param anchor     GitHub-style heading slug, e.g. "state-transitions" (empty for the preamble)
 * @param breadcrumb human-readable location, e.g. "domain-model_spec.md > Order > State Transitions"
 * @param title      heading title of the section this chunk belongs to
 * @param level      heading level (1-6), 0 for the preamble
 * @param startLine  1-based first line of the chunk in the source document
 * @param endLine    1-based last line of the chunk in the source document
 * @param text       chunk text (includes the heading line)
 * @param category   document category metadata (may be null)
 * @param status     document status metadata (may be null)
 * @param version    document version metadata (may be null)
 */
public record SectionChunk(
        String path,
        String anchor,
        String breadcrumb,
        String title,
        int level,
        int startLine,
        int endLine,
        String text,
        String category,
        String status,
        String version) {

    /** Stable citation in {@code path#anchor} form (path only for the preamble). */
    public String citation() {
        return anchor == null || anchor.isEmpty() ? path : path + "#" + anchor;
    }
}
