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
        Files.writeString(tempDir.resolve("readme.md"), "# Hello\nThis is a test document.");
        Files.createDirectories(tempDir.resolve("sub"));
        Files.writeString(tempDir.resolve("sub/guide.txt"), "Guide content here.");
        Files.writeString(tempDir.resolve("image.png"), "not a doc"); // should be excluded

        repo = new DocumentRepository(tempDir.toAbsolutePath().toString());
    }

    @Nested
    class ListAll {

        @Test
        void shouldListOnlyDocFiles() {
            List<DocMeta> docs = repo.listAll();

            assertThat(docs).hasSize(2);
            assertThat(docs).extracting(DocMeta::name)
                    .containsExactlyInAnyOrder("readme.md", "guide.txt");
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
            String content = repo.readContent("sub/guide.txt");
            assertThat(content).contains("Guide content");
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
            assertThat(files).hasSize(2);
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
