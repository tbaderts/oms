package org.example.mcp.docs;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.example.mcp.docs.MarkdownParser.DocSection;

/**
 * GitHub-style heading anchors (slugs) for markdown sections, so that search
 * results can cite {@code path#anchor} and readers can resolve the same anchor
 * back to a section.
 */
public final class MarkdownAnchors {

    private MarkdownAnchors() {
    }

    /**
     * Slugify a heading title the way GitHub does: lowercase, strip everything
     * but letters/digits/spaces/hyphens, then spaces to hyphens.
     */
    public static String slugify(String title) {
        String slug = title.toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{IsAlphabetic}\\p{IsDigit}\\s-]", "")
                .trim()
                .replaceAll("\\s+", "-");
        return slug;
    }

    /**
     * Assign anchors to all sections of a document in order, de-duplicating
     * repeated titles with {@code -1}, {@code -2} suffixes (GitHub behavior).
     *
     * @return list of anchors parallel to {@code sections}
     */
    public static List<String> assignAnchors(List<DocSection> sections) {
        List<String> anchors = new ArrayList<>(sections.size());
        Map<String, Integer> seen = new HashMap<>();
        for (DocSection section : sections) {
            String base = slugify(section.title());
            int count = seen.merge(base, 1, Integer::sum);
            anchors.add(count == 1 ? base : base + "-" + (count - 1));
        }
        return anchors;
    }
}
