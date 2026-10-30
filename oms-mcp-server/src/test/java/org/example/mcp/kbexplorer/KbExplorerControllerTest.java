package org.example.mcp.kbexplorer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.example.mcp.docs.ConceptLinks;
import org.example.mcp.docs.DocumentRepository;
import org.example.mcp.docs.MarkdownParser;
import org.example.mcp.index.IndexTestSupport;
import org.example.mcp.index.KnowledgeIndexProperties;
import org.example.mcp.index.KnowledgeIndexService;
import org.example.mcp.index.SectionChunker;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.reactive.server.WebTestClient;

/** The JSON the KB explorer consumes from {@code /api/kb}. */
class KbExplorerControllerTest {

    @TempDir
    static Path kb;

    static WebTestClient client;

    @BeforeAll
    static void setUp() throws IOException {
        Files.writeString(kb.resolve("capture.md"), """
                ---
                type: Capability
                title: "Widget Intake"
                description: "Accepting widgets."
                tags: [widgets, intake]
                status: draft
                maturity: implemented
                stale_after: "2020-01-01T00:00:00Z"
                sources:
                  - resource: "repo:widgets/Main.java"
                  - resource: /legacy.md
                # a YAML comment that is not a heading
                ---
                # Widget Intake

                **Status:** Active

                ## Behaviour

                Widgets are counted at the dock, labelled and stored in bins by the morning shift.
                See the [legacy spec](legacy.md) and [gone](missing.md).
                """);
        Files.writeString(kb.resolve("legacy.md"), """
                # Legacy Spec

                **Version:** 1.0
                **Status:** Complete

                Widgets are mentioned here as well, in a document without front matter at all.
                """);
        Files.writeString(kb.resolve("index.md"), "# Index\n\n- [Widget Intake](capture.md)\n");

        MarkdownParser parser = new MarkdownParser();
        DocumentRepository repository = new DocumentRepository(kb.toString(), parser);
        KnowledgeIndexProperties properties = IndexTestSupport.bm25OnlyProperties();
        KnowledgeIndexService index = new KnowledgeIndexService(repository, new SectionChunker(parser, properties),
                IndexTestSupport.disabledEmbeddings(properties), new ConceptLinks(repository));
        index.rebuild();
        client = WebTestClient.bindToController(
                new KbExplorerController(repository, parser, index, new ConceptLinks(repository))).build();
        base = kb.getFileName().toString();
    }

    static String base;

    @Test
    void documentsCarryOkfSources() {
        client.get().uri("/api/kb/documents").exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$[?(@.name == 'capture.md')].okf.sources[0]").isEqualTo("repo:widgets/Main.java")
                .jsonPath("$[?(@.name == 'capture.md')].okf.sources[1]").isEqualTo("/legacy.md");
    }

    @Test
    void linksEndpointListsOutgoingAndBacklinks() {
        client.get().uri(b -> b.path("/api/kb/documents/links").queryParam("path", base + "/capture.md").build())
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.outgoing.length()").isEqualTo(2)
                .jsonPath("$.outgoing[0].target").isEqualTo(base + "/legacy.md")
                .jsonPath("$.outgoing[0].exists").isEqualTo(true)
                .jsonPath("$.outgoing[1].target").isEqualTo(base + "/missing.md")
                .jsonPath("$.outgoing[1].exists").isEqualTo(false)
                // index.md links to capture.md but is navigation, not a citation
                .jsonPath("$.backlinks.length()").isEqualTo(0);
        client.get().uri(b -> b.path("/api/kb/documents/links").queryParam("path", base + "/legacy.md").build())
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.backlinks[0]").isEqualTo(base + "/capture.md");
        client.get().uri(b -> b.path("/api/kb/documents/links").queryParam("path", "nope/unknown.md").build())
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.outgoing.length()").isEqualTo(0)
                .jsonPath("$.backlinks.length()").isEqualTo(0);
    }

    @Test
    void documentsCarryOkfMetadataAndConceptFlag() {
        client.get().uri("/api/kb/documents").exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$[?(@.name == 'capture.md')].status").isEqualTo("draft")
                .jsonPath("$[?(@.name == 'capture.md')].concept").isEqualTo(true)
                .jsonPath("$[?(@.name == 'capture.md')].okf.type").isEqualTo("Capability")
                .jsonPath("$[?(@.name == 'capture.md')].okf.title").isEqualTo("Widget Intake")
                .jsonPath("$[?(@.name == 'capture.md')].okf.tags[0]").isEqualTo("widgets")
                .jsonPath("$[?(@.name == 'capture.md')].okf.legacyStatus").isEqualTo("Active")
                .jsonPath("$[?(@.name == 'capture.md')].okf.trustTier").isEqualTo("unverified")
                .jsonPath("$[?(@.name == 'capture.md')].okf.stale").isEqualTo(true)
                .jsonPath("$[?(@.name == 'capture.md')].okf.maturity").isEqualTo("implemented")
                .jsonPath("$[?(@.name == 'legacy.md')].status").isEqualTo("Complete")
                .jsonPath("$[?(@.name == 'legacy.md')].version").isEqualTo("1.0")
                .jsonPath("$[?(@.name == 'legacy.md')].okf.type")
                .value(v -> org.assertj.core.api.Assertions.assertThat((java.util.List<?>) v).containsOnlyNulls())
                .jsonPath("$[?(@.name == 'legacy.md')].okf.legacyStatus").isEqualTo("Complete")
                .jsonPath("$[?(@.name == 'index.md')].concept").isEqualTo(false);
    }

    @Test
    void sectionsIgnoreFrontMatter() {
        String base = kb.getFileName().toString();
        client.get().uri(b -> b.path("/api/kb/documents/sections").queryParam("path", base + "/capture.md").build())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.length()").isEqualTo(2)
                .jsonPath("$[0].title").isEqualTo("Widget Intake")
                .jsonPath("$[0].lineNumber").isEqualTo(14); // the file line of "# Widget Intake"
    }

    @Test
    void searchEndpointsFilterByTypeAndTag() {
        client.get().uri(b -> b.path("/api/kb/search/keyword").queryParam("query", "widgets")
                        .queryParam("filterType", "Capability").build())
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$.length()").isEqualTo(2) // metadata chunk and the Behaviour section of capture.md
                .jsonPath("$[0].path").value(p -> org.assertj.core.api.Assertions.assertThat((String) p).endsWith("capture.md"));
        client.get().uri(b -> b.path("/api/kb/search/hybrid").queryParam("query", "widgets")
                        .queryParam("filterTag", "intake").build())
                .exchange().expectStatus().isOk().expectBody()
                .jsonPath("$[*].path").value(paths -> org.assertj.core.api.Assertions.assertThat(paths.toString())
                        .contains("capture.md").doesNotContain("legacy.md"));
        client.get().uri(b -> b.path("/api/kb/search/semantic").queryParam("query", "widgets")
                        .queryParam("filterType", "Capability").build())
                .exchange().expectStatus().isOk();
    }
}
