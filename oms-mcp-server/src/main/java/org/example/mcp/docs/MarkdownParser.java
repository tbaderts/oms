package org.example.mcp.docs;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/**
 * Parses Markdown documents into sections and extracts section content.
 */
@Component
public class MarkdownParser {

    public record DocSection(String title, int level, int lineNumber) {}
    public record DocMetadata(String version, String status, String lastUpdated, String category) {}

    /**
     * Extract all heading-defined sections from Markdown content.
     *
     * @param content full markdown text
     * @return list of sections with title, heading level and 1-based line number
     */
    public List<DocSection> extractSections(String content) {
        List<DocSection> sections = new ArrayList<>();
        String[] lines = content.split("\n");

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.startsWith("#")) {
                int level = 0;
                while (level < line.length() && line.charAt(level) == '#') {
                    level++;
                }
                if (level > 0 && level < line.length()) {
                    String title = line.substring(level).trim();
                    // Remove trailing # if present
                    if (title.endsWith("#")) {
                        title = title.substring(0, title.length() - 1).trim();
                    }
                    sections.add(new DocSection(title, level, i + 1));
                }
            }
        }
        return sections;
    }

    /**
     * Extract the text belonging to a single section (from its heading line up
     * to the next heading of the same or higher level).
     *
     * @param lines   the pre-split line array
     * @param section the section whose content to extract
     * @return section text including its heading line
     */
    public String extractSectionContent(String[] lines, DocSection section) {
        int startLine = section.lineNumber() - 1; // Convert to 0-based
        if (startLine >= lines.length) return "";

        int sectionLevel = section.level();
        int endLine = lines.length;

        for (int i = startLine + 1; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.startsWith("#")) {
                int level = 0;
                while (level < line.length() && line.charAt(level) == '#') {
                    level++;
                }
                if (level <= sectionLevel) {
                    endLine = i;
                    break;
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        for (int i = startLine; i < endLine; i++) {
            sb.append(lines[i]).append("\n");
        }
        return sb.toString();
    }

    /**
     * Find a section by (case-insensitive, prefix-matching) title and return
     * its content.
     *
     * @param content      full document text
     * @param sectionTitle title to search for
     * @return the section text including its heading
     * @throws IllegalArgumentException if the section is not found
     */
    public String readSection(String content, String sectionTitle) {
        String[] lines = content.split("\n");
        String normalizedTitle = sectionTitle.trim().toLowerCase(Locale.ROOT);

        int startLine = -1;
        int sectionLevel = -1;

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.startsWith("#")) {
                int level = 0;
                while (level < line.length() && line.charAt(level) == '#') {
                    level++;
                }
                String title = line.substring(level).trim().toLowerCase(Locale.ROOT);
                if (title.equals(normalizedTitle) || title.startsWith(normalizedTitle)) {
                    startLine = i;
                    sectionLevel = level;
                    break;
                }
            }
        }

        if (startLine == -1) {
            throw new IllegalArgumentException("Section not found: " + sectionTitle);
        }

        int endLine = lines.length;
        for (int i = startLine + 1; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.startsWith("#")) {
                int level = 0;
                while (level < line.length() && line.charAt(level) == '#') {
                    level++;
                }
                if (level <= sectionLevel) {
                    endLine = i;
                    break;
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        for (int i = startLine; i < endLine; i++) {
            sb.append(lines[i]).append("\n");
        }
        return sb.toString();
    }

    /**
     * Extract metadata from document header (Version, Status, Last Updated, Category).
     * Looks for bold metadata fields in the first 20 lines of the document.
     *
     * @param content full document text
     * @return metadata record with extracted values (nulls if not found)
     */
    public DocMetadata extractMetadata(String content) {
        String[] lines = content.split("\n");
        int searchLimit = Math.min(lines.length, 20);

        Map<String, String> metadata = new HashMap<>();
        Pattern versionPattern = Pattern.compile("^\\*\\*Version:\\*\\*\\s*(.+)$", Pattern.CASE_INSENSITIVE);
        Pattern statusPattern = Pattern.compile("^\\*\\*Status:\\*\\*\\s*(.+)$", Pattern.CASE_INSENSITIVE);
        Pattern lastUpdatedPattern = Pattern.compile("^\\*\\*Last Updated:\\*\\*\\s*(.+)$", Pattern.CASE_INSENSITIVE);
        Pattern categoryPattern = Pattern.compile("^\\*\\*Category:\\*\\*\\s*(.+)$", Pattern.CASE_INSENSITIVE);

        for (int i = 0; i < searchLimit; i++) {
            String line = lines[i].trim();

            Matcher versionMatcher = versionPattern.matcher(line);
            if (versionMatcher.matches()) {
                metadata.put("version", versionMatcher.group(1).trim());
            }

            Matcher statusMatcher = statusPattern.matcher(line);
            if (statusMatcher.matches()) {
                metadata.put("status", statusMatcher.group(1).trim());
            }

            Matcher lastUpdatedMatcher = lastUpdatedPattern.matcher(line);
            if (lastUpdatedMatcher.matches()) {
                metadata.put("lastUpdated", lastUpdatedMatcher.group(1).trim());
            }

            Matcher categoryMatcher = categoryPattern.matcher(line);
            if (categoryMatcher.matches()) {
                metadata.put("category", categoryMatcher.group(1).trim());
            }
        }

        return new DocMetadata(
            metadata.get("version"),
            metadata.get("status"),
            metadata.get("lastUpdated"),
            metadata.get("category")
        );
    }
}
