package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.example.oms.service.ExecutionSpecifications.Filter;
import org.example.oms.service.ExecutionSpecifications.Kind;
import org.junit.jupiter.api.Test;

/** SPEC-0070 AC-2: the execution search reads filters in the order search's language. */
class ExecutionSpecificationsTest {

    @Test
    void readsFieldOperatorAndKind() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("orderId", "ORD-1");
        params.put("symbol__like", "%AA%");
        params.put("lastQty__gte", "10");
        params.put("transactTime__between", "2026-11-24T09:00:00Z,2026-11-24T10:00:00Z");
        params.put("status", "BUSTED");
        params.put("securityIdSource", "ISIN");
        params.put("orderVersion__lt", "5");

        assertEquals(
                List.of(
                        new Filter("orderId", "eq", "ORD-1", Kind.STRING),
                        new Filter("symbol", "like", "%AA%", Kind.STRING),
                        new Filter("lastQty", "gte", "10", Kind.NUMBER),
                        new Filter("transactTime", "between", "2026-11-24T09:00:00Z,2026-11-24T10:00:00Z", Kind.TIME),
                        new Filter("status", "eq", "BUSTED", Kind.ENUM),
                        new Filter("securityIdSource", "eq", "ISIN", Kind.ENUM),
                        new Filter("orderVersion", "lt", "5", Kind.NUMBER)),
                ExecutionSpecifications.parse(params));
    }

    @Test
    void ignoresUnknownFieldsAndBlankValues() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("side", "BUY"); // an order field, not an execution's
        params.put("nonsense__gt", "1");
        params.put("execId", " ");
        params.put("lastMkt", "XNAS");

        assertEquals(List.of(new Filter("lastMkt", "eq", "XNAS", Kind.STRING)), ExecutionSpecifications.parse(params));
    }

    @Test
    void knowsEveryResponseField() {
        assertEquals(
                List.of("execId", "orderId", "rootOrderId", "symbol", "securityId", "execType", "lastMkt",
                        "lastCapacity", "lastQty", "lastPx", "cumQty", "leavesQty", "avgPx", "orderVersion",
                        "transactTime", "status", "securityIdSource"),
                List.copyOf(ExecutionSpecifications.FILTERABLE.keySet()));
    }

    /** A user sort on a field with ties still pages stably: the newest stored fill breaks ties. */
    @Test
    void userSortEndsWithIdAsTieBreaker() {
        assertEquals(
                org.springframework.data.domain.Sort.by(
                        org.springframework.data.domain.Sort.Order.asc("lastPx"),
                        org.springframework.data.domain.Sort.Order.desc("id")),
                ExecutionQueryService.sortOf("lastPx,ASC"));
        assertEquals(
                org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Order.desc("id")),
                ExecutionQueryService.sortOf(null));
    }
}
