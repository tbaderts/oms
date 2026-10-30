package org.example.mcp.docs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class DocumentFileUtilsTest {

    @ParameterizedTest
    @ValueSource(strings = {"readme.md", "CHANGELOG.MD", "guide.markdown"})
    void shouldAcceptDocumentFiles(String filename) {
        assertThat(DocumentFileUtils.isDocFile(Path.of(filename))).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"image.png", "App.java", "build.gradle", "data.json", "script.sh", "notes.txt", "doc.adoc"})
    void shouldRejectNonDocumentFiles(String filename) {
        assertThat(DocumentFileUtils.isDocFile(Path.of(filename))).isFalse();
    }

    @Test
    void shouldHandleMixedCaseExtensions() {
        assertThat(DocumentFileUtils.isDocFile(Path.of("README.Md"))).isTrue();
        assertThat(DocumentFileUtils.isDocFile(Path.of("doc.TXT"))).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"index.md", "log.md", "sub/INDEX.md"})
    void shouldRecogniseReservedFiles(String path) {
        assertThat(DocumentFileUtils.isReserved(Path.of(path))).isTrue();
    }

    @Test
    void conceptsAreNotReserved() {
        assertThat(DocumentFileUtils.isReserved(Path.of("indexing.md"))).isFalse();
        assertThat(DocumentFileUtils.isReserved(Path.of("catalog.md"))).isFalse();
    }
}
