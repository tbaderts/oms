package org.example.mcp.kb;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

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

        MarkdownParser parser = new MarkdownParser();
        DocumentRepository repository = new DocumentRepository(kb.toString(), parser);
        KnowledgeIndexProperties properties = new KnowledgeIndexProperties();
        properties.getEmbeddings().setEnabled(false);
        properties.setMinSectionChars(40);
        KnowledgeIndexService index = new KnowledgeIndexService(repository,
                new SectionChunker(parser, properties),
                org.example.mcp.index.IndexTestSupport.disabledEmbeddings(properties));
        index.rebuild();
        tools = new KnowledgeBaseTools(index, repository, parser);
        docPath = repository.listAll().get(0).path();
    }

    @Test
    void searchReturnsMarkdownWithCitationsAndHint() {
        String result = tools.searchKnowledgeBase("cancel an order PendingCancel", 5, null, null);
        assertTrue(result.contains("## Knowledge base search:"));
        assertTrue(result.contains("#cancellation"), "expected a path#anchor citation:\n" + result);
        assertTrue(result.contains("lines "), "expected line ranges:\n" + result);
        assertTrue(result.contains("readKnowledgeBase"), "expected next-action hint");
        assertTrue(result.contains("BM25 keyword only"), "embeddings are disabled in this test");
    }

    @Test
    void searchWithEmptyQueryFailsGracefully() {
        assertTrue(tools.searchKnowledgeBase(" ", 5, null, null).startsWith("Error:"));
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
