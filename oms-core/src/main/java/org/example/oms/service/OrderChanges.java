package org.example.oms.service;

import java.util.LinkedHashSet;
import java.util.Set;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * The field-level difference between two states of an order (SPEC-0049), as recorded in an event's
 * {@code changes}: {@code {"<field>": {"from": old, "to": new}}} for each top-level field whose value
 * differs. Field names and values are as in the order's JSON snapshot.
 *
 * <ul>
 *   <li>Numbers compare by value, so {@code 100} equals {@code 100.0000}.</li>
 *   <li>Objects and arrays compare whole.</li>
 *   <li>A missing field equals {@code null}.</li>
 *   <li>Without a previous state (a new order), every non-null field is listed with {@code from}
 *       null.</li>
 * </ul>
 */
public final class OrderChanges {

    private OrderChanges() {}

    public static ObjectNode diff(JsonNode before, JsonNode after) {
        ObjectNode changes = JsonNodeFactory.instance.objectNode();
        Set<String> fields = new LinkedHashSet<>();
        if (before != null) {
            before.propertyNames().forEach(fields::add);
        }
        if (after != null) {
            after.propertyNames().forEach(fields::add);
        }
        for (String field : fields) {
            JsonNode from = valueOf(before, field);
            JsonNode to = valueOf(after, field);
            if (!same(from, to)) {
                ObjectNode change = changes.putObject(field);
                change.set("from", from);
                change.set("to", to);
            }
        }
        return changes;
    }

    private static JsonNode valueOf(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isMissingNode() ? JsonNodeFactory.instance.nullNode() : value;
    }

    /** Equal values: numbers by value, everything else by JSON equality. */
    static boolean same(JsonNode a, JsonNode b) {
        if (a.isNumber() && b.isNumber()) {
            return a.decimalValue().compareTo(b.decimalValue()) == 0;
        }
        return a.equals(b);
    }
}
