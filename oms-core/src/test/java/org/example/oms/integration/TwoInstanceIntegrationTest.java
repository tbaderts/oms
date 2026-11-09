package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.State;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.model.CommandLogEntry;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.CommandLogRepository;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderReplayService;
import org.example.oms.service.command.CommandDispatch;
import org.example.oms.service.command.CommandDispatcher;
import org.example.oms.service.command.CommandOrigin;
import org.example.oms.service.endofday.EndOfDayScheduler;
import org.example.oms.service.leadership.Leadership;
import org.example.oms.service.leadership.Role;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.jayway.jsonpath.JsonPath;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0048: oms-core runs correctly as several instances on one database and one broker.
 *
 * <p>This class's context and a second instance share a world of their own (database, command topic
 * and consumer group). Tests about leadership changes start further instances in worlds of their
 * own, so the instance that is stopped is never this test's own context.
 */
class TwoInstanceIntegrationTest extends AbstractFillFlowIntegrationTest {

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("two", "commands-two");
        registry.add("spring.kafka.consumer.group-id", () -> "oms-two");
    }

    private static ConfigurableApplicationContext second;

    @Autowired Environment environment;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;
    @Autowired OrderReplayService orderReplayService;
    @Autowired org.example.oms.repository.OrderEventRepository orderEventRepository;
    @Autowired org.example.oms.mapper.OrderMessageMapper orderMessageMapper;
    @Autowired org.example.oms.mapper.ExecutionMessageMapper executionMessageMapper;
    @Autowired org.example.oms.mapper.AvroPayloadCodec payloadCodec;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @BeforeEach
    void startSecondInstance() {
        if (second == null) {
            second = SecondInstance.start(environment, Map.of());
        }
    }

    @AfterAll
    static void stopSecondInstance() {
        if (second != null) {
            second.close();
            second = null;
        }
    }

    /** AC-1: ten fills on one order at once all apply: they wait on the order's row lock, none fails. */
    @Test
    void tenConcurrentFillsAllApply() throws Exception {
        String orderId = createLiveOrder();
        ExecutorService pool = Executors.newFixedThreadPool(10);
        try {
            List<CompletableFuture<Integer>> fills = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                String execId = orderId + "-C" + i;
                fills.add(CompletableFuture.supplyAsync(() -> {
                    try {
                        return postFill(execId, orderId, "10", null);
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                }, pool));
            }
            for (CompletableFuture<Integer> fill : fills) {
                assertEquals(201, fill.get(30, TimeUnit.SECONDS), "every fill applies; none is a 409 conflict");
            }
        } finally {
            pool.shutdownNow();
        }

        var order = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(State.FILLED, order.getState());
        assertEquals(0, new BigDecimal("100").compareTo(order.getCumQty()));
        assertEquals(10, executionCount(orderId));
        assertTrue(orderReplayService.isContiguous(orderId), "versions contiguous: no conflict, no gap");
    }

    /**
     * AC-3: one relay leader at a time. The follower claims nothing, even for a message it staged
     * itself. When the leader stops, the other takes over and publishes within 10 seconds.
     */
    @Test
    void exactlyOneRelayLeaderAndTakeover() throws Exception {
        ConfigurableApplicationContext first = SecondInstance.startIsolated(environment, "takeover", Map.of());
        ConfigurableApplicationContext other = null;
        try {
            waitFor(() -> relayLeader(first), "the first instance leads its world", Duration.ofSeconds(10));
            other = SecondInstance.startIsolated(environment, "takeover", Map.of());
            ConfigurableApplicationContext follower = other;

            try (Consumer<Object, Object> orders = subscribed("orders")) {
                String publishedByLeader = create(follower);
                awaitPublished(orders, publishedByLeader, Duration.ofSeconds(10));
                Thread.sleep(1_000); // a few more polls and nudges: the follower must not have taken over
                assertTrue(relayLeader(first));
                assertFalse(relayLeader(follower), "exactly one relay leader");
                assertEquals(0.0, drains(follower), "the follower claimed nothing, not even the message it staged");
                assertTrue(drains(first) > 0, "the leader published it");

                first.close();
                long stopped = System.nanoTime();
                String stagedDuringTakeover = create(follower);
                waitFor(() -> relayLeader(follower), "the other instance takes over", Duration.ofSeconds(10));
                Duration left = Duration.ofSeconds(10).minusNanos(System.nanoTime() - stopped);
                awaitPublished(orders, stagedDuringTakeover, left);
            }
        } finally {
            first.close();
            if (other != null) {
                other.close();
            }
        }
    }

    /**
     * AC-6: of two instances with schedulers on, only the leader expires and closes orders, also when
     * both trigger end of day at the same moment. Each instance's own counters show who did the work.
     */
    @Test
    void schedulersRunOnTheLeaderOnly() throws Exception {
        Map<String, Object> schedulers = Map.of(
                "oms.end-of-day.enabled", "true",
                "oms.end-of-day.gtd-poll-interval-ms", "500");
        ConfigurableApplicationContext a = SecondInstance.startIsolated(environment, "sched", schedulers);
        ConfigurableApplicationContext b = SecondInstance.startIsolated(environment, "sched", schedulers);
        try {
            List<String> due = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                due.add(createGtd(a, Instant.now().minusSeconds(60)));
            }
            OrderRepository orders = a.getBean(OrderRepository.class);
            waitFor(() -> due.stream().allMatch(id -> orders.findByOrderId(id).orElseThrow().getState() == State.EXP),
                    "GTD expiry ran", Duration.ofSeconds(15));
            Thread.sleep(1_500); // further GTD polls on both instances: a follower must still do nothing

            CountDownLatch go = new CountDownLatch(1);
            CompletableFuture<Void> onA = CompletableFuture.runAsync(() -> invokeEndOfDay(a, go));
            CompletableFuture<Void> onB = CompletableFuture.runAsync(() -> invokeEndOfDay(b, go));
            go.countDown();
            CompletableFuture.allOf(onA, onB).get(30, TimeUnit.SECONDS);

            boolean aLeads = holdsScheduler(a);
            assertTrue(aLeads != holdsScheduler(b), "exactly one scheduler leader");
            ConfigurableApplicationContext leader = aLeads ? a : b;
            ConfigurableApplicationContext follower = aLeads ? b : a;
            assertTrue(endOfDayOrders(leader, "expire") >= 3, "the leader expired the due orders");
            assertTrue(endOfDayOrders(leader, "close") >= 3, "the leader closed them");
            assertEquals(0.0, endOfDayOrders(follower, "expire"), "the follower expired nothing");
            assertEquals(0.0, endOfDayOrders(follower, "close"), "the follower closed nothing");

            OrderEventRepository events = a.getBean(OrderEventRepository.class);
            CommandLogRepository log = a.getBean(CommandLogRepository.class);
            for (String orderId : due) {
                List<OrderEvent> history = events.findByOrderIdOrderByVersionAsc(orderId);
                assertEquals(1, history.stream().filter(e -> e.getEvent() == Event.EXP).count(), orderId);
                assertEquals(1, history.stream().filter(e -> e.getEvent() == Event.CLOSE).count(), orderId);
                List<CommandLogEntry> scheduled = log.findByOrderIdOrderByReceivedAtAscIdAsc(orderId).stream()
                        .filter(e -> e.getPrincipal() != null && e.getPrincipal().startsWith("oms-core:"))
                        .toList();
                assertEquals(List.of("OrderExpireCmd", "OrderCloseCmd"), scheduled.stream().map(CommandLogEntry::getType).toList(),
                        "one expiry and one close, each run by one instance only: " + scheduled);
            }
        } finally {
            a.close();
            b.close();
        }
    }

    /**
     * SPEC-0049 AC-7: of two instances with the event-log reconciler scheduled, only the scheduler
     * leader samples; the follower's sampled-orders counter stays 0.
     */
    @Test
    void reconcilerRunsOnTheLeaderOnly() throws Exception {
        Map<String, Object> reconciling = Map.of(
                "oms.reconciliation.enabled", "true",
                "oms.reconciliation.interval-ms", "300",
                "oms.reconciliation.initial-delay-ms", "0");
        ConfigurableApplicationContext a = SecondInstance.startIsolated(environment, "recon", reconciling);
        ConfigurableApplicationContext b = SecondInstance.startIsolated(environment, "recon", reconciling);
        try {
            create(a);
            create(b);
            waitFor(() -> sampled(a) + sampled(b) > 0, "the reconciler sampled on one instance", Duration.ofSeconds(15));
            Thread.sleep(1_500); // several more runs on both schedules

            boolean aLeads = holdsScheduler(a);
            assertTrue(aLeads != holdsScheduler(b), "exactly one scheduler leader");
            ConfigurableApplicationContext leader = aLeads ? a : b;
            ConfigurableApplicationContext follower = aLeads ? b : a;
            assertTrue(sampled(leader) > 0, "the leader reconciles");
            assertEquals(0.0, sampled(follower), "the follower samples nothing");
        } finally {
            a.close();
            b.close();
        }
    }

    private static double sampled(ConfigurableApplicationContext instance) {
        var counter = instance.getBean(MeterRegistry.class).find("oms.event_log.sampled").counter();
        return counter == null ? 0 : counter.count();
    }

    /**
     * AC-7: two instances take fills for the same orders at once: over Kafka (split between them by
     * partition) and directly on the other instance. Nothing is dead-lettered, every order adds up,
     * and each order's records reach each of the three outbound topics in version order.
     */
    @Test
    void contentionLeavesNothingDeadLettered() throws Exception {
        String hot = createLiveOrderOf("ACC-HOT", "1000");
        List<String> spread = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            spread.add(createLiveOrderOf("ACC-SPREAD", "50"));
        }
        CommandDispatcher otherInstance = second.getBean(CommandDispatcher.class);

        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<CompletableFuture<?>> work = new ArrayList<>();
            for (int i = 0; i < 50; i++) {
                send(hot, fill(hot + "-K" + i, hot, "10"));
                String execId = hot + "-D" + i;
                work.add(CompletableFuture.runAsync(() -> {
                    CommandDispatch outcome = otherInstance.dispatch(fillCommand(hot, execId), CommandOrigin.rest(Instant.now()));
                    assertTrue(outcome instanceof CommandDispatch.Applied, "applied on the other instance: " + outcome);
                }, pool));
            }
            for (String orderId : spread) {
                for (int i = 0; i < 5; i++) {
                    send(orderId, fill(orderId + "-S" + i, orderId, "10"));
                }
            }
            for (CompletableFuture<?> each : work) {
                each.get(60, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }

        awaitUntil(() -> executionCount(hot) == 100 && spread.stream().allMatch(id -> executionCount(id) == 5),
                "every fill applied");
        assertEquals(0, new BigDecimal("1000").compareTo(orderRepository.findByOrderId(hot).orElseThrow().getCumQty()));
        for (String orderId : spread) {
            assertEquals(State.FILLED, state(orderId), orderId);
            assertEquals(0, new BigDecimal("50").compareTo(orderRepository.findByOrderId(orderId).orElseThrow().getCumQty()), orderId);
        }
        assertEquals(0, deadLetters("commands-two.DLT"), "no command was dead-lettered");

        List<String> all = new ArrayList<>(spread);
        all.add(hot);
        Map<String, Integer> versionCount = new HashMap<>();
        Map<String, Integer> fillCount = new HashMap<>();
        for (String orderId : all) {
            versionCount.put(orderId, (int) orderRepository.findByOrderId(orderId).orElseThrow().getTxNr());
            fillCount.put(orderId, (int) executionCount(orderId));
        }

        // SPEC-0047: pooled ids from two instances interleave, so an order's event ids need not
        // follow its versions. Check that this happened, so the ordering below is really tested.
        assertTrue(all.stream().anyMatch(this::eventIdsOutOfVersionOrder),
                "some order's event ids are out of version order: the two instances' id blocks interleaved");

        Map<String, List<Object>> orderMessages = recordsByOrder("orders", versionCount);
        for (String orderId : all) {
            List<Long> expected = new ArrayList<>();
            for (long v = 1; v <= versionCount.get(orderId); v++) {
                expected.add(v);
            }
            assertEquals(expected, versionsOf(orderMessages.get(orderId)), "every version of " + orderId + " on orders, in order");
            // SPEC-0047 AC-8: each record read back through a pointer is the stored snapshot of its version.
            for (Object record : orderMessages.get(orderId)) {
                long version = ((OrderMessage) record).getEventId();
                var snapshot = orderEventRepository.findByOrderIdAndVersion(orderId, version).orElseThrow().getOrderSnapshot();
                assertEquals(wire(orderMessageMapper.toOrderMessage(snapshot, version)), record, orderId + " v" + version);
            }
        }
        for (String topic : List.of("oms_executions", "oms_order_executions")) {
            Map<String, List<Object>> fills = recordsByOrder(topic, fillCount);
            for (String orderId : all) {
                List<Long> versions = versionsOf(fills.get(orderId));
                assertEquals(fillCount.get(orderId), versions.size(), "one record per fill of " + orderId + " on " + topic);
                assertEquals(versions.stream().distinct().sorted().toList(), versions,
                        "the fills of " + orderId + " on " + topic + " in version order");
            }
        }
        for (String orderId : all) {
            var order = orderRepository.findByOrderId(orderId).orElseThrow();
            Map<Long, org.example.common.model.Execution> byVersion = new HashMap<>();
            executionRepository.findAll().stream()
                    .filter(e -> orderId.equals(e.getOrderId()))
                    .forEach(e -> byVersion.put(e.getOrderVersion(), e));
            for (Object record : recordsByOrder("oms_executions", Map.of(orderId, fillCount.get(orderId))).get(orderId)) {
                long version = ((org.example.common.model.msg.Execution) record).getOrderVersion();
                assertEquals(wire(executionMessageMapper.toExecutionMessage(byVersion.get(version), order, version)), record,
                        "the execution of " + orderId + " v" + version + " is the stored one");
            }
        }
    }

    private boolean eventIdsOutOfVersionOrder(String orderId) {
        List<Long> ids = jdbc.queryForList("select id from order_events where order_id = ? order by version", Long.class, orderId);
        return !ids.equals(ids.stream().sorted().toList());
    }

    /** The record as a consumer receives it: Avro keeps timestamps to the millisecond. */
    private Object wire(org.apache.avro.specific.SpecificRecord record) {
        return payloadCodec.decode(record.getSchema().getFullName(), payloadCodec.encode(record));
    }

    private static List<Long> versionsOf(List<Object> records) {
        return records.stream().map(r -> version(r).getValue()).toList();
    }

    // --- helpers -------------------------------------------------------------------------------

    /** Creates a live order of the given quantity. */
    private String createLiveOrderOf(String account, String quantity) throws Exception {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID()).sessionId("SES-TWO").account(account).symbol("AAPL")
                .side(Side.BUY).ordType(OrdType.LIMIT).price(new BigDecimal("170")).orderQty(new BigDecimal(quantity))
                .timeInForce(TimeInForce.DAY);
        var result = orderCreateCommandProcessor.process(new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        String orderId = result.getOrderId();
        send(orderId, new org.example.common.model.msg.OrderAcceptCmd(TestCommands.header(), orderId));
        awaitUntil(() -> state(orderId) == State.LIVE, orderId + " LIVE");
        return orderId;
    }

    private static ExecutionCreateCmd fillCommand(String orderId, String execId) {
        return new ExecutionCreateCmd().type("ExecutionCreateCmd").execution(new org.example.common.model.cmd.Execution()
                .execId(execId).orderId(orderId).lastQty(new BigDecimal("10")).lastPx(new BigDecimal("170")).execType("F"));
    }

    private static String create(ConfigurableApplicationContext instance) {
        return create(instance, TimeInForce.DAY, null);
    }

    private static String createGtd(ConfigurableApplicationContext instance, Instant expireTime) {
        return create(instance, TimeInForce.GOOD_TILL_DATE, expireTime);
    }

    private static String create(ConfigurableApplicationContext instance, TimeInForce tif, Instant expireTime) {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID()).sessionId("SES-TWO").account("ACC-TWO").symbol("AAPL")
                .side(Side.BUY).ordType(OrdType.LIMIT).price(new BigDecimal("170")).orderQty(new BigDecimal("100"))
                .timeInForce(tif)
                .expireTime(expireTime == null ? null : OffsetDateTime.ofInstant(expireTime, ZoneOffset.UTC));
        CommandDispatch outcome = instance.getBean(CommandDispatcher.class)
                .dispatch(new OrderCreateCmd().type("OrderCreateCmd").order(order), CommandOrigin.rest(Instant.now()));
        assertTrue(outcome instanceof CommandDispatch.Applied, "created: " + outcome);
        return outcome.orderId();
    }

    private static boolean relayLeader(ConfigurableApplicationContext instance) {
        try {
            String body = MockMvcBuilders.webAppContextSetup((WebApplicationContext) instance).build()
                    .perform(get("/actuator/health/leadership"))
                    .andReturn().getResponse().getContentAsString();
            return Boolean.TRUE.equals(JsonPath.read(body, "$.components.instanceRoles.details.outboxRelay"));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Runs the instance's end-of-day job, as its schedule would, once {@code go} opens. */
    private static void invokeEndOfDay(ConfigurableApplicationContext instance, CountDownLatch go) {
        try {
            EndOfDayScheduler scheduler = instance.getBean(EndOfDayScheduler.class);
            var endOfDay = EndOfDayScheduler.class.getDeclaredMethod("endOfDay");
            endOfDay.setAccessible(true);
            go.await();
            endOfDay.invoke(scheduler);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean holdsScheduler(ConfigurableApplicationContext instance) {
        return Boolean.TRUE.equals(instance.getBean(Leadership.class).held().get(Role.SCHEDULER));
    }

    /** This instance's own count of orders expired or closed by end of day. */
    private static double endOfDayOrders(ConfigurableApplicationContext instance, String step) {
        var counter = instance.getBean(MeterRegistry.class).find("oms.end-of-day.orders").tag("step", step).counter();
        return counter == null ? 0 : counter.count();
    }

    /** Outbox batches this instance claimed. */
    private static double drains(ConfigurableApplicationContext instance) {
        var counter = instance.getBean(MeterRegistry.class).find("oms.outbox.drains").counter();
        return counter == null ? 0 : counter.count();
    }

    private static void waitFor(BooleanSupplier condition, String what, Duration within) throws InterruptedException {
        long deadline = System.nanoTime() + within.toNanos();
        while (!condition.getAsBoolean()) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("Timed out after " + within + " waiting for: " + what);
            }
            Thread.sleep(100);
        }
    }

    private Consumer<Object, Object> subscribed(String topic) {
        Properties properties = TestCommands.avroValues();
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        Consumer<Object, Object> consumer = consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, properties);
        consumer.subscribe(List.of(topic));
        return consumer;
    }

    private static void awaitPublished(Consumer<Object, Object> consumer, String orderId, Duration within) {
        long deadline = System.nanoTime() + within.toNanos();
        while (System.nanoTime() < deadline) {
            for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(100))) {
                if (orderId.equals(record.key())) {
                    return;
                }
            }
        }
        throw new AssertionError("Nothing published for " + orderId + " within " + within);
    }

    /**
     * Each order's records on a topic in arrival order, read until every order has at least the
     * expected number of records (or 30 seconds pass), and one second longer so that a duplicate
     * shows up too. A record's version is the order message's eventId or the execution's orderVersion.
     */
    private Map<String, List<Object>> recordsByOrder(String topic, Map<String, Integer> expected) {
        Map<String, List<Object>> byOrder = new HashMap<>();
        expected.keySet().forEach(id -> byOrder.put(id, new ArrayList<>()));
        try (Consumer<Object, Object> consumer = subscribed(topic)) {
            long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
            while (System.nanoTime() < deadline
                    && !expected.entrySet().stream().allMatch(e -> byOrder.get(e.getKey()).size() >= e.getValue())) {
                collect(consumer.poll(Duration.ofMillis(200)), byOrder);
            }
            collect(consumer.poll(Duration.ofSeconds(1)), byOrder);
        }
        return byOrder;
    }

    private static void collect(Iterable<ConsumerRecord<Object, Object>> records, Map<String, List<Object>> byOrder) {
        for (ConsumerRecord<Object, Object> record : records) {
            Map.Entry<String, Long> version = version(record.value());
            if (version != null && byOrder.containsKey(version.getKey())) {
                byOrder.get(version.getKey()).add(record.value());
            }
        }
    }

    private static Map.Entry<String, Long> version(Object value) {
        return switch (value) {
            case OrderMessage message -> Map.entry(message.getOrderId(), message.getEventId());
            case org.example.common.model.msg.Execution execution -> Map.entry(execution.getOrderId(), execution.getOrderVersion());
            case org.example.common.model.msg.OrderExecution fill -> Map.entry(fill.getOrderId(), fill.getOrderVersion());
            case null, default -> null;
        };
    }

    private static int deadLetters(String topic) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-dlt-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, org.apache.kafka.common.serialization.StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, org.apache.kafka.common.serialization.ByteArrayDeserializer.class,
                ConsumerConfig.ALLOW_AUTO_CREATE_TOPICS_CONFIG, false);
        int count = 0;
        try (var consumer = new org.apache.kafka.clients.consumer.KafkaConsumer<String, byte[]>(config)) {
            consumer.subscribe(List.of(topic));
            long deadline = System.nanoTime() + Duration.ofSeconds(3).toNanos();
            while (System.nanoTime() < deadline) {
                count += consumer.poll(Duration.ofMillis(250)).count();
            }
        }
        return count;
    }
}
