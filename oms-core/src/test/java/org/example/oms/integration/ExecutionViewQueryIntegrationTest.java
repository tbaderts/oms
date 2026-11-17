package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

/**
 * SPEC-0020 AC-5: GET /api/query/executions serves the order-execution projection, filtered by order,
 * root order, account and transactTime range, oldest first.
 *
 * <p>The fills use transactTimes in 2001 and accounts unique to the run, so the filters cannot match
 * fills other tests leave in the shared database.
 */
class ExecutionViewQueryIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Test
    void filtersByOrderRootAccountAndTime() throws Exception {
        String run = UUID.randomUUID().toString().substring(0, 8);
        String accountA = "ACC-QA-" + run;
        String accountB = "ACC-QB-" + run;
        String rootId = "ROOT-Q-" + run;
        String orderA = createLiveOrder(null, accountA);
        String orderB = createLiveOrder(rootId, accountB);
        String a1 = orderA + "-1";
        String b1 = orderB + "-1";
        String a2 = orderA + "-2";
        assertEquals(201, postFill(a1, orderA, "10", "2001-01-01T10:00:00Z"));
        assertEquals(201, postFill(b1, orderB, "20", "2001-01-01T11:00:00Z"));
        assertEquals(201, postFill(a2, orderA, "30", "2001-01-01T12:00:00Z"));

        assertEquals(List.of(a1, a2), execIds(query("orderId=" + orderA)), "by orderId, oldest first");
        assertEquals(List.of(b1), execIds(query("rootOrderId=" + rootId)), "by rootOrderId");
        assertEquals(List.of(a1, a2), execIds(query("rootOrderId=" + orderA)), "a root-less order is its own root");
        assertEquals(List.of(b1), execIds(query("account=" + accountB)), "by account");
        assertEquals(List.of(b1), execIds(query(
                "transactTimeFrom=2001-01-01T10:30:00Z&transactTimeTo=2001-01-01T12:00:00Z")),
                "by time, from inclusive, to exclusive");
        assertEquals(List.of(a1, b1), execIds(query(
                "transactTimeFrom=2001-01-01T10:00:00Z&transactTimeTo=2001-01-01T12:00:00Z")),
                "from is inclusive");

        query("orderId=" + orderA)
                .andExpect(jsonPath("$[0].orderId").value(orderA))
                .andExpect(jsonPath("$[0].account").value(accountA))
                .andExpect(jsonPath("$[0].side").value("BUY"))
                .andExpect(jsonPath("$[0].symbol").value("AAPL"))
                .andExpect(jsonPath("$[0].orderQty").value(100.0))
                .andExpect(jsonPath("$[0].price").value(170.0))
                .andExpect(jsonPath("$[0].lastQty").value(10.0))
                .andExpect(jsonPath("$[0].cumQty").value(10.0))
                .andExpect(jsonPath("$[0].leavesQty").value(90.0))
                .andExpect(jsonPath("$[0].state").value("LIVE"))
                .andExpect(jsonPath("$[0].orderVersion").value(3))
                .andExpect(jsonPath("$[0].tradeDate").value("2001-01-01"))
                .andExpect(jsonPath("$[1].cumQty").value(40.0))
                .andExpect(jsonPath("$[1].orderVersion").value(4));
    }

    /** SPEC-0067 AC-4: order=newest returns the newest fills first, and limit keeps the newest. */
    @Test
    void orderNewestReturnsNewestFirst() throws Exception {
        String account = "ACC-QN-" + UUID.randomUUID().toString().substring(0, 8);
        String orderA = createLiveOrder(null, account);
        String orderB = createLiveOrder(null, account);
        String a1 = orderA + "-1";
        String b1 = orderB + "-1";
        String a2 = orderA + "-2";
        assertEquals(201, postFill(a1, orderA, "10", "2002-01-01T10:00:00Z"));
        assertEquals(201, postFill(b1, orderB, "20", "2002-01-01T11:00:00Z"));
        assertEquals(201, postFill(a2, orderA, "30", "2002-01-01T12:00:00Z"));

        assertEquals(List.of(a2, b1, a1), execIds(query("account=" + account + "&order=newest")));
        assertEquals(List.of(a2, b1), execIds(query("account=" + account + "&order=newest&limit=2")),
                "limit keeps the newest");
    }

    /**
     * SPEC-0067 AC-4 (review): newest first also sorts a fill without transactTime by when it was
     * projected, and breaks a tie between equal times by storage order, the later one first.
     */
    @Test
    void orderNewestUsesProjectionTimeAndBreaksTiesByStorageOrder() throws Exception {
        String orderId = createLiveOrder();
        Instant now = Instant.now();
        String early = orderId + "-EARLY";
        String untimed = orderId + "-UNTIMED";
        String late = orderId + "-LATE";
        assertEquals(201, postFill(early, orderId, "10", now.minus(Duration.ofHours(1)).toString()));
        assertEquals(201, postFill(untimed, orderId, "10", null));
        assertEquals(201, postFill(late, orderId, "10", now.plus(Duration.ofHours(1)).toString()));
        assertEquals(List.of(late, untimed, early), execIds(query("orderId=" + orderId + "&order=newest")));

        String tiedOrder = createLiveOrder();
        String first = tiedOrder + "-FIRST";
        String second = tiedOrder + "-SECOND";
        assertEquals(201, postFill(first, tiedOrder, "10", "2004-01-01T10:00:00Z"));
        assertEquals(201, postFill(second, tiedOrder, "10", "2004-01-01T10:00:00Z"));
        assertEquals(List.of(second, first), execIds(query("orderId=" + tiedOrder + "&order=newest")));
        assertEquals(List.of(first, second), execIds(query("orderId=" + tiedOrder)), "oldest first keeps storage order");
    }

    /** SPEC-0067 AC-4: without order, or with order=oldest, the result is as before. */
    @Test
    void orderOldestIsTheDefault() throws Exception {
        String account = "ACC-QO-" + UUID.randomUUID().toString().substring(0, 8);
        String orderId = createLiveOrder(null, account);
        String f1 = orderId + "-1";
        String f2 = orderId + "-2";
        assertEquals(201, postFill(f1, orderId, "10", "2003-01-01T10:00:00Z"));
        assertEquals(201, postFill(f2, orderId, "10", "2003-01-01T11:00:00Z"));

        assertEquals(List.of(f1, f2), execIds(query("account=" + account)));
        assertEquals(List.of(f1, f2), execIds(query("account=" + account + "&order=oldest")));
        assertEquals(List.of(f1), execIds(query("account=" + account + "&limit=1")), "limit keeps the oldest");
    }

    /** SPEC-0067 AC-4: an unknown order value is a bad request. */
    @Test
    void unknownOrderIs400() throws Exception {
        mockMvc().perform(get("/api/query/executions?order=sideways"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("urn:oms:error:bad-request"));
    }

    /** A REST fill may omit transactTime; it sorts by when it was projected, not after every other fill. */
    @Test
    void fillWithoutTransactTime_sortsByProjectionTime() throws Exception {
        String orderId = createLiveOrder();
        Instant now = Instant.now();
        String early = orderId + "-EARLY";
        String untimed = orderId + "-UNTIMED";
        String late = orderId + "-LATE";
        assertEquals(201, postFill(early, orderId, "10", now.minus(Duration.ofHours(1)).toString()));
        assertEquals(201, postFill(untimed, orderId, "10", null));
        assertEquals(201, postFill(late, orderId, "10", now.plus(Duration.ofHours(1)).toString()));

        assertEquals(List.of(early, untimed, late), execIds(query("orderId=" + orderId)));
    }

    @Test
    void limitOutOfBounds_is400() throws Exception {
        mockMvc().perform(get("/api/query/executions?limit=0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("urn:oms:error:validation-failed"))
                .andExpect(jsonPath("$.errors.limit").exists());
        mockMvc().perform(get("/api/query/executions?limit=5001")).andExpect(status().isBadRequest());
    }

    @Test
    void noMatchReturnsEmptyArray() throws Exception {
        query("orderId=NO-SUCH-ORDER-" + UUID.randomUUID())
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    private ResultActions query(String parameters) throws Exception {
        return mockMvc().perform(get("/api/query/executions?" + parameters)).andExpect(status().isOk());
    }

    private static List<String> execIds(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$[*].execId");
    }
}
