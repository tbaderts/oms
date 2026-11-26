package org.example.price.util;

import java.util.ArrayList;
import java.util.List;

/**
 * A minimal RFC 4180 line splitter and joiner (SPEC-0079): quoted fields may hold commas, and a
 * doubled quote inside them is one quote. One line at a time; fields never span lines in the
 * formats this service reads (the instrument list, end-of-day files, LISTING_STATUS).
 */
public final class Csv {

    private Csv() {}

    /** The fields of one line, empty ones included; a trailing carriage return is ignored. */
    public static List<String> split(String line) {
        String text = line.endsWith("\r") ? line.substring(0, line.length() - 1) : line;
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else if (c == '"') {
                    quoted = false;
                } else {
                    field.append(c);
                }
            } else if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                fields.add(field.toString());
                field.setLength(0);
            } else {
                field.append(c);
            }
        }
        fields.add(field.toString());
        return fields;
    }

    /** One line from fields, quoting those with a comma, a quote or a line break; null is empty. */
    public static String join(String... fields) {
        StringBuilder line = new StringBuilder();
        for (int i = 0; i < fields.length; i++) {
            if (i > 0) {
                line.append(',');
            }
            String field = fields[i] == null ? "" : fields[i];
            if (field.contains(",") || field.contains("\"") || field.contains("\n") || field.contains("\r")) {
                line.append('"').append(field.replace("\"", "\"\"")).append('"');
            } else {
                line.append(field);
            }
        }
        return line.toString();
    }
}
