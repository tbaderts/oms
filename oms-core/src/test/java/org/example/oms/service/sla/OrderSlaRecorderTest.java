package org.example.oms.service.sla;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.TimeUnit;

import org.example.common.model.Leg;
import org.example.common.model.Order;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class OrderSlaRecorderTest {

    private static final Instant INGRESS = Instant.parse("2026-09-04T09:30:00.000000Z");
    private static final Instant NOW = Instant.parse("2026-09-04T09:30:00.012000Z");

    private SimpleMeterRegistry registry;
    private OrderSlaRecorder recorder;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        recorder = new OrderSlaRecorder(registry, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private Order order() {
        return Order.builder().orderId("ORD-1").exDestination("XNAS").build();
    }

    private Timer timer(String name) {
        return registry.find(name).timer();
    }

    @Nested
    @DisplayName("ingress")
    class Ingress {

        @Test
        void stampsTheSuppliedTimeRatherThanTheClock() {
            Order stamped = recorder.stampReceived(order(), INGRESS);

            assertEquals(INGRESS, stamped.getOrderReceivedTime());
        }

        /**
         * A redelivered command must not be able to reset the start point. If it could, a retry
         * would report a latency measured from its own arrival and every breach would heal itself.
         */
        @Test
        void isWriteOnce() {
            Order already = order().toBuilder().orderReceivedTime(INGRESS).build();

            Order stamped = recorder.stampReceived(already, INGRESS.plusSeconds(5));

            assertEquals(INGRESS, stamped.getOrderReceivedTime());
            assertSame(already, stamped);
        }

        @Test
        void toleratesAnAbsentIngressTime() {
            Order stamped = recorder.stampReceived(order(), null);

            assertNull(stamped.getOrderReceivedTime());
        }
    }

    @Nested
    @DisplayName("checkpoints and their latencies")
    class Checkpoints {

        @Test
        void acknowledgementStampsTheClockAndRecordsTimeToAck() {
            Order received = recorder.stampReceived(order(), INGRESS);

            Order acked = recorder.stampAcknowledged(received);

            assertEquals(NOW, acked.getAckTime());
            Timer timer = timer(OrderSlaRecorder.TIME_TO_ACK);
            assertNotNull(timer);
            assertEquals(1, timer.count());
            assertEquals(12.0, timer.totalTime(TimeUnit.MILLISECONDS), 0.001);
        }

        @Test
        void releaseStampsTheClockAndRecordsOmsProcessingTime() {
            Order received = recorder.stampReceived(order(), INGRESS);

            Order released = recorder.stampReleased(received);

            assertEquals(NOW, released.getMarketSendTime());
            assertEquals(12.0, timer(OrderSlaRecorder.OMS_PROCESSING_TIME)
                    .totalTime(TimeUnit.MILLISECONDS), 0.001);
        }

        /**
         * The market ack is the one checkpoint that ends two different measurements: the round trip
         * we do not control, and the end-to-end number the SLA is actually written against.
         */
        @Test
        void marketAckRecordsBothRoundTripAndTimeToMarket() {
            Instant sent = INGRESS.plus(Duration.ofMillis(4));
            Instant observed = INGRESS.plus(Duration.ofMillis(30));
            Order order =
                    order().toBuilder()
                            .orderReceivedTime(INGRESS)
                            .marketSendTime(sent)
                            .build();

            Order acked = recorder.stampMarketAck(order, observed);

            assertEquals(observed, acked.getMarketAckTime());
            assertEquals(26.0, timer(OrderSlaRecorder.MARKET_ROUND_TRIP)
                    .totalTime(TimeUnit.MILLISECONDS), 0.001);
            assertEquals(30.0, timer(OrderSlaRecorder.TIME_TO_MARKET)
                    .totalTime(TimeUnit.MILLISECONDS), 0.001);
        }

        @Test
        void marketAckFallsBackToTheClockWhenNoObservationIsSupplied() {
            Order order = order().toBuilder().orderReceivedTime(INGRESS).build();

            Order acked = recorder.stampMarketAck(order, null);

            assertEquals(NOW, acked.getMarketAckTime());
        }
    }

    @Nested
    @DisplayName("refusing to invent numbers")
    class Honesty {

        /**
         * Orders that predate this feature have no ingress checkpoint. Recording a duration for them
         * would mean measuring from the epoch, or from nothing — either way an invented value that
         * is indistinguishable from a real one once it is inside the percentiles.
         */
        @Test
        void recordsNothingWhenTheStartCheckpointIsMissing() {
            recorder.stampAcknowledged(order());
            recorder.stampReleased(order());
            recorder.stampMarketAck(order(), NOW);

            assertNull(timer(OrderSlaRecorder.TIME_TO_ACK));
            assertNull(timer(OrderSlaRecorder.OMS_PROCESSING_TIME));
            assertNull(timer(OrderSlaRecorder.MARKET_ROUND_TRIP));
            assertNull(timer(OrderSlaRecorder.TIME_TO_MARKET));
        }

        /** A negative duration can only mean a clock stepped backwards. It is not a fast order. */
        @Test
        void dropsNegativeDurations() {
            Order order = order().toBuilder().orderReceivedTime(NOW.plusSeconds(60)).build();

            recorder.stampAcknowledged(order);

            assertNull(timer(OrderSlaRecorder.TIME_TO_ACK));
        }

        @Test
        void stillStampsTheCheckpointWhenTheLatencyCannotBeMeasured() {
            Order acked = recorder.stampAcknowledged(order());

            assertEquals(NOW, acked.getAckTime());
        }
    }

    @Nested
    @DisplayName("metric tags")
    class Tags {

        @Test
        void carryLegAndVenueSoThePopulationsCanBeSeparated() {
            Order order =
                    order().toBuilder().orderReceivedTime(INGRESS).leg(Leg.MKT).build();

            recorder.stampReleased(order);

            Timer timer =
                    registry.find(OrderSlaRecorder.OMS_PROCESSING_TIME)
                            .tag("leg", "MKT")
                            .tag("exDestination", "XNAS")
                            .timer();
            assertNotNull(timer);
            assertEquals(1, timer.count());
        }

        /**
         * Nothing populates {@code leg} yet. The tag has to degrade to a placeholder rather than
         * blow up, or the SLA metrics would be unavailable until a router exists.
         */
        @Test
        void degradeToAPlaceholderRatherThanFailing() {
            Order order =
                    Order.builder().orderId("ORD-1").orderReceivedTime(INGRESS).build();

            recorder.stampReleased(order);

            Timer timer =
                    registry.find(OrderSlaRecorder.OMS_PROCESSING_TIME)
                            .tag("leg", "UNSET")
                            .tag("exDestination", "UNSET")
                            .timer();
            assertNotNull(timer);
            assertTrue(timer.count() > 0);
        }
    }
}
