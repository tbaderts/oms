package org.example.mcp.docs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.example.mcp.docs.MarkdownParser.DocSection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class MarkdownParserTest {

    private MarkdownParser parser;

    @BeforeEach
    void setUp() {
        parser = new MarkdownParser();
    }

    private static final String SAMPLE_MD = """
            # Title
            Some intro text.
            
            ## Section A
            Content of A.
            
            ### Sub-section A1
            Details of A1.
            
            ## Section B
            Content of B.
            """;

    @Nested
    class ExtractSections {

        @Test
        void shouldExtractAllHeadings() {
            List<DocSection> sections = parser.extractSections(SAMPLE_MD);

            assertThat(sections).hasSize(4);
            assertThat(sections.get(0).title()).isEqualTo("Title");
            assertThat(sections.get(0).level()).isEqualTo(1);
            assertThat(sections.get(1).title()).isEqualTo("Section A");
            assertThat(sections.get(1).level()).isEqualTo(2);
            assertThat(sections.get(2).title()).isEqualTo("Sub-section A1");
            assertThat(sections.get(2).level()).isEqualTo(3);
            assertThat(sections.get(3).title()).isEqualTo("Section B");
            assertThat(sections.get(3).level()).isEqualTo(2);
        }

        @Test
        void shouldReturnEmptyListForNoHeadings() {
            assertThat(parser.extractSections("just plain text\nno headings")).isEmpty();
        }

        @Test
        void shouldHandleTrailingHash() {
            List<DocSection> sections = parser.extractSections("## Heading ##\nContent");
            assertThat(sections).hasSize(1);
            assertThat(sections.get(0).title()).isEqualTo("Heading #");
        }
    }

    @Nested
    class ExtractSectionContent {

        @Test
        void shouldExtractSectionUntilNextSameLevel() {
            String[] lines = SAMPLE_MD.split("\n");
            List<DocSection> sections = parser.extractSections(SAMPLE_MD);

            // Section A includes Sub-section A1, stops before Section B
            DocSection sectionA = sections.get(1);
            String content = parser.extractSectionContent(lines, sectionA);

            assertThat(content).contains("Section A");
            assertThat(content).contains("Sub-section A1");
            assertThat(content).doesNotContain("Section B");
        }

        @Test
        void shouldExtractLastSectionToEnd() {
            String[] lines = SAMPLE_MD.split("\n");
            List<DocSection> sections = parser.extractSections(SAMPLE_MD);

            DocSection lastSection = sections.get(sections.size() - 1);
            String content = parser.extractSectionContent(lines, lastSection);

            assertThat(content).contains("Section B");
            assertThat(content).contains("Content of B.");
        }
    }

    @Nested
    class ReadSection {

        @Test
        void shouldFindSectionByExactTitle() {
            String content = parser.readSection(SAMPLE_MD, "Section A");
            assertThat(content).contains("## Section A");
            assertThat(content).contains("Content of A.");
        }

        @Test
        void shouldBeCaseInsensitive() {
            String content = parser.readSection(SAMPLE_MD, "section a");
            assertThat(content).contains("## Section A");
        }

        @Test
        void shouldMatchByPrefix() {
            String content = parser.readSection(SAMPLE_MD, "Section");
            // Should match the first section starting with "Section"
            assertThat(content).contains("Section A");
        }

        @Test
        void shouldThrowOnMissingSection() {
            assertThatThrownBy(() -> parser.readSection(SAMPLE_MD, "nonexistent"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Section not found");
        }
    }
}
