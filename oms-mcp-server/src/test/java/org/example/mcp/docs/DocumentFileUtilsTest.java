package org.example.mcp.docs;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class DocumentFileUtilsTest {

    @ParameterizedTest
    @ValueSource(strings = {"readme.md", "CHANGELOG.MD", "guide.markdown", "notes.txt", "doc.adoc"})
    void shouldAcceptDocumentFiles(String filename) {
        assertThat(DocumentFileUtils.isDocFile(Path.of(filename))).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"image.png", "App.java", "build.gradle", "data.json", "script.sh"})
    void shouldRejectNonDocumentFiles(String filename) {
        assertThat(DocumentFileUtils.isDocFile(Path.of(filename))).isFalse();
    }

    @Test
    void shouldHandleMixedCaseExtensions() {
        assertThat(DocumentFileUtils.isDocFile(Path.of("README.Md"))).isTrue();
        assertThat(DocumentFileUtils.isDocFile(Path.of("doc.TXT"))).isTrue();
    }
}
