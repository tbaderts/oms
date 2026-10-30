package org.example.mcp.docs;

import java.util.Arrays;
import java.util.Map;
import java.util.regex.Pattern;

import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;
import org.yaml.snakeyaml.nodes.Tag;
import org.yaml.snakeyaml.representer.Representer;
import org.yaml.snakeyaml.resolver.Resolver;

/**
 * The YAML front matter of a knowledge base document (Open Knowledge Format).
 *
 * <p>The block runs from a first line {@code ---} to the next line {@code ---}. It is parsed with
 * SnakeYAML's {@link SafeConstructor}, so a document can never make the server instantiate
 * arbitrary types. A block that is not valid YAML or not a mapping is still recognised
 * ({@code present}), with {@code data} null and the parser message in {@code error}; the document
 * stays usable.
 *
 * @param present  whether the document starts with a closed {@code ---} block
 * @param data     the parsed mapping, or {@code null} when absent or unparseable
 * @param error    the parse error, or {@code null}
 * @param endLine  1-based line number of the closing {@code ---}, 0 when absent
 * @param blankedContent the document with the block's lines emptied, so line numbers still match the file
 */
public record FrontMatter(boolean present, Map<String, Object> data, String error, int endLine,
                          String blankedContent) {

    private static final String BOM = "﻿";
    private static final String DELIMITER = "---";

    public static FrontMatter parse(String content) {
        String text = content.startsWith(BOM) ? content.substring(1) : content;
        String[] lines = text.split("\n", -1);
        if (lines.length == 0 || !isDelimiter(lines[0])) {
            return new FrontMatter(false, null, null, 0, content);
        }
        int close = -1;
        for (int i = 1; i < lines.length; i++) {
            if (isDelimiter(lines[i])) {
                close = i;
                break;
            }
        }
        if (close < 0) {
            return new FrontMatter(false, null, null, 0, content);
        }

        String yaml = String.join("\n", Arrays.copyOfRange(lines, 1, close));
        Map<String, Object> data = null;
        String error = null;
        try {
            LoaderOptions options = new LoaderOptions();
            Object loaded = new Yaml(new SafeConstructor(options), new Representer(new DumperOptions()),
                    new DumperOptions(), options, new TextScalarResolver()).load(yaml);
            if (loaded instanceof Map<?, ?> map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> typed = (Map<String, Object>) map;
                data = typed;
            } else {
                error = "front matter is not a YAML mapping";
            }
        } catch (RuntimeException e) {
            error = e.getMessage();
        }

        String[] blanked = lines.clone();
        for (int i = 0; i <= close; i++) {
            blanked[i] = "";
        }
        return new FrontMatter(true, data, error, close + 1, String.join("\n", blanked));
    }

    private static boolean isDelimiter(String line) {
        return line.strip().equals(DELIMITER);
    }

    /** JSON-style booleans only: YAML 1.1's yes/no/on/off/y/n stay text. */
    private static final Pattern JSON_BOOL = Pattern.compile("^(?:true|True|TRUE|false|False|FALSE)$");

    /**
     * Resolves only booleans ({@code true}/{@code false}), nulls and merge keys implicitly; numbers
     * and timestamps stay text, so {@code version: 1.10} reads "1.10" and
     * {@code updated: 2026-02-14} reads "2026-02-14" — the value as written, as with the JSON schema
     * used by {@code tools/okf-check}.
     */
    private static final class TextScalarResolver extends Resolver {
        @Override
        protected void addImplicitResolvers() {
            addImplicitResolver(Tag.BOOL, JSON_BOOL, "tTfF", 10);
            addImplicitResolver(Tag.NULL, NULL, "~nN\0", 10);
            addImplicitResolver(Tag.NULL, EMPTY, null, 10);
            addImplicitResolver(Tag.MERGE, MERGE, "<", 10);
        }
    }
}
