package org.example.mcp.index;

import java.util.List;

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
 * @param status     document status: OKF status, or the bold-header status without front matter (may be null)
 * @param version    document version metadata (may be null)
 * @param type       OKF concept type (null without front matter)
 * @param tags       OKF tags (empty without front matter)
 * @param trustTier  OKF trust tier derived from {@code verified}
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
        String version,
        String type,
        List<String> tags,
        String trustTier) {

    /** Stable citation in {@code path#anchor} form (path only for the preamble). */
    public String citation() {
        return anchor == null || anchor.isEmpty() ? path : path + "#" + anchor;
    }

    /** The same chunk with new boundaries and text; document metadata is carried over. */
    SectionChunk with(String anchor, String breadcrumb, String title, int level,
                      int startLine, int endLine, String text) {
        return new SectionChunk(path, anchor, breadcrumb, title, level, startLine, endLine, text,
                category, status, version, type, tags, trustTier);
    }
}
