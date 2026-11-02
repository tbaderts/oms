package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.msg.OrderCancelCmd;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.OrderReplayService;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor.ExecutionProcessingResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.transaction.support.TransactionTemplate;

import com.jayway.jsonpath.JsonPath;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0027: the order's version is the version of its latest event, on every command path, in the
 * query API and in replay; and two concurrent writers of one order cannot both win.
 */
class OrderVersionIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Autowired OrderEventRepository orderEventRepository;
    @Autowired OrderEventAppender orderEventAppender;
    @Autowired OrderReplayService orderReplayService;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
    @Autowired ExecutionCommandProcessor executionCommandProcessor;
    @Autowired OrderMapper orderMapper;
    @Autowired MeterRegistry meterRegistry;

    // AC-1, AC-6
    @Test
    void txNrIsTheLatestEventVersionAfterEveryCommand() throws Exception {
        String orderId = createOverRest();
        assertVersion(orderId, 1, "created over REST");

        send(orderId, new org.example.common.model.msg.OrderAcceptCmd(TestCommands.header(), orderId));
        awaitVersion(orderId, 2, "accepted over Kafka");

        assertEquals(201, postFill(orderId + "-F1", orderId, "10", null));
        assertVersion(orderId, 3, "filled over REST");

        send(orderId, fill(orderId + "-F2", orderId, "20"));
        awaitVersion(orderId, 4, "filled over Kafka");

        mockMvc().perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId + "\"}"))
                .andExpect(status().isOk());
        assertVersion(orderId, 5, "cancel requested over REST");

        send(orderId, new OrderCancelCmd(TestCommands.header(), orderId, null));
        awaitVersion(orderId, 6, "cancelled over Kafka");
        assertEquals(State.CXL, state(orderId));

        assertEquals(new TreeSet<>(List.of(1L, 2L, 3L, 4L, 5L, 6L)), publishedEventIds(orderId, 6),
                "the published eventIds are the order's versions");
        replayMatchesTheStoredOrderIncludingVersion(orderId);
    }

    // AC-3: two writers read the order at the same version; exactly one commits, the other fails as a
    // whole, and its retry applies on top. Each writer appends to the order's text, a read-modify-write
    // like a fill's quantities, under a non-fill event so the projection tests' rebuild of the shared
    // database does not look for an execution.
    @Test
    void concurrentWritersAppliedOnceThenRetried() throws Exception {
        String orderId = createLiveOrder();
        long before = txNr(orderId);
        CountDownLatch bothRead = new CountDownLatch(2);
        CountDownLatch firstCommitted = new CountDownLatch(1);

        CompletableFuture<Long> first = CompletableFuture.supplyAsync(() -> transactionTemplate.execute(status -> {
            Order order = read(orderId, bothRead);
            return change(order, "A");
        })).whenComplete((v, e) -> firstCommitted.countDown());
        CompletableFuture<Long> second = CompletableFuture.supplyAsync(() -> transactionTemplate.execute(status -> {
            Order order = read(orderId, bothRead);
            await(firstCommitted);
            return change(order, "B");
        }));

        assertEquals(before + 1, first.get(15, TimeUnit.SECONDS));
        Throwable lost = second.handle((v, e) -> e).get(15, TimeUnit.SECONDS);
        assertInstanceOf(OptimisticLockingFailureException.class, lost.getCause(), "the second writer conflicts");

        Order afterRace = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(before + 1, afterRace.getTxNr());
        assertEquals("A", afterRace.getText(), "only the winner applied");
        assertEquals(before + 1, events(orderId).size(), "the loser left no event");

        // Retried, the loser reads the new version and applies on top.
        long retried = transactionTemplate.execute(status -> {
            Order order = orderRepository.findByOrderId(orderId).orElseThrow();
            return change(order, "B");
        });
        assertEquals(before + 2, retried);
        assertEquals("AB", orderRepository.findByOrderId(orderId).orElseThrow().getText(), "both applied, once each");
        assertTrue(orderReplayService.isContiguous(orderId), "no gap and no duplicate version");
    }

    // AC-3 with two fills through the pipeline. Fill A has appended its event and holds its
    // transaction open; fill B waits on A's uncommitted event key and fails once A commits. B leaves
    // nothing, and its retry applies on top.
    @Test
    void concurrentFillsThroughThePipelineOneWaitsThenFails() throws Exception {
        String orderId = createLiveOrder();
        long before = txNr(orderId);
        CountDownLatch appended = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        CompletableFuture<Void> fillA = CompletableFuture.runAsync(() -> transactionTemplate.executeWithoutResult(status -> {
            assertTrue(fillThroughPipeline(orderId, orderId + "-A", "10").isSuccess());
            appended.countDown();
            await(release);
        }));
        await(appended);
        CompletableFuture<Throwable> fillB = CompletableFuture.supplyAsync(() -> {
            try {
                transactionTemplate.executeWithoutResult(status -> fillThroughPipeline(orderId, orderId + "-B", "20"));
                return null;
            } catch (RuntimeException e) {
                return e;
            }
        });

        Thread.sleep(1_000);
        assertFalse(fillB.isDone(), "fill B waits on fill A's uncommitted event");
        release.countDown();
        fillA.get(15, TimeUnit.SECONDS);
        Throwable failure = fillB.get(15, TimeUnit.SECONDS);
        assertInstanceOf(ConcurrencyFailureException.class, failure, "a conflict, not a refusal: " + failure);

        assertEquals(1, executionCount(orderId), "fill B left no execution");
        assertEquals(before + 1, events(orderId).size(), "fill B left no event");
        assertEquals(0, new BigDecimal("10").compareTo(orderRepository.findByOrderId(orderId).orElseThrow().getCumQty()));

        assertTrue(transactionTemplate.execute(status -> fillThroughPipeline(orderId, orderId + "-B", "20")).isSuccess(),
                "retried, fill B applies");
        Order after = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(0, new BigDecimal("30").compareTo(after.getCumQty()), "both fills, once each");
        assertEquals(before + 2, after.getTxNr());
        assertTrue(orderReplayService.isContiguous(orderId));
    }

    // AC-3 over Kafka: a fill that meets a concurrent writer's version is retried, not acknowledged.
    // The conflicting row is removed after the first failed attempt; a retry then applies the fill.
    @Test
    void kafkaFillRetriedAfterAConflict() throws Exception {
        String orderId = createLiveOrder();
        long next = txNr(orderId) + 1;
        jdbcTemplate.update(
                "insert into order_events (id, order_id, version, event, resulting_state, time_stamp) "
                        + "values (nextval('order_event_seq'), ?, ?, 'ACK', 'LIVE', now())",
                orderId, next);
        double failedBefore = failedFills();

        send(orderId, fill(orderId + "-K", orderId, "10"));
        try {
            awaitUntil(() -> failedFills() > failedBefore, "the first attempt failed as a conflict");
            assertEquals(0, executionCount(orderId), "nothing applied while the conflict lasts");
        } finally {
            jdbcTemplate.update("delete from order_events where order_id = ? and version = ?", orderId, next);
        }

        awaitUntil(() -> executionCount(orderId) == 1, "the retry applied the fill");
        assertEquals(next, txNr(orderId), "the fill took the version the conflict had blocked");
    }

    // AC-3 through the fill pipeline: a concurrent writer already appended the next version. The
    // fill must fail as a concurrent modification (409, retried on Kafka), not be refused, and leave
    // nothing behind.
    @Test
    void fillConflictingWithAConcurrentWriterIsRethrownNotRefused() throws Exception {
        String orderId = createLiveOrder();
        long next = txNr(orderId) + 1;
        jdbcTemplate.update(
                "insert into order_events (id, order_id, version, event, resulting_state, time_stamp) "
                        + "values (nextval('order_event_seq'), ?, ?, 'ACK', 'LIVE', now())",
                orderId, next);

        try {
            var response = mockMvc().perform(post("/api/command/execute")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"execution\":{"
                                    + "\"execId\":\"" + orderId + "-RACE\",\"orderId\":\"" + orderId + "\","
                                    + "\"lastQty\":10,\"lastPx\":170,\"execType\":\"F\",\"lastMkt\":\"XSIM\"}}"))
                    .andReturn().getResponse();

            assertEquals(409, response.getStatus(), response.getContentAsString());
            assertTrue(response.getContentAsString().contains("concurrent-modification"), response.getContentAsString());
            assertEquals(0, executionCount(orderId), "the fill rolled back");
            assertEquals(next - 1, txNr(orderId), "the order is unchanged");
        } finally {
            // The planted event has no snapshot; other tests in this context read the whole log.
            jdbcTemplate.update("delete from order_events where order_id = ? and version = ?", orderId, next);
        }
    }

    // AC-5
    @Test
    void queryApiReportsTxNrEqualToEventVersion() throws Exception {
        String orderId = createLiveOrder();
        assertEquals(201, postFill(orderId + "-F1", orderId, "10", null));

        String body = mockMvc().perform(get("/api/query/search").param("orderId", orderId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].eventVersion").value(3))
                .andReturn().getResponse().getContentAsString();
        assertEquals(3, ((Number) JsonPath.read(body, "$.content[0].txNr")).intValue(), "txNr is the event version");
    }

    // ----------------------------------------------------------------------------------------

    private void replayMatchesTheStoredOrderIncludingVersion(String orderId) {
        Order stored = orderRepository.findByOrderId(orderId).orElseThrow();
        Order replayed = orderReplayService.replay(orderId).orElseThrow();
        assertEquals(stored.getTxNr(), replayed.getTxNr());
        assertEquals(stored.getState(), replayed.getState());
        assertEquals(stored.getCancelState(), replayed.getCancelState());
        assertEquals(0, stored.getCumQty().compareTo(replayed.getCumQty()));
        assertEquals(0, stored.getLeavesQty().compareTo(replayed.getLeavesQty()));
    }

    private String createOverRest() throws Exception {
        String body = "{\"type\":\"OrderCreateCmd\",\"version\":\"3.1.0\",\"order\":{\"sessionId\":\"SES-VER\","
                + "\"clOrdId\":\"CL-" + UUID.randomUUID() + "\",\"account\":\"ACC-VER\",\"symbol\":\"AAPL\","
                + "\"side\":\"BUY\",\"ordType\":\"LIMIT\",\"timeInForce\":\"DAY\",\"price\":170,\"orderQty\":100}}";
        var response = mockMvc().perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
        assertEquals(201, response.getStatus(), response.getContentAsString());
        return JsonPath.read(response.getContentAsString(), "$.id");
    }

    /** A fill through the real pipeline, as the REST controller and the Kafka listener call it. */
    private ExecutionProcessingResult fillThroughPipeline(String orderId, String execId, String qty) {
        ExecutionCreateCmd command = new ExecutionCreateCmd()
                .type("ExecutionCreateCmd")
                .execution(new org.example.common.model.cmd.Execution()
                        .execId(execId)
                        .orderId(orderId)
                        .lastQty(new BigDecimal(qty))
                        .lastPx(new BigDecimal("170"))
                        .execType("F")
                        .lastMkt("XSIM"));
        return executionCommandProcessor.process(orderMapper.toExecution(command.getExecution()), command);
    }

    private double failedFills() {
        var counter = meterRegistry.find("oms.commands.consumed")
                .tag("type", "ExecutionCreateCmd").tag("outcome", "failed").counter();
        return counter == null ? 0 : counter.count();
    }

    /** As UpdateOrderTask does: a changed copy saved over the row, then the event appended. */
    private long change(Order read, String marker) {
        String text = read.getText() == null ? marker : read.getText() + marker;
        Order changed = orderRepository.save(read.toBuilder().text(text).build());
        return orderEventAppender.appendOrderEvent(changed, Event.CXL_REJ, null);
    }

    private Order read(String orderId, CountDownLatch bothRead) {
        Order order = orderRepository.findByOrderId(orderId).orElseThrow();
        bothRead.countDown();
        await(bothRead);
        return order;
    }

    private static void await(CountDownLatch latch) {
        try {
            assertTrue(latch.await(15, TimeUnit.SECONDS), "latch");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    private void assertVersion(String orderId, long expected, String after) {
        assertEquals(expected, txNr(orderId), "txNr " + after);
        assertEquals(expected, latestEventVersion(orderId), "latest event version " + after);
    }

    private void awaitVersion(String orderId, long expected, String after) throws InterruptedException {
        awaitUntil(() -> latestEventVersion(orderId) == expected, after);
        assertVersion(orderId, expected, after);
    }

    private long txNr(String orderId) {
        return orderRepository.findByOrderId(orderId).orElseThrow().getTxNr();
    }

    private long latestEventVersion(String orderId) {
        return events(orderId).stream().mapToLong(OrderEvent::getVersion).max().orElse(0);
    }

    private List<OrderEvent> events(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId);
    }

    private Set<Long> publishedEventIds(String orderId, int expected) {
        Properties fromStart = TestCommands.avroValues();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        Set<Long> ids = new TreeSet<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(List.of("orders"));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (ids.size() < expected && System.nanoTime() < deadline) {
                for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                    if (record.value() instanceof OrderMessage message && orderId.equals(message.getOrderId())) {
                        ids.add(message.getEventId());
                    }
                }
            }
        }
        return ids;
    }
}
