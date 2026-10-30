package org.example.mcp.index;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.example.mcp.docs.FrontMatter;
import org.example.mcp.docs.MarkdownAnchors;
import org.example.mcp.docs.MarkdownParser;
import org.example.mcp.docs.MarkdownParser.DocMetadata;
import org.example.mcp.docs.MarkdownParser.DocSection;
import org.example.mcp.docs.OkfMetadata;
import org.springframework.stereotype.Component;

/**
 * Splits a markdown document into structure-aware chunks.
 *
 * Each chunk corresponds to the text between two consecutive headings and is
 * attributed to its heading with a full breadcrumb (doc > H1 > H2 > ...), a
 * GitHub-style anchor and source line numbers. Tiny segments are merged with a
 * neighbor; oversized segments are split at paragraph boundaries (never inside
 * fenced code blocks).
 */
@Component
public class SectionChunker {

    private final MarkdownParser markdownParser;
    private final KnowledgeIndexProperties properties;

    public SectionChunker(MarkdownParser markdownParser, KnowledgeIndexProperties properties) {
        this.markdownParser = markdownParser;
        this.properties = properties;
    }

    public List<SectionChunk> chunk(String path, String content) {
        DocMetadata meta = markdownParser.extractMetadata(content);
        FrontMatter frontMatter = FrontMatter.parse(content);
        OkfMetadata okf = OkfMetadata.derive(frontMatter, meta, Instant.now());
        // The YAML block is blanked, not removed: no YAML reaches a chunk or looks like a heading,
        // and line numbers still match the file.
        String body = frontMatter.blankedContent();
        String[] lines = body.split("\n", -1);
        List<DocSection> sections = markdownParser.extractSections(body);
        List<String> anchors = MarkdownAnchors.assignAnchors(sections);
        String docName = path.substring(path.lastIndexOf('/') + 1);
        SectionChunk template = new SectionChunk(path, "", docName, docName, 0, 1, 1, "",
                meta.category(), okf.status(), okf.version(), okf.type(), okf.tags(), okf.trustTier());

        List<SectionChunk> segments = new ArrayList<>();

        // Preamble: content between the front matter and the first heading
        int firstHeadingLine = sections.isEmpty() ? lines.length + 1 : sections.get(0).lineNumber();
        String preamble = joinLines(lines, 1, firstHeadingLine - 1);
        if (!preamble.isBlank()) {
            segments.add(template.with("", docName, docName, 0, 1, firstHeadingLine - 1, preamble));
        }

        // One segment per heading, up to the next heading of any level
        List<DocSection> breadcrumbStack = new ArrayList<>();
        for (int i = 0; i < sections.size(); i++) {
            DocSection section = sections.get(i);
            while (!breadcrumbStack.isEmpty()
                    && breadcrumbStack.get(breadcrumbStack.size() - 1).level() >= section.level()) {
                breadcrumbStack.remove(breadcrumbStack.size() - 1);
            }
            breadcrumbStack.add(section);

            int start = section.lineNumber();
            int end = (i + 1 < sections.size()) ? sections.get(i + 1).lineNumber() - 1 : lines.length;
            String text = joinLines(lines, start, end);
            if (text.isBlank()) continue;

            StringBuilder breadcrumb = new StringBuilder(docName);
            for (DocSection s : breadcrumbStack) {
                breadcrumb.append(" > ").append(s.title());
            }

            segments.add(template.with(anchors.get(i), breadcrumb.toString(),
                    section.title(), section.level(), start, end, text));
        }

        List<SectionChunk> chunks = new ArrayList<>(splitOversized(mergeTiny(segments)));

        // The front matter's title, description and tags become their own chunk over the front
        // matter lines. Its text is synthetic (it does not match those lines), so it is kept out of
        // merging and splitting, which assume text line i is file line startLine + i.
        String metadata = metadataText(okf);
        if (!metadata.isEmpty()) {
            chunks.add(0, template.with("", docName, docName, 0, 1, Math.max(1, frontMatter.endLine()), metadata));
        }
        return chunks;
    }

    /**
     * Merge segments shorter than {@code minSectionChars} into the previous
     * chunk when it shares the same parent context, otherwise into the next.
     * The shallower heading's anchor and breadcrumb win, so parent headings
     * that only introduce their children stay addressable.
     */
    private List<SectionChunk> mergeTiny(List<SectionChunk> segments) {
        int min = properties.getMinSectionChars();
        List<SectionChunk> result = new ArrayList<>();
        SectionChunk pending = null;

        for (SectionChunk segment : segments) {
            if (pending != null) {
                segment = mergeInto(pending, segment);
                pending = null;
            }
            if (segment.text().length() < min) {
                pending = segment; // merge into whatever comes next
            } else {
                result.add(segment);
            }
        }
        if (pending != null) {
            if (result.isEmpty()) {
                result.add(pending);
            } else {
                SectionChunk last = result.remove(result.size() - 1);
                result.add(mergeInto(last, pending));
            }
        }
        return result;
    }

    /**
     * Merge two adjacent chunks. The larger one provides the identity
     * (anchor/breadcrumb): a tiny heading glued onto a substantial section
     * should be cited as that section, not the other way round.
     */
    private static SectionChunk mergeInto(SectionChunk first, SectionChunk second) {
        SectionChunk identity = second.text().length() > first.text().length() ? second : first;
        return first.with(identity.anchor(), identity.breadcrumb(),
                identity.title(), identity.level(),
                first.startLine(), second.endLine(),
                first.text() + "\n" + second.text());
    }

    /**
     * Split chunks longer than {@code maxSectionChars} at blank lines outside
     * fenced code blocks. All parts keep the section's anchor and breadcrumb
     * (a citation always points at the whole section).
     *
     * A hard cap of {@code 2 * maxSectionChars} applies even inside fenced
     * code blocks: embedding models silently truncate very long inputs, so an
     * unbounded single chunk would degrade vector quality without warning.
     */
    private List<SectionChunk> splitOversized(List<SectionChunk> chunks) {
        int max = properties.getMaxSectionChars();
        int hardCap = max * 2;
        List<SectionChunk> result = new ArrayList<>();
        for (SectionChunk chunk : chunks) {
            if (chunk.text().length() <= max) {
                result.add(chunk);
                continue;
            }
            String[] lines = chunk.text().split("\n", -1);
            int partStart = 0; // index into lines
            int partChars = 0;
            boolean inFence = false;
            int lineOffset = chunk.startLine();
            for (int i = 0; i < lines.length; i++) {
                String trimmed = lines[i].trim();
                if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
                    inFence = !inFence;
                }
                partChars += lines[i].length() + 1;
                boolean splittable = !inFence && trimmed.isEmpty();
                boolean hardSplit = partChars >= hardCap && i > partStart;
                if ((partChars >= max && splittable && i > partStart) || hardSplit) {
                    result.add(part(chunk, lines, partStart, i, lineOffset));
                    partStart = i + 1;
                    partChars = 0;
                }
            }
            if (partStart < lines.length) {
                result.add(part(chunk, lines, partStart, lines.length - 1, lineOffset));
            }
        }
        return result;
    }

    private static SectionChunk part(SectionChunk chunk, String[] lines, int from, int to, int lineOffset) {
        StringBuilder sb = new StringBuilder();
        for (int i = from; i <= to; i++) {
            sb.append(lines[i]).append('\n');
        }
        String text = sb.toString();
        // Continuation parts get the breadcrumb prepended so the embedding
        // and the reader both know where the text belongs.
        if (from > 0) {
            text = "[" + chunk.breadcrumb() + " (cont.)]\n" + text;
        }
        return chunk.with(chunk.anchor(), chunk.breadcrumb(),
                chunk.title(), chunk.level(),
                lineOffset + from, lineOffset + to, text);
    }

    /** Title, description and tags of the front matter as plain lines (empty without front matter). */
    private static String metadataText(OkfMetadata okf) {
        StringBuilder sb = new StringBuilder();
        if (okf.title() != null) sb.append(okf.title()).append('\n');
        if (okf.description() != null) sb.append(okf.description()).append('\n');
        if (!okf.tags().isEmpty()) sb.append("Tags: ").append(String.join(", ", okf.tags())).append('\n');
        return sb.toString();
    }

    private static String joinLines(String[] lines, int fromLine, int toLine) {
        if (toLine < fromLine) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = fromLine - 1; i < toLine && i < lines.length; i++) {
            sb.append(lines[i]).append('\n');
        }
        return sb.toString();
    }
}
