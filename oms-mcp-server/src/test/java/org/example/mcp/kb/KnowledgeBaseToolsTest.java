package org.example.mcp.kb;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.example.mcp.docs.ConceptLinks;
import org.example.mcp.docs.DocumentRepository;
import org.example.mcp.docs.MarkdownParser;
import org.example.mcp.index.KnowledgeIndexProperties;
import org.example.mcp.index.KnowledgeIndexService;
import org.example.mcp.index.SectionChunker;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class KnowledgeBaseToolsTest {

    @TempDir
    static Path kb;

    static KnowledgeBaseTools tools;
    static String docPath;

    @BeforeAll
    static void setUp() throws IOException {
        Files.writeString(kb.resolve("lifecycle.md"), """
                # Order Lifecycle

                **Version:** 2.0
                **Status:** Complete
                **Category:** concepts

                Describes how orders move through their lifecycle states in the system.

                ## Order States

                An order starts in New, can become PartiallyFilled after an execution,
                and ends in Filled, Cancelled or Rejected depending on the flow.

                ## Cancellation

                A cancel request moves the order to PendingCancel until it is confirmed
                by the downstream venue, after which it becomes Cancelled permanently.
                """);

        Files.writeString(kb.resolve("x-capture.md"), """
                ---
                type: Capability
                title: "Widget Intake"
                description: "Accepting widgets from suppliers at the receiving dock."
                tags: [widgets, intake]
                status: draft
                maturity: implemented
                generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
                sources:
                  - resource: "repo:zzyzx/Main.java"
                ---
                # Widget Intake

                ## Requirements

                - [FR-001 Count widgets](x-fr-001.md)
                - [Gone](x-missing.md)

                ## Behaviour

                Widgets are counted, labelled and stored in bins at the receiving dock every morning.
                """);
        Files.writeString(kb.resolve("x-fr-001.md"), """
                ---
                type: Requirement
                title: "Count widgets"
                description: "Every received widget is counted."
                tags: [widgets]
                status: draft
                id: FR-001
                priority: must
                implementation: implemented
                capability: /x-capture.md
                updated: "2026-10-01T00:00:00Z"
                verified: { by: "human:tbaderts", at: "2026-10-27T18:00:00Z" }
                ---
                # FR-001 Count widgets

                Part of [Widget Intake](x-capture.md). Counting happens on the conveyor.
                """);
        Files.writeString(kb.resolve("index.md"), "# Index\n\n- [Widget Intake](x-capture.md) — navigationonly\n");
        Files.writeString(kb.resolve("log.md"), "# Log\n\n## 2026-10-27\n\nlogonlyword entry.\n");

        MarkdownParser parser = new MarkdownParser();
        DocumentRepository repository = new DocumentRepository(kb.toString(), parser);
        KnowledgeIndexProperties properties = new KnowledgeIndexProperties();
        properties.getEmbeddings().setEnabled(false);
        properties.setMinSectionChars(40);
        ConceptLinks links = new ConceptLinks(repository);
        KnowledgeIndexService index = new KnowledgeIndexService(repository,
                new SectionChunker(parser, properties),
                org.example.mcp.index.IndexTestSupport.disabledEmbeddings(properties), links);
        index.rebuild();
        tools = new KnowledgeBaseTools(index, repository, parser, links);
        base = kb.getFileName().toString();
        docPath = base + "/lifecycle.md";
    }

    static String base;

    @Test
    void searchHitsShowTypeStatusAndTrust() {
        String result = tools.searchKnowledgeBase("widgets receiving dock", 5, null, null, null, null);
        assertTrue(result.contains("Capability · draft · unverified"), result);
        String filtered = tools.searchKnowledgeBase("widgets", 5, null, null, "Requirement", null);
        assertTrue(filtered.contains("/x-fr-001.md") && !filtered.contains("/x-capture.md`")
                && !filtered.contains("/x-capture.md#"), "only the requirement is cited:\n" + filtered);
        assertTrue(filtered.contains("Requirement · draft · human-reviewed"), filtered);
        String legacy = tools.searchKnowledgeBase("cancel request", 5, null, "Active", null, null);
        assertTrue(legacy.contains("lifecycle.md"), "Active maps to stable, the legacy doc is Complete:\n" + legacy);
    }

    @Test
    void wholeReadShowsMetadataLinksAndBacklinks() {
        String result = tools.readKnowledgeBase(base + "/x-capture.md", null, null, null);
        assertTrue(result.startsWith("## `" + base + "/x-capture.md`\n\n**Type:** Capability"),
                "metadata comes first, right after the path:\n" + result);
        assertTrue(result.contains("**Type:** Capability"), result);
        assertTrue(result.contains("**Status:** draft"), result);
        assertTrue(result.contains("**Trust:** unverified"), result);
        assertTrue(result.contains("**Maturity:** implemented"), result);
        assertTrue(result.contains("Accepting widgets from suppliers"), result);
        assertFalse(result.contains("generated:") || result.contains("repo:zzyzx") || result.contains("type: Capability"), result);
        assertTrue(result.contains("### Links"), result);
        assertTrue(result.contains("`" + base + "/x-fr-001.md`"), result);
        assertTrue(result.contains("### Cited by"), result);
        assertTrue(result.indexOf("x-fr-001.md", result.indexOf("### Cited by")) > 0, result);
        assertFalse(result.substring(result.indexOf("### Cited by")).contains("index.md"),
                "navigation files are not citations:\n" + result);
    }

    @Test
    void legacyHitsStateTrustTier() {
        String result = tools.searchKnowledgeBase("cancel request PendingCancel", 5, null, null, null, null);
        assertTrue(result.contains("Complete · unverified"), result);
    }

    @Test
    void brokenLinksAreListedNotFatal() {
        String result = tools.readKnowledgeBase(base + "/x-capture.md", null, null, null);
        assertTrue(result.contains("`" + base + "/x-missing.md` (broken)"), result);
    }

    @Test
    void overviewListsConceptsOnly() {
        String result = tools.getKnowledgeBaseOverview();
        assertFalse(result.contains("index.md"), "reserved files are not concepts:\n" + result);
        assertTrue(result.contains("Capability · draft · unverified"), result);
        assertTrue(result.contains("Accepting widgets from suppliers at the receiving dock."), "description as summary:\n" + result);
        // title, tags, updated and the project keys (AC-1)
        assertTrue(result.contains("### Widget Intake — `" + base + "/x-capture.md`"), "title in heading:\n" + result);
        assertTrue(result.contains("Tags: widgets, intake"), result);
        assertTrue(result.contains("Maturity: implemented"), result);
        assertTrue(result.contains("### Count widgets — `" + base + "/x-fr-001.md`"), result);
        assertTrue(result.contains("Id: FR-001 · Priority: must · Implementation: implemented · Capability: /x-capture.md"), result);
        assertTrue(result.contains("Updated: 2026-10-01T00:00:00Z"), result);
        // legacy documents keep a path-only heading
        assertTrue(result.contains("### `" + docPath + "`"), result);
    }

    @Test
    void reservedFilesStayReadable() {
        String result = tools.readKnowledgeBase(base + "/index.md", null, null, null);
        assertTrue(result.contains("navigationonly"), result);
        assertFalse(tools.searchKnowledgeBase("navigationonly", 5, null, null, null, null).contains("index.md"));
        assertTrue(tools.readKnowledgeBase(base + "/log.md", null, null, null).contains("logonlyword"));
        assertFalse(tools.searchKnowledgeBase("logonlyword", 5, null, null, null, null).contains("log.md"));
        assertFalse(tools.getKnowledgeBaseOverview().contains("log.md"));
    }

    @Test
    void searchReturnsMarkdownWithCitationsAndHint() {
        String result = tools.searchKnowledgeBase("cancel an order PendingCancel", 5, null, null, null, null);
        assertTrue(result.contains("## Knowledge base search:"));
        assertTrue(result.contains("#cancellation"), "expected a path#anchor citation:\n" + result);
        assertTrue(result.contains("lines "), "expected line ranges:\n" + result);
        assertTrue(result.contains("readKnowledgeBase"), "expected next-action hint");
        assertTrue(result.contains("BM25 keyword only"), "embeddings are disabled in this test");
    }

    @Test
    void searchWithEmptyQueryFailsGracefully() {
        assertTrue(tools.searchKnowledgeBase(" ", 5, null, null, null, null).startsWith("Error:"));
    }

    @Test
    void readSectionByAnchor() {
        String result = tools.readKnowledgeBase(docPath, "cancellation", null, null);
        assertTrue(result.contains("#cancellation`"));
        assertTrue(result.contains("PendingCancel"));
        assertTrue(result.contains("Lines "));
    }

    @Test
    void readSectionByTitleAlsoWorks() {
        String result = tools.readKnowledgeBase(docPath, "Order States", null, null);
        assertTrue(result.contains("PartiallyFilled"));
    }

    @Test
    void unknownAnchorListsAvailableSections() {
        String result = tools.readKnowledgeBase(docPath, "nope-not-here", null, null);
        assertTrue(result.startsWith("Error:"));
        assertTrue(result.contains("#order-states"), "should list available anchors:\n" + result);
        assertTrue(result.contains("#cancellation"));
    }

    @Test
    void wholeDocReadIncludesOutline() {
        String result = tools.readKnowledgeBase(docPath, null, null, null);
        assertTrue(result.contains("# Order Lifecycle"));
        assertTrue(result.contains("Section outline"));
        assertTrue(result.contains("#order-states"));
    }

    @Test
    void unknownPathFailsWithGuidance() {
        String result = tools.readKnowledgeBase("does/not/exist.md", null, null, null);
        assertTrue(result.startsWith("Error:"));
        assertTrue(result.contains("getKnowledgeBaseOverview"));
    }

    @Test
    void overviewListsDocsWithMetadataAndSections() {
        String result = tools.getKnowledgeBaseOverview();
        assertTrue(result.contains("# OMS Knowledge Base Overview"));
        assertTrue(result.contains(docPath));
        assertTrue(result.contains("v2.0"));
        assertTrue(result.contains("Complete"));
        assertTrue(result.contains("`#order-states`"));
        assertTrue(result.contains("BM25 keyword"), "should state search mode when embeddings are off");
    }
}
