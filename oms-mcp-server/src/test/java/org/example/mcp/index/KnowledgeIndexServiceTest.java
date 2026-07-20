package org.example.mcp.index;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.example.mcp.index.KnowledgeIndexService.SearchHit;
import org.example.mcp.index.KnowledgeIndexService.SearchMode;
import org.example.mcp.index.KnowledgeIndexService.SearchResponse;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class KnowledgeIndexServiceTest {

    @TempDir
    static Path kb;

    static KnowledgeIndexService index;

    @BeforeAll
    static void buildCorpus() throws IOException {
        Files.writeString(kb.resolve("alpha.md"), """
                # Alpha Spec

                **Status:** Complete
                **Category:** framework

                This framework document explains flux capacitor calibration procedures.

                ## Calibration Steps

                Calibration of the flux capacitor requires three precise steps and a steady hand.
                The order of the steps matters and is described below in detail for engineers.

                ## Unrelated Topic

                Some other text about orders and more orders and yet more orders again.
                """);
        Files.writeString(kb.resolve("beta.md"), """
                # Beta Concepts

                **Status:** Draft
                **Category:** concepts

                This concepts document talks about orders, orders, orders and more orders.

                ## Orders Everywhere

                Orders orders orders orders orders orders orders orders orders orders.
                It mentions calibration exactly once in passing within this long section.
                """);
        KnowledgeIndexProperties properties = IndexTestSupport.bm25OnlyProperties();
        properties.setMinSectionChars(40); // keep the small synthetic sections separate
        index = IndexTestSupport.buildIndex(kb.toString(), properties);
    }

    @Test
    void indexesAllDocumentsAsSections() {
        var stats = index.getStats();
        assertEquals(2, stats.documentCount());
        assertTrue(stats.chunkCount() >= 3, "expected section-level chunks");
        assertFalse(stats.vectorSearchEnabled());
    }

    @Test
    void bm25PrefersRareDiscriminatingTerms() {
        // "calibration" is rare in beta (1x in a long, repetitive doc) and
        // central in alpha; IDF + length normalization must rank alpha first.
        // The old TF-counting engine would have been fooled by sheer length.
        SearchResponse response = index.search("flux capacitor calibration", 5, null, null);
        assertFalse(response.hits().isEmpty());
        SearchHit top = response.hits().get(0);
        assertTrue(top.path().endsWith("alpha.md"), "expected alpha.md first, got " + top.path());
        assertEquals("calibration-steps", response.hits().get(0).anchor());
    }

    @Test
    void resultsCarryCitationsAndLines() {
        SearchResponse response = index.search("calibration steps", 5, null, null);
        SearchHit top = response.hits().get(0);
        assertTrue(top.citation().contains("#"), "citation should carry an anchor");
        assertTrue(top.startLine() > 0 && top.endLine() >= top.startLine());
        assertTrue(top.breadcrumb().contains(">"));
        assertEquals(top.keywordRank(), Integer.valueOf(1));
    }

    @Test
    void filtersByCategory() {
        SearchResponse all = index.search("orders", 10, null, null);
        assertTrue(all.hits().stream().anyMatch(h -> h.path().endsWith("beta.md")));
        SearchResponse frameworkOnly = index.search("orders", 10, "framework", null);
        assertTrue(frameworkOnly.hits().stream().allMatch(h -> h.path().endsWith("alpha.md")));
    }

    @Test
    void filtersByStatus() {
        SearchResponse draftOnly = index.search("orders", 10, null, "Draft");
        assertFalse(draftOnly.hits().isEmpty());
        assertTrue(draftOnly.hits().stream().allMatch(h -> h.path().endsWith("beta.md")));
    }

    @Test
    void semanticModeIsEmptyWithoutEmbeddings() {
        SearchResponse response = index.search("calibration", 5, null, null, SearchMode.SEMANTIC);
        assertTrue(response.hits().isEmpty());
        assertFalse(response.usedVectorSearch());
    }

    @Test
    void stemmingMatchesWordVariants() {
        // EnglishAnalyzer stems: "calibrating" should still find "calibration"
        SearchResponse response = index.search("calibrating", 5, null, null);
        assertFalse(response.hits().isEmpty());
    }

    @Test
    void noSubstringFalsePositives() {
        // The old engine substring-matched "art" inside "partial" etc.
        SearchResponse response = index.search("alib", 5, null, null);
        assertTrue(response.hits().isEmpty(), "substring fragments must not match tokens");
    }
}
