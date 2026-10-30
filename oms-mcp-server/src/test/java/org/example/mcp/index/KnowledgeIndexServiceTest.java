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
        Files.writeString(kb.resolve("gamma.md"), """
                ---
                type: Capability
                title: "Widget Receiving"
                description: "Accepting widgets from suppliers at the receiving dock."
                tags: [widgets, intake]
                status: draft
                generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
                sources:
                  - resource: "repo:zzyzxsource/Main.java"
                ---
                # Widget Receiving

                ## Behaviour

                Widgets are counted, labelled and stored in bins; damaged widgets go back to the vendor.
                """);
        Files.writeString(kb.resolve("delta.md"), """
                ---
                type: Requirement
                title: "Twiddle the gizmo"
                description: "The gizmo is tuned before every shift."
                tags: [gizmo-tuning]
                status: stable
                ---
                # Gizmo maintenance

                Gizmo tuning happens with the knob turned slowly until the light turns green.
                """);
        Files.writeString(kb.resolve("index.md"), """
                # Index

                - [Gamma](gamma.md) — navigationonly listing of widgets and gizmos
                """);
        KnowledgeIndexProperties properties = IndexTestSupport.bm25OnlyProperties();
        properties.setMinSectionChars(40); // keep the small synthetic sections separate
        index = IndexTestSupport.buildIndex(kb.toString(), properties);
    }

    @Test
    void indexesAllDocumentsAsSections() {
        var stats = index.getStats();
        assertEquals(4, stats.documentCount(), "index.md is reserved and not indexed");
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
    void filtersByTypeTagAndStatus() {
        SearchResponse capabilities = index.search("widgets", 10, null, null, "Capability", null);
        assertFalse(capabilities.hits().isEmpty());
        assertTrue(capabilities.hits().stream().allMatch(h -> h.path().endsWith("gamma.md")));
        assertEquals("Capability", capabilities.hits().get(0).type());
        assertEquals("unverified", capabilities.hits().get(0).trustTier());
        assertEquals("draft", capabilities.hits().get(0).status());

        assertTrue(index.search("widgets", 10, null, null, "requirement", null).hits().isEmpty(),
                "type filter is case-insensitive and excludes other types");
        assertOnly(index.search("gizmo", 10, null, null, null, "gizmo-tuning"), "delta.md");
        assertTrue(index.search("gizmo", 10, null, null, null, "widgets").hits().isEmpty());
        assertOnly(index.search("gizmo", 10, null, "stable", "Requirement", "gizmo-tuning"), "delta.md");
        assertTrue(index.search("gizmo", 10, null, "draft", "Requirement", null).hits().isEmpty(),
                "all given filters must match");
    }

    @Test
    void mapsLegacyStatusFilter() {
        // alpha's bold header says Complete, which is OKF "stable"
        SearchResponse stable = index.search("flux capacitor", 10, null, "stable");
        assertTrue(stable.hits().stream().anyMatch(h -> h.path().endsWith("alpha.md")));
        SearchResponse complete = index.search("flux capacitor", 10, null, "Complete");
        assertEquals(stable.hits().size(), complete.hits().size());
        assertOnly(index.search("gizmo", 10, null, "Active"), "delta.md"); // Active → stable, which delta declares
        // legacy "Draft" filters OKF draft documents (gamma) and legacy Draft documents (beta) alike
        assertOnly(index.search("widgets", 10, null, "Draft"), "gamma.md");
        assertOnly(index.search("orders orders", 10, null, "Draft for discussion"), "beta.md");
    }

    private static void assertOnly(SearchResponse response, String file) {
        assertFalse(response.hits().isEmpty(), "expected hits from " + file);
        assertTrue(response.hits().stream().allMatch(h -> h.path().endsWith(file)),
                "expected only " + file + ", got " + response.hits().stream().map(SearchHit::path).toList());
    }

    @Test
    void frontMatterKeysAreNotSearchableButDescriptionIs() {
        assertTrue(index.search("zzyzxsource", 10, null, null).hits().isEmpty(), "repo: sources are not body text");
        assertTrue(index.search("claude", 10, null, null).hits().isEmpty(), "generated actor is not body text");
        SearchResponse suppliers = index.search("suppliers receiving dock", 10, null, null);
        assertFalse(suppliers.hits().isEmpty());
        assertTrue(suppliers.hits().get(0).path().endsWith("gamma.md"));
        // a term only in the front matter title, and one only in the tags
        assertOnly(index.search("twiddle", 10, null, null), "delta.md");
        assertOnly(index.search("intake", 10, null, null), "gamma.md");
    }

    @Test
    void reservedFilesAreNotSearchable() {
        assertTrue(index.search("navigationonly", 10, null, null).hits().isEmpty());
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
