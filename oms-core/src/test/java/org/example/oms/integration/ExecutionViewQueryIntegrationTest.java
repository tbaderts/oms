package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
