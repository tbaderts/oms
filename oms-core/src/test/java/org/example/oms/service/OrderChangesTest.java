package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** SPEC-0049 AC-3 and AC-4: an event's {@code changes} lists exactly the fields that changed. */
class OrderChangesTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void listsOnlyChangedFieldsWithOldAndNewValues() {
        JsonNode before = json("{\"orderId\":\"O1\",\"state\":\"LIVE\",\"cumQty\":0,\"leavesQty\":100,\"avgPx\":null,\"txNr\":2,\"symbol\":\"AAPL\"}");
        JsonNode after = json("{\"orderId\":\"O1\",\"state\":\"PARTIALLY_FILLED\",\"cumQty\":40,\"leavesQty\":60,\"avgPx\":170,\"txNr\":3,\"symbol\":\"AAPL\"}");

        JsonNode changes = OrderChanges.diff(before, after);

        assertEquals(new TreeSet<>(List.of("state", "cumQty", "leavesQty", "avgPx", "txNr")), names(changes));
        assertEquals("LIVE", changes.get("state").get("from").asString());
        assertEquals("PARTIALLY_FILLED", changes.get("state").get("to").asString());
        assertEquals(0, changes.get("cumQty").get("from").asInt());
        assertEquals(40, changes.get("cumQty").get("to").asInt());
        assertTrue(changes.get("avgPx").get("from").isNull(), "null before");
    }

    @Test
    void numbersCompareByValue() {
        JsonNode changes = OrderChanges.diff(json("{\"price\":100,\"qty\":1.5}"), json("{\"price\":100.0000,\"qty\":1.50}"));

        assertTrue(names(changes).isEmpty(), "100 equals 100.0000: " + changes);
    }

    @Test
    void aMissingFieldEqualsNull() {
        JsonNode changes = OrderChanges.diff(json("{\"a\":null}"), json("{\"b\":null}"));

        assertTrue(names(changes).isEmpty(), changes.toString());
    }

    @Test
    void nestedValuesCompareWhole() {
        JsonNode changes = OrderChanges.diff(json("{\"leg\":{\"x\":1,\"y\":2}}"), json("{\"leg\":{\"x\":1,\"y\":3}}"));

        assertEquals(new TreeSet<>(List.of("leg")), names(changes));
        assertEquals(3, changes.get("leg").get("to").get("y").asInt());
    }

    /** AC-4: a first event lists every field set at creation, each from null. */
    @Test
    void withoutABeforeEveryFieldSetIsListedFromNull() {
        JsonNode changes = OrderChanges.diff(null, json("{\"orderId\":\"O1\",\"state\":\"NEW\",\"price\":null,\"txNr\":1}"));

        assertEquals(new TreeSet<>(List.of("orderId", "state", "txNr")), names(changes), "unset fields are not listed");
        assertTrue(changes.get("orderId").get("from").isNull());
        assertEquals("O1", changes.get("orderId").get("to").asString());
    }

    /** AC-4: a command that changes nothing but the version records only txNr. */
    @Test
    void onlyTheVersionChanged() {
        JsonNode changes = OrderChanges.diff(json("{\"orderId\":\"O1\",\"state\":\"LIVE\",\"txNr\":4}"),
                json("{\"orderId\":\"O1\",\"state\":\"LIVE\",\"txNr\":5}"));

        assertEquals(new TreeSet<>(List.of("txNr")), names(changes));
    }

    private static JsonNode json(String text) {
        return JSON.readTree(text);
    }

    private static TreeSet<String> names(JsonNode node) {
        TreeSet<String> names = new TreeSet<>();
        node.propertyNames().forEach(names::add);
        return names;
    }
}
