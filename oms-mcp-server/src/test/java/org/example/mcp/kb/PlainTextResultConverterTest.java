package org.example.mcp.kb;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.ai.tool.annotation.Tool;

/**
 * SPEC-0065 (AC-10): the knowledge base tools return their Markdown as written. Spring AI's default
 * converter serialises a String with Jackson, so clients got one quoted line with escaped breaks.
 */
class PlainTextResultConverterTest {

    private final PlainTextResultConverter converter = new PlainTextResultConverter();

    @Test
    void aStringIsReturnedAsIs() {
        String markdown = "## Knowledge base search: \"x\"\n\n### 1. `a.md#b`\n";
        assertEquals(markdown, converter.convert(markdown, String.class));
    }

    @Test
    void anythingElseIsSerialisedAsBefore() {
        assertEquals("{\"a\":1}", converter.convert(Map.of("a", 1), Map.class));
    }

    @Test
    void kbToolsReturnTheirMarkdownAsIs() {
        List<String> kbTools = List.of("searchKnowledgeBase", "readKnowledgeBase", "getKnowledgeBaseOverview");
        List<String> plain = Arrays.stream(KnowledgeBaseTools.class.getDeclaredMethods())
                .filter(m -> m.isAnnotationPresent(Tool.class))
                .filter(m -> m.getAnnotation(Tool.class).resultConverter() == PlainTextResultConverter.class)
                .map(Method::getName)
                .sorted()
                .toList();
        assertEquals(kbTools.stream().sorted().toList(), plain);
    }
}
