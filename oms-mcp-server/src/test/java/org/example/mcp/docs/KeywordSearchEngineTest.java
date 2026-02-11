package org.example.mcp.docs;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashSet;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class KeywordSearchEngineTest {

    private KeywordSearchEngine engine;

    @BeforeEach
    void setUp() {
        engine = new KeywordSearchEngine();
    }

    @Test
    void shouldScoreByTermFrequency() {
        String content = "The order was placed. Another order came in. A third order arrived.";
        Set<String> terms = Set.of("order");

        int score = engine.scoreContent(content, terms);

        assertThat(score).isEqualTo(3);
    }

    @Test
    void shouldScoreMultipleTerms() {
        String content = "Buy order for AAPL stock. Sell order for GOOG stock.";
        Set<String> terms = new LinkedHashSet<>();
        terms.add("order");
        terms.add("stock");

        int score = engine.scoreContent(content, terms);

        assertThat(score).isEqualTo(4); // 2 "order" + 2 "stock"
    }

    @Test
    void shouldReturnZeroForNoMatches() {
        int score = engine.scoreContent("nothing relevant here", Set.of("notfound"));
        assertThat(score).isEqualTo(0);
    }

    @Test
    void shouldBeCaseInsensitive() {
        int score = engine.scoreContent("ORDER Order order", Set.of("order"));
        assertThat(score).isEqualTo(3);
    }

    @Test
    void shouldCreateSnippetAroundFirstTerm() {
        String content = "A".repeat(200) + " TARGET_WORD " + "B".repeat(200);

        String snippet = engine.makeSnippet(content, "target_word");

        assertThat(snippet).contains("TARGET_WORD");
        assertThat(snippet.length()).isLessThan(content.length());
    }

    @Test
    void shouldHandleNullFirstTerm() {
        String snippet = engine.makeSnippet("Some content here.", null);
        assertThat(snippet).isNotBlank();
    }

    @Test
    void shouldHandleShortContent() {
        String content = "Short text";
        String snippet = engine.makeSnippet(content, "short");
        assertThat(snippet).isEqualTo("Short text");
    }
}
