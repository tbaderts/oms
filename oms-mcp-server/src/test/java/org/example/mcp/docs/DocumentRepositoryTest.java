package org.example.mcp.docs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.example.mcp.docs.DocumentRepository.DocContent;
import org.example.mcp.docs.DocumentRepository.DocMeta;
import org.example.mcp.docs.DocumentRepository.DomainDocReadException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DocumentRepositoryTest {

    @TempDir
    Path tempDir;

    private DocumentRepository repo;

    @BeforeEach
    void setUp() throws IOException {
        // Create a small doc tree
        Files.writeString(tempDir.resolve("readme.md"), "# Hello\n\n**Version:** 1.0\n**Status:** Active\n\nThis is a test document.");
        Files.createDirectories(tempDir.resolve("sub"));
        Files.writeString(tempDir.resolve("sub/guide.md"), "# Guide\nGuide content here.");
        Files.writeString(tempDir.resolve("sub/notes.txt"), "Not markdown."); // excluded: OKF bundles are markdown
        Files.writeString(tempDir.resolve("image.png"), "not a doc"); // should be excluded
        Files.writeString(tempDir.resolve("index.md"), "# Index\n\n- [Readme](readme.md)\n"); // reserved
        Files.writeString(tempDir.resolve("sub/concept.md"), """
                ---
                type: Capability
                title: "Order Capture"
                description: "Taking orders in."
                tags: [orders]
                status: draft
                maturity: implemented
                ---
                # Order Capture

                Body.
                """);

        // Create MarkdownParser instance for DocumentRepository
        MarkdownParser markdownParser = new MarkdownParser();
        repo = new DocumentRepository(tempDir.toAbsolutePath().toString(), markdownParser);
    }

    @Nested
    class ListAll {

        @Test
        void shouldListOnlyDocFiles() {
            List<DocMeta> docs = repo.listAll();

            assertThat(docs).extracting(DocMeta::name)
                    .containsExactlyInAnyOrder("readme.md", "guide.md", "concept.md", "index.md");
        }

        @Test
        void onlyMarkdownAndReservedFlagged() {
            List<DocMeta> docs = repo.listAll();

            assertThat(docs).noneMatch(d -> d.name().endsWith(".txt"));
            assertThat(docs).filteredOn(d -> d.name().equals("index.md"))
                    .singleElement().extracting(DocMeta::concept).isEqualTo(false);
            assertThat(docs).filteredOn(d -> !d.name().equals("index.md"))
                    .allMatch(DocMeta::concept);
        }

        @Test
        void listsOkfMetadataAndLegacyMetadata() {
            List<DocMeta> docs = repo.listAll();

            DocMeta concept = docs.stream().filter(d -> d.name().equals("concept.md")).findFirst().orElseThrow();
            assertThat(concept.okf().type()).isEqualTo("Capability");
            assertThat(concept.okf().title()).isEqualTo("Order Capture");
            assertThat(concept.okf().description()).isEqualTo("Taking orders in.");
            assertThat(concept.okf().tags()).containsExactly("orders");
            assertThat(concept.okf().maturity()).isEqualTo("implemented");
            assertThat(concept.okf().trustTier()).isEqualTo("unverified");
            assertThat(concept.status()).isEqualTo("draft");

            DocMeta legacy = docs.stream().filter(d -> d.name().equals("readme.md")).findFirst().orElseThrow();
            assertThat(legacy.okf().type()).isNull();
            assertThat(legacy.status()).isEqualTo("Active");
            assertThat(legacy.version()).isEqualTo("1.0");
        }

        @Test
        void listsDocumentsWithBrokenFrontMatter() throws IOException {
            Files.writeString(tempDir.resolve("broken.md"), "---\ntags: [unclosed\n---\n# Broken\n");

            DocMeta broken = repo.listAll().stream().filter(d -> d.name().equals("broken.md")).findFirst().orElseThrow();
            assertThat(broken.okf().type()).isNull();
            assertThat(broken.concept()).isTrue();
        }

        @Test
        void shouldIncludeFileSizeAndModifiedTime() {
            List<DocMeta> docs = repo.listAll();
            for (DocMeta doc : docs) {
                assertThat(doc.size()).isGreaterThan(0);
                assertThat(doc.lastModifiedIso()).isNotBlank();
            }
        }
    }

    @Nested
    class ReadContent {

        @Test
        void shouldReadFileContent() {
            String content = repo.readContent("readme.md");
            assertThat(content).contains("# Hello");
        }

        @Test
        void shouldReadSubdirectoryFile() {
            String content = repo.readContent("sub/guide.md");
            assertThat(content).contains("Guide content");
        }

        @Test
        void readBodyBlanksFrontMatterKeepingLines() {
            String raw = repo.readContent("sub/concept.md");
            String body = repo.readBody("sub/concept.md");
            assertThat(body).doesNotContain("type: Capability").contains("# Order Capture");
            assertThat(body.split("\n", -1)).hasSameSizeAs(raw.split("\n", -1));
        }

        @Test
        void shouldThrowOnMissingFile() {
            assertThatThrownBy(() -> repo.readContent("nonexistent.md"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("not found");
        }
    }

    @Nested
    class ResolveAgainstBases {

        @Test
        void shouldResolveDirectRelativePath() {
            Path resolved = repo.resolveAgainstBases("readme.md");
            assertThat(resolved).isNotNull();
            assertThat(resolved.getFileName().toString()).isEqualTo("readme.md");
        }

        @Test
        void shouldResolvePathWithBaseDirPrefix() {
            String baseName = tempDir.getFileName().toString();
            Path resolved = repo.resolveAgainstBases(baseName + "/readme.md");
            assertThat(resolved).isNotNull();
        }

        @Test
        void shouldReturnNullForPathTraversalAttempt() {
            Path resolved = repo.resolveAgainstBases("../../etc/passwd");
            assertThat(resolved).isNull();
        }

        @Test
        void shouldReturnNullForMissingFile() {
            Path resolved = repo.resolveAgainstBases("missing.md");
            assertThat(resolved).isNull();
        }
    }

    @Nested
    class FindAllDocFiles {

        @Test
        void shouldFindAllDocFilesRecursively() {
            List<Path> files = repo.findAllDocFiles();
            assertThat(files).hasSize(4);
        }

        @Test
        void shouldExcludeNonDocFiles() {
            List<Path> files = repo.findAllDocFiles();
            assertThat(files).noneMatch(p -> p.getFileName().toString().endsWith(".png"));
        }
    }

    @Nested
    class Relativize {

        @Test
        void shouldProduceBaseNamePrefixedPath() {
            Path file = tempDir.resolve("readme.md");
            String relative = repo.relativize(file);
            assertThat(relative).endsWith("/readme.md");
            assertThat(relative).contains(tempDir.getFileName().toString());
        }
    }

    @Nested
    class Clamp {

        @Test
        void shouldClampToRange() {
            assertThat(DocumentRepository.clamp(5, 0, 10)).isEqualTo(5);
            assertThat(DocumentRepository.clamp(-1, 0, 10)).isEqualTo(0);
            assertThat(DocumentRepository.clamp(15, 0, 10)).isEqualTo(10);
        }
    }
}
