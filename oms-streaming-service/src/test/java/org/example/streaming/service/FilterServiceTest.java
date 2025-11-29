package org.example.streaming.service;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.function.Predicate;

import org.example.streaming.model.FilterCondition;
import org.example.streaming.model.FilterCondition.Operator;
import org.example.streaming.model.OrderDto;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for FilterService.
 * 
 * <p>Tests filter operators that match the OMS Query API format:
 * EQ, LIKE, GT, GTE, LT, LTE, BETWEEN
 */
class FilterServiceTest {

    private FilterService filterService;

    @BeforeEach
    void setUp() {
        filterService = new FilterService();
    }

    @Test
    void testNullFilterReturnsTrue() {
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(null);
        
        OrderEvent event = createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100));
        assertTrue(predicate.test(event));
    }

    @Test
    void testEmptyFilterReturnsTrue() {
        StreamFilter filter = StreamFilter.builder()
                .filters(List.of())
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        OrderEvent event = createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100));
        assertTrue(predicate.test(event));
    }

    @Test
    void testEqOperator() {
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.AND)
                .filters(List.of(
                        FilterCondition.builder()
                                .field("symbol")
                                .operator(Operator.EQ)
                                .value("AAPL")
                                .build()
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("MSFT", "BUY", "LIVE", BigDecimal.valueOf(100))));
    }

    @Test
    void testEqOperatorUsingHelper() {
        StreamFilter filter = StreamFilter.eq("symbol", "AAPL");
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("MSFT", "BUY", "LIVE", BigDecimal.valueOf(100))));
    }

    @Test
    void testLikeOperator() {
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.AND)
                .filters(List.of(
                        FilterCondition.builder()
                                .field("symbol")
                                .operator(Operator.LIKE)
                                .value("AP")
                                .build()
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("MSFT", "BUY", "LIVE", BigDecimal.valueOf(100))));
    }

    @Test
    void testGtOperator() {
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.AND)
                .filters(List.of(
                        FilterCondition.builder()
                                .field("orderQty")
                                .operator(Operator.GT)
                                .value("50")
                                .build()
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(50))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(25))));
    }

    @Test
    void testGteOperator() {
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.AND)
                .filters(List.of(
                        FilterCondition.builder()
                                .field("orderQty")
                                .operator(Operator.GTE)
                                .value("50")
                                .build()
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(50))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(25))));
    }

    @Test
    void testLtOperator() {
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.AND)
                .filters(List.of(
                        FilterCondition.builder()
                                .field("orderQty")
                                .operator(Operator.LT)
                                .value("100")
                                .build()
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(50))));
    }

    @Test
    void testLteOperator() {
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.AND)
                .filters(List.of(
                        FilterCondition.builder()
                                .field("orderQty")
                                .operator(Operator.LTE)
                                .value("100")
                                .build()
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(50))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(150))));
    }

    @Test
    void testBetweenOperator() {
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.AND)
                .filters(List.of(
                        FilterCondition.builder()
                                .field("orderQty")
                                .operator(Operator.BETWEEN)
                                .value("50")
                                .value2("150")
                                .build()
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(50))));
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(150))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(25))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(200))));
    }

    @Test
    void testAndLogicalOperator() {
        StreamFilter filter = StreamFilter.and(
                FilterCondition.eq("symbol", "AAPL"),
                FilterCondition.eq("side", "BUY")
        );
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "SELL", "LIVE", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("MSFT", "BUY", "LIVE", BigDecimal.valueOf(100))));
    }

    @Test
    void testOrLogicalOperator() {
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.OR)
                .filters(List.of(
                        FilterCondition.eq("symbol", "AAPL"),
                        FilterCondition.eq("symbol", "MSFT")
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertTrue(predicate.test(createOrderEvent("MSFT", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("GOOGL", "BUY", "LIVE", BigDecimal.valueOf(100))));
    }

    @Test
    void testMultipleFiltersWithDifferentOperators() {
        StreamFilter filter = StreamFilter.and(
                FilterCondition.eq("symbol", "AAPL"),
                FilterCondition.builder()
                        .field("orderQty")
                        .operator(Operator.GTE)
                        .value("100")
                        .build(),
                FilterCondition.builder()
                        .field("state")
                        .operator(Operator.EQ)
                        .value("LIVE")
                        .build()
        );
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        assertTrue(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "LIVE", BigDecimal.valueOf(50))));
        assertFalse(predicate.test(createOrderEvent("AAPL", "BUY", "FILLED", BigDecimal.valueOf(100))));
        assertFalse(predicate.test(createOrderEvent("MSFT", "BUY", "LIVE", BigDecimal.valueOf(100))));
    }

    @Test
    void testFilterWithDateTimeField() {
        Instant now = Instant.now();
        Instant oneHourAgo = now.minusSeconds(3600);
        Instant twoHoursAgo = now.minusSeconds(7200);
        
        StreamFilter filter = StreamFilter.builder()
                .logicalOperator(StreamFilter.LogicalOperator.AND)
                .filters(List.of(
                        FilterCondition.builder()
                                .field("sendingTime")
                                .operator(Operator.GTE)
                                .value(oneHourAgo.toString())
                                .build()
                ))
                .build();
        
        Predicate<OrderEvent> predicate = filterService.createOrderEventPredicate(filter);
        
        // Event with sendingTime = now should match
        OrderEvent recentEvent = createOrderEventWithTime("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100), now);
        assertTrue(predicate.test(recentEvent));
        
        // Event with sendingTime = 2 hours ago should NOT match
        OrderEvent oldEvent = createOrderEventWithTime("AAPL", "BUY", "LIVE", BigDecimal.valueOf(100), twoHoursAgo);
        assertFalse(predicate.test(oldEvent));
    }

    @Test
    void testToQueryParams() {
        StreamFilter filter = StreamFilter.and(
                FilterCondition.eq("symbol", "AAPL"),
                FilterCondition.builder()
                        .field("price")
                        .operator(Operator.BETWEEN)
                        .value("100")
                        .value2("200")
                        .build()
        );
        
        var queryParams = filter.toQueryParams();
        
        assertEquals("AAPL", queryParams.get("symbol"));
        assertEquals("100,200", queryParams.get("price__between"));
    }

    private OrderEvent createOrderEvent(String symbol, String side, String state, BigDecimal orderQty) {
        return createOrderEventWithTime(symbol, side, state, orderQty, Instant.now());
    }

    private OrderEvent createOrderEventWithTime(String symbol, String side, String state, 
            BigDecimal orderQty, Instant sendingTime) {
        OrderDto order = OrderDto.builder()
                .orderId("ORD-001")
                .symbol(symbol)
                .side(side)
                .state(state)
                .orderQty(orderQty)
                .sendingTime(sendingTime)
                .build();
        
        return OrderEvent.builder()
                .eventType("CREATE")
                .orderId(order.getOrderId())
                .order(order)
                .build();
    }
}
