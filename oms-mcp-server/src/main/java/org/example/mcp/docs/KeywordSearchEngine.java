package org.example.mcp.docs;

import java.util.Locale;
import java.util.Set;

import org.springframework.stereotype.Component;

/**
 * Term-frequency keyword search engine used by domain-document MCP tools.
 */
@Component
public class KeywordSearchEngine {

    /**
     * Score content by counting occurrences of every query term.
     */
    public int scoreContent(String content, Set<String> terms) {
        String lc = content.toLowerCase(Locale.ROOT);
        int score = 0;
        for (String t : terms) {
            score += countOccurrences(lc, t);
        }
        return score;
    }

    /**
     * Create a short snippet around the first occurrence of
     * {@code firstTerm} (±80 chars context, 240 chars total).
     */
    public String makeSnippet(String content, String firstTerm) {
        String lc = content.toLowerCase(Locale.ROOT);
        int pos = firstTerm == null ? -1 : lc.indexOf(firstTerm.toLowerCase(Locale.ROOT));
        int start = Math.max(0, pos < 0 ? 0 : pos - 80);
        int end = Math.min(content.length(), start + 240);
        String snippet = content.substring(start, end).replace('\n', ' ').trim();
        if (start > 0) snippet = "… " + snippet;
        if (end < content.length()) snippet = snippet + " …";
        return snippet;
    }

    // ----- internal -----

    private static int countOccurrences(String text, String term) {
        if (term.isEmpty()) return 0;
        int count = 0;
        int idx = 0;
        while ((idx = text.indexOf(term, idx)) != -1) {
            count++;
            idx += term.length();
        }
        return count;
    }
}
