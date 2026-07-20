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
}
