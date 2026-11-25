package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.SecurityIdSource;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.OrderAcceptCmd;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0070: the execution search over stored fills — filters, paging and sorting like the order
 * search, and entries with the execution's own fields. Each test scopes its fills by a fresh root
 * order id, since the database is shared with other tests.
 */
class ExecutionSearchIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SEARCH = "/api/query/executions/search";

    @Autowired JdbcTemplate jdbc;

    /** AC-1 */
    @Test
    void filtersByOrderId() throws Exception {
        String root = root();
        String a = liveOrder(root, "AAPL", null);
        String b = liveOrder(root, "AAPL", null);
        fill(a, "A1", "10", "170", "2026-11-24T09:00:00Z");
        fill(a, "A2", "10", "171", "2026-11-24T09:01:00Z");
        fill(b, "B1", "10", "172", "2026-11-24T09:02:00Z");

        JsonNode page = search("?orderId=" + a);

        assertEquals(List.of(a + "-A2", a + "-A1"), execIds(page));
        assertEquals(2, page.get("page").get("totalElements").asInt());
    }

    /** AC-2 */
    @Test
    void filtersBySymbolLikeQuantityTimeAndStatus() throws Exception {
        String root = root();
        String aapl = liveOrder(root, "AAPL", null);
        String msft = liveOrder(root, "MSFT", null);
        fill(aapl, "1", "10", "170", "2026-11-24T09:00:00Z");
        fill(aapl, "2", "30", "170", "2026-11-24T10:00:00Z");
        fill(msft, "3", "40", "420", "2026-11-24T11:00:00Z");
        jdbc.update("update executions set status = 'BUSTED' where order_id = ? and execid = ?", aapl, aapl + "-2");
        String scope = "?rootOrderId=" + root;

        // The blotter sends a like value as %text% (OMSApiService.like), encoded once by the browser.
        MockHttpServletResponse like = mockMvc().perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get(SEARCH).param("rootOrderId", root).param("symbol__like", "%aa%"))
                .andReturn().getResponse();
        assertEquals(List.of(aapl + "-2", aapl + "-1"), execIds(JSON.readTree(like.getContentAsString())));
        assertEquals(List.of(msft + "-3", aapl + "-2"), execIds(search(scope + "&lastQty__gte=30")));
        assertEquals(List.of(msft + "-3", aapl + "-2"),
                execIds(search(scope + "&transactTime__between=2026-11-24T09:30:00Z,2026-11-24T11:00:00Z")));
        assertEquals(List.of(aapl + "-2"), execIds(search(scope + "&status=BUSTED")));
        assertEquals(List.of(aapl + "-1"),
                execIds(search(scope + "&symbol=AAPL&lastQty__lt=30&status=APPLIED&transactTime__lt=2026-11-24T09:30:00Z")));
        assertEquals(List.of(), execIds(search(scope + "&status=NOT_A_STATUS")), "an unknown status matches nothing");
    }

    /** AC-3 */
    @Test
    void pagesNewestFirstAndSorts() throws Exception {
        String root = root();
        String orderId = liveOrder(root, "AAPL", null);
        String[] prices = {"173", "171", "177", "170", "175", "172", "176"};
        for (int i = 0; i < prices.length; i++) {
            fill(orderId, "P" + i, "10", prices[i], null);
        }
        String scope = "?rootOrderId=" + root;

        JsonNode first = search(scope + "&size=3");
        assertEquals(List.of(orderId + "-P6", orderId + "-P5", orderId + "-P4"), execIds(first), "newest stored first");
        assertEquals(7, first.get("page").get("totalElements").asInt());
        assertEquals(3, first.get("page").get("totalPages").asInt());
        assertEquals(List.of(orderId + "-P0"), execIds(search(scope + "&size=3&page=2")), "the oldest on the last page");

        List<String> byPrice = new ArrayList<>();
        search(scope + "&sort=lastPx,ASC").get("content").forEach(e -> byPrice.add(e.get("lastPx").asString()));
        assertEquals(List.of("170", "171", "172", "173", "175", "176", "177"),
                byPrice.stream().map(p -> new BigDecimal(p).stripTrailingZeros().toPlainString()).toList());
    }

    /** AC-4 */
    @Test
    void rejectsOversizedPageAndUnknownSort() throws Exception {
        assertEquals(400, get(SEARCH + "?size=501").getStatus());
        MockHttpServletResponse badSort = get(SEARCH + "?sort=price,ASC");
        assertEquals(400, badSort.getStatus());
        assertTrue(badSort.getContentAsString().contains("price"), badSort.getContentAsString());

        String root = root();
        String orderId = liveOrder(root, "AAPL", null);
        fill(orderId, "U1", "10", "170", null);
        MockHttpServletResponse unknownFilter = get(SEARCH + "?rootOrderId=" + root + "&notAField=x");
        assertEquals(200, unknownFilter.getStatus());
        assertEquals(List.of(orderId + "-U1"), execIds(JSON.readTree(unknownFilter.getContentAsString())),
                "an unknown filter is ignored");
    }

    /** AC-5 */
    @Test
    void entryCarriesExecutionFieldsOnly() throws Exception {
        String root = root();
        String orderId = liveOrder(root, "MSFT", "US5949181045");
        assertEquals(201, postFill(orderId + "-F1", orderId, "25", "2026-11-24T09:15:00Z", "420.5",
                "\"symbol\":\"MSFT\",\"securityId\":\"US5949181045\",\"securityIdSource\":\"ISIN\","));

        JsonNode entry = search("?orderId=" + orderId).get("content").get(0);

        assertEquals(orderId + "-F1", entry.get("execId").asString());
        assertEquals(orderId, entry.get("orderId").asString());
        assertEquals(root, entry.get("rootOrderId").asString());
        assertEquals("MSFT", entry.get("symbol").asString());
        assertEquals("US5949181045", entry.get("securityId").asString());
        assertEquals("ISIN", entry.get("securityIdSource").asString());
        assertEquals("F", entry.get("execType").asString());
        assertEquals("XSIM", entry.get("lastMkt").asString());
        assertEquals(0, new BigDecimal("25").compareTo(entry.get("lastQty").decimalValue()));
        assertEquals(0, new BigDecimal("420.5").compareTo(entry.get("lastPx").decimalValue()));
        assertEquals(0, new BigDecimal("25").compareTo(entry.get("cumQty").decimalValue()));
        assertEquals(0, new BigDecimal("75").compareTo(entry.get("leavesQty").decimalValue()));
        assertEquals(0, new BigDecimal("420.5").compareTo(entry.get("avgPx").decimalValue()));
        assertEquals(Instant.parse("2026-11-24T09:15:00Z"), Instant.parse(entry.get("transactTime").asString()));
        assertEquals("APPLIED", entry.get("status").asString());
        assertTrue(entry.get("orderVersion").asLong() > 0);
        for (String orderField : List.of("side", "price", "orderQty", "account", "state")) {
            assertFalse(entry.has(orderField), orderField + " is the order's: " + entry);
        }
    }

    /** AC-7: the hidden, uncontracted read of executions is gone; the search replaces it. */
    @Test
    void retiredEndpointIsGone() throws Exception {
        assertEquals(404, get("/api/executions").getStatus());
        assertEquals(404, get("/api/executions/1").getStatus());
    }

    private static String root() {
        return "ROOT-" + UUID.randomUUID();
    }

    /** A LIVE limit order for 100 under {@code root}. */
    private String liveOrder(String root, String symbol, String isin) throws Exception {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-SEARCH")
                .account("ACC-SEARCH")
                .symbol(symbol)
                .securityId(isin)
                .securityIdSource(isin != null ? SecurityIdSource.ISIN : null)
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .price(new BigDecimal("500"))
                .orderQty(new BigDecimal("100"))
                .timeInForce(TimeInForce.DAY)
                .rootOrderId(root)
                .parentOrderId(root);
        var result = orderCreateCommandProcessor.process(
                new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        String orderId = result.getOrderId();
        send(orderId, new OrderAcceptCmd(TestCommands.header(), orderId));
        awaitUntil(() -> state(orderId) == org.example.common.model.State.LIVE, orderId + " LIVE");
        return orderId;
    }

    private void fill(String orderId, String suffix, String qty, String px, String transactTime) throws Exception {
        String symbol = orderRepository.findByOrderId(orderId).orElseThrow().getSymbol();
        assertEquals(201, postFill(orderId + "-" + suffix, orderId, qty, transactTime, px,
                "\"symbol\":\"" + symbol + "\","));
    }

    private JsonNode search(String query) throws Exception {
        MockHttpServletResponse response = get(SEARCH + query);
        assertEquals(200, response.getStatus(), response.getContentAsString());
        return JSON.readTree(response.getContentAsString());
    }

    private MockHttpServletResponse get(String uri) throws Exception {
        return mockMvc().perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(uri))
                .andReturn().getResponse();
    }

    private static List<String> execIds(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.get("content").forEach(e -> ids.add(e.get("execId").asString()));
        return ids;
    }
}
