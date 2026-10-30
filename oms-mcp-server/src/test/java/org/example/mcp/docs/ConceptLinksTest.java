package org.example.mcp.docs;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.example.mcp.docs.ConceptLinks.Link;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ConceptLinksTest {

    @TempDir
    Path kb;

    private ConceptLinks links;
    private String base;

    @BeforeEach
    void setUp() throws IOException {
        Files.createDirectories(kb.resolve("capabilities"));
        Files.createDirectories(kb.resolve("requirements"));
        Files.writeString(kb.resolve("capabilities/capture.md"), """
                ---
                type: Capability
                description: "links in front matter are ignored: [x](nowhere.md)"
                ---
                # Capture

                Requirements: [FR-001](../requirements/FR-001.md), [root link](/requirements/FR-002.md#anchor),
                [folder](../requirements/), [gone](missing.md), [web](https://example.com/x.md), [top](#capture).

                `[inline code](ignored.md)`

                ```markdown
                [fenced](ignored-too.md)
                ```
                """);
        Files.writeString(kb.resolve("requirements/FR-001.md"), "# FR-001\n\nPart of [Capture](../capabilities/capture.md).\n");
        Files.writeString(kb.resolve("requirements/FR-002.md"), "# FR-002\n\nSee [capture](/capabilities/capture.md).\n");
        Files.writeString(kb.resolve("requirements/index.md"), "# Requirements\n\n- [FR-001](FR-001.md)\n");
        DocumentRepository repository = new DocumentRepository(kb.toString(), new MarkdownParser());
        links = new ConceptLinks(repository);
        base = kb.getFileName().toString();
    }

    @Test
    void resolvesRelativeRootAndIgnoresCodeAndExternal() {
        assertThat(links.outgoing(base + "/capabilities/capture.md"))
                .extracting(Link::target, Link::exists)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(base + "/requirements/FR-001.md", true),
                        org.assertj.core.groups.Tuple.tuple(base + "/requirements/FR-002.md", true),
                        org.assertj.core.groups.Tuple.tuple(base + "/requirements/index.md", true),
                        org.assertj.core.groups.Tuple.tuple(base + "/capabilities/missing.md", false));
    }

    @Test
    void backlinksAreTheInverseOfOutgoingLinks() {
        assertThat(links.backlinks(base + "/capabilities/capture.md"))
                .containsExactly(base + "/requirements/FR-001.md", base + "/requirements/FR-002.md");
        // navigation files (index.md, log.md) are not citations
        assertThat(links.backlinks(base + "/requirements/FR-001.md"))
                .containsExactly(base + "/capabilities/capture.md");
    }

    @Test
    void existingNonMarkdownTargetsAndLinksLeavingTheBundle() throws IOException {
        Files.writeString(kb.resolve("requirements/notes.markdown"), "# Notes\n");
        Files.writeString(kb.resolve("requirements/diagram.png"), "png");
        Files.writeString(kb.resolve("requirements/FR-009.md"),
                "# FR-009\n\n[notes](notes.markdown) [diagram](diagram.png) [outside](../../outside.md) [folder](../capabilities)\n");
        links.invalidate();

        assertThat(links.outgoing(base + "/requirements/FR-009.md"))
                .extracting(Link::target, Link::exists)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(base + "/requirements/notes.markdown", true),
                        org.assertj.core.groups.Tuple.tuple(base + "/requirements/diagram.png", true),
                        // <base>/requirements/../../outside.md is next to the bundle, not in it
                        org.assertj.core.groups.Tuple.tuple("outside.md", false),
                        org.assertj.core.groups.Tuple.tuple(base + "/capabilities/index.md", false));
    }

    @Test
    void acceptsPathsWithoutTheBasePrefix() {
        assertThat(links.backlinks("capabilities/capture.md")).hasSize(2);
        assertThat(links.outgoing("unknown.md")).isEmpty();
    }

    @Test
    void invalidateRebuildsFromDisk() throws IOException {
        assertThat(links.backlinks(base + "/requirements/FR-002.md")).hasSize(1);
        Files.writeString(kb.resolve("requirements/FR-003.md"), "# FR-003\n\nSee [FR-002](FR-002.md).\n");
        assertThat(links.backlinks(base + "/requirements/FR-002.md")).hasSize(1);
        links.invalidate();
        assertThat(links.backlinks(base + "/requirements/FR-002.md")).hasSize(2);
    }
}
