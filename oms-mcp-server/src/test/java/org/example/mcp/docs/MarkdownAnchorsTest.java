package org.example.mcp.docs;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.example.mcp.docs.MarkdownParser.DocSection;
import org.junit.jupiter.api.Test;

class MarkdownAnchorsTest {

    @Test
    void slugifiesLikeGithub() {
        assertEquals("state-transitions", MarkdownAnchors.slugify("State Transitions"));
        assertEquals("3-order-entity-specification", MarkdownAnchors.slugify("3. Order Entity Specification"));
        assertEquals("error-paths-and-edge-cases", MarkdownAnchors.slugify("Error Paths and Edge Cases"));
        assertEquals("whats-new", MarkdownAnchors.slugify("What's New?"));
        assertEquals("a-b", MarkdownAnchors.slugify("A & B")); // '&' stripped, whitespace runs collapse
    }

    @Test
    void deduplicatesRepeatedTitles() {
        List<DocSection> sections = List.of(
                new DocSection("Overview", 2, 1),
                new DocSection("Example", 3, 5),
                new DocSection("Example", 3, 10),
                new DocSection("Example", 3, 15));
        List<String> anchors = MarkdownAnchors.assignAnchors(sections);
        assertEquals(List.of("overview", "example", "example-1", "example-2"), anchors);
    }
}
