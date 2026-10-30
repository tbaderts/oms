package org.example.mcp.index;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.example.mcp.docs.MarkdownParser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SectionChunkerTest {

    private SectionChunker chunker;
    private KnowledgeIndexProperties properties;

    @BeforeEach
    void setUp() {
        properties = new KnowledgeIndexProperties();
        properties.setMinSectionChars(30);
        properties.setMaxSectionChars(500);
        chunker = new SectionChunker(new MarkdownParser(), properties);
    }

    @Test
    void chunksByHeadingWithBreadcrumbsAndAnchors() {
        String md = """
                # Domain Model

                **Status:** Complete
                **Category:** framework

                This document describes the domain model in great detail for everyone.

                ## Order Entity

                The order entity has many fields that matter a lot to the business logic.

                ### State Transitions

                Orders move from New to PartiallyFilled to Filled depending on executions.
                """;
        List<SectionChunk> chunks = chunker.chunk("kb/spec.md", md);

        assertFalse(chunks.isEmpty());
        SectionChunk stateChunk = chunks.stream()
                .filter(c -> c.anchor().equals("state-transitions"))
                .findFirst().orElseThrow();
        assertEquals("spec.md > Domain Model > Order Entity > State Transitions", stateChunk.breadcrumb());
        assertEquals("kb/spec.md#state-transitions", stateChunk.citation());
        assertEquals(3, stateChunk.level());
        assertEquals("Complete", stateChunk.status());
        assertEquals("framework", stateChunk.category());
        assertTrue(stateChunk.text().contains("PartiallyFilled"));
    }

    @Test
    void lineNumbersMatchSource() {
        String md = "# Title\n\nIntro text that is long enough to stand alone as a chunk here.\n\n## Section A\n\nBody of section A that is long enough to not get merged away at all.\n";
        List<SectionChunk> chunks = chunker.chunk("kb/doc.md", md);
        SectionChunk sectionA = chunks.stream()
                .filter(c -> c.anchor().equals("section-a")).findFirst().orElseThrow();
        assertEquals(5, sectionA.startLine());
        String[] lines = md.split("\n", -1);
        assertTrue(lines[sectionA.startLine() - 1].startsWith("## Section A"));
    }

    @Test
    void mergesTinySections() {
        String md = """
                # Doc

                ## Tiny

                x

                ## Real Section

                This section is clearly long enough to stay on its own without merging.
                """;
        List<SectionChunk> chunks = chunker.chunk("kb/doc.md", md);
        // "Tiny" (4 chars of body) must have been merged, not emitted alone
        assertTrue(chunks.stream().noneMatch(c -> c.text().strip().equals("## Tiny\n\nx")));
        assertTrue(chunks.stream().anyMatch(c -> c.text().contains("## Tiny")));
    }

    @Test
    void splitsOversizedSectionsOutsideCodeFences() {
        StringBuilder big = new StringBuilder(
                "# Doc\n\nIntro paragraph long enough that the title section stands alone.\n\n## Big Section\n\n");
        big.append("```java\n");
        big.append("code line that must never be split apart;\n".repeat(5));
        big.append("```\n\n");
        for (int i = 0; i < 30; i++) {
            big.append("Paragraph ").append(i).append(" with a reasonable amount of text in it.\n\n");
        }
        List<SectionChunk> chunks = chunker.chunk("kb/doc.md", big.toString());

        List<SectionChunk> bigParts = chunks.stream()
                .filter(c -> c.anchor().equals("big-section")).toList();
        assertTrue(bigParts.size() > 1, "oversized section should be split into parts");
        // All parts share the same citation (anchor points at the whole section)
        assertTrue(bigParts.stream().allMatch(c -> c.citation().equals("kb/doc.md#big-section")));
        // The code fence must be intact in exactly one part
        long fenceParts = bigParts.stream().filter(c -> c.text().contains("```java")).count();
        assertEquals(1, fenceParts);
        SectionChunk fencePart = bigParts.stream().filter(c -> c.text().contains("```java")).findFirst().orElseThrow();
        assertEquals(5, fencePart.text().lines().filter(l -> l.contains("never be split")).count());
        // Continuation parts carry the breadcrumb marker
        assertTrue(bigParts.stream().skip(1).allMatch(c -> c.text().startsWith("[")));
    }

    @Test
    void preambleBeforeFirstHeadingIsKept() {
        String md = "Some preamble text before any heading appears, long enough to keep.\n\n# First\n\nBody of the first section that is definitely long enough to keep.\n";
        List<SectionChunk> chunks = chunker.chunk("kb/doc.md", md);
        assertTrue(chunks.stream().anyMatch(c -> c.text().contains("Some preamble")));
    }

    @Test
    void noFrontMatterInChunksAndMetadataChunkFirst() {
        String md = """
                ---
                type: Capability
                title: "Order Capture"
                description: "Taking a new client order into the OMS."
                tags: [orders, intake]
                status: draft
                generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
                sources:
                  - resource: "repo:oms-core/src/main/java/Foo.java"
                # a YAML comment that must not become a heading
                ---
                # Order Capture

                ## Summary

                The OMS takes responsibility for a client order when it accepts an order create command.
                """;
        List<SectionChunk> chunks = productionLikeChunker().chunk("kb/capabilities/order-capture.md", md);

        assertTrue(chunks.stream().noneMatch(c -> c.text().contains("generated:")
                || c.text().contains("repo:") || c.text().contains("---") || c.text().contains("YAML comment")));
        assertTrue(chunks.stream().noneMatch(c -> c.title().contains("YAML comment")));
        SectionChunk first = chunks.get(0);
        assertTrue(first.text().startsWith("Order Capture\nTaking a new client order into the OMS.\nTags: orders, intake"),
                first.text());
        assertEquals(1, first.startLine());
        assertTrue(chunks.stream().allMatch(c -> "Capability".equals(c.type())
                && "draft".equals(c.status()) && "unverified".equals(c.trustTier())
                && c.tags().equals(List.of("orders", "intake"))));
        // line numbers still refer to the file: the Summary heading is on line 15
        assertTrue(chunks.stream().anyMatch(c -> c.anchor().equals("summary") && c.startLine() <= 15 && c.endLine() >= 15));
        // the metadata chunk stands alone over the front matter lines; it is never merged into a section
        assertEquals("", first.anchor());
        assertEquals(11, first.endLine());
        assertTrue(chunks.stream().skip(1).noneMatch(c -> c.text().contains("Taking a new client order")));
    }

    @Test
    void splitPartsOfFrontMatterDocumentsCiteFileLines() {
        StringBuilder md = new StringBuilder("---\ntype: Specification\ntitle: \"Big\"\ndescription: \"A big one.\"\n---\n# Big\n\n");
        for (int i = 1; i <= 40; i++) {
            md.append("Paragraph ").append(i).append(" has enough words to make the section grow past the limit.\n\n");
        }
        String content = md.toString();
        String[] fileLines = content.split("\n", -1);
        List<SectionChunk> chunks = productionLikeChunker().chunk("kb/big.md", content);

        assertTrue(chunks.size() > 2, "expected the section to be split");
        for (SectionChunk c : chunks.subList(1, chunks.size())) {
            String firstParagraph = c.text().lines().filter(l -> l.startsWith("Paragraph")).findFirst().orElseThrow();
            int line = c.startLine();
            while (line <= c.endLine() && !fileLines[line - 1].equals(firstParagraph)) line++;
            assertTrue(line <= c.endLine(), "part " + c.startLine() + "-" + c.endLine() + " does not contain its own first paragraph");
        }
    }

    @Test
    void legacyDocumentsKeepHeaderStatus() {
        String md = "# Spec\n\n**Status:** Active\n\nBody long enough to be its own section without merging anything.\n";
        List<SectionChunk> chunks = chunker.chunk("kb/spec.md", md);
        assertTrue(chunks.stream().allMatch(c -> "Active".equals(c.status()) && c.type() == null));
    }
    /** Production default for the minimum (200), so small chunks merge as they do in the real index. */
    private static SectionChunker productionLikeChunker() {
        KnowledgeIndexProperties p = new KnowledgeIndexProperties();
        p.setMinSectionChars(200);
        p.setMaxSectionChars(500);
        return new SectionChunker(new MarkdownParser(), p);
    }
}
