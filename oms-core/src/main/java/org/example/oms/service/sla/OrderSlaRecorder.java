package org.example.oms.service.sla;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.example.common.model.Order;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;

/**
 * Stamps the SLA checkpoint timestamps on an order and records the resulting latencies.
 *
 * <p>Both halves live here on purpose. If the stamping and the metering were in separate places they
 * would drift, and a latency number that silently stops matching the timestamp it claims to measure
 * is worse than no number at all.
 *
 * <p><b>Why new fields rather than the existing timestamps.</b> {@code transactTime} (FIX 60) is
 * rewritten on every business event — at creation and again on the LIVE transition — so it is a
 * moving "time of the latest event", not a fixed start point. {@code sendingTime} (FIX 52) is
 * supplied by the counterparty and sits on their clock. Only deltas between two checkpoints below
 * are valid SLA arithmetic; anything measured against a counterparty timestamp is only as good as
 * the clock synchronisation between the two firms.
 *
 * <p><b>Checkpoints</b>, named after the FIX {@code TrdRegTimestamps} model (tag 770) so a future
 * FIX gateway can emit the group directly:
 *
 * <ul>
 *   <li>{@code orderReceivedTime} — 770=2 TimeIn
 *   <li>{@code ackTime} — validation complete, responsibility assumed, client ack emitted
 *   <li>{@code marketSendTime} — 770=3 TimeOut
 *   <li>{@code marketAckTime} — 770=4 BrokerReceipt
 * </ul>
 *
 * <p><b>On {@code leg}.</b> These are stamped on every order rather than being gated on
 * {@link org.example.common.model.Leg}, because nothing in the system populates that column yet —
 * gating on it would stamp nothing. It is carried as a metric tag instead, so the client and market
 * populations separate themselves in Prometheus the moment a router starts setting it, with no
 * change here. In the meantime the four metric names already carry the split that matters
 * operationally: whether a breach was our processing or the broker round trip.
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/sla-measurement.md">SLA Measurement</a>
 */
@Component
@RequiredArgsConstructor
public class OrderSlaRecorder {

    /** Client-facing promise: how long until we took responsibility for the order. */
    public static final String TIME_TO_ACK = "oms.order.time_to_ack";

    /** Ours alone: ingress until we released the order downstream. */
    public static final String OMS_PROCESSING_TIME = "oms.order.oms_processing_time";

    /** Not ours: wire time plus whatever the broker or venue took to confirm. */
    public static final String MARKET_ROUND_TRIP = "oms.order.market_round_trip";

    /** The headline number: ingress until the downstream ack came back. */
    public static final String TIME_TO_MARKET = "oms.order.time_to_market";

    private static final String TAG_LEG = "leg";
    private static final String TAG_EX_DESTINATION = "exDestination";
    private static final String UNSET = "UNSET";

    private final MeterRegistry meterRegistry;
    private final Clock clock;

    /**
     * Records the moment the order crossed the OMS boundary.
     *
     * <p>The caller supplies the timestamp rather than letting this read the clock, because the
     * boundary is the controller or the Kafka listener — by the time processing reaches here, the
     * work being measured has already started.
     *
     * <p>Write-once. An order that already carries an ingress time is returned untouched, so a
     * replay or a retry cannot overwrite the start point and flatter the numbers.
     */
    public Order stampReceived(Order order, Instant receivedTime) {
        if (order == null || receivedTime == null || order.getOrderReceivedTime() != null) {
            return order;
        }
        return order.toBuilder().orderReceivedTime(receivedTime).build();
    }

    /** Records validation complete / responsibility assumed, and the time-to-ack it implies. */
    public Order stampAcknowledged(Order order) {
        if (order == null) {
            return null;
        }
        Instant ackTime = clock.instant();
        record(TIME_TO_ACK, order, order.getOrderReceivedTime(), ackTime);
        return order.toBuilder().ackTime(ackTime).build();
    }

    /** Records the release of the order downstream, and the OMS-internal time it took to get there. */
    public Order stampReleased(Order order) {
        if (order == null) {
            return null;
        }
        Instant sendTime = clock.instant();
        record(OMS_PROCESSING_TIME, order, order.getOrderReceivedTime(), sendTime);
        return order.toBuilder().marketSendTime(sendTime).build();
    }

    /**
     * Records the downstream acknowledgement, and both latencies that end at it.
     *
     * <p>As with the ingress time, the caller supplies the observation: taking the clock here would
     * fold our own database read into a number that is supposed to describe the broker.
     */
    public Order stampMarketAck(Order order, Instant observedTime) {
        if (order == null) {
            return null;
        }
        Instant ackTime = observedTime != null ? observedTime : clock.instant();
        record(MARKET_ROUND_TRIP, order, order.getMarketSendTime(), ackTime);
        record(TIME_TO_MARKET, order, order.getOrderReceivedTime(), ackTime);
        return order.toBuilder().marketAckTime(ackTime).build();
    }

    /**
     * Records one latency, or nothing at all.
     *
     * <p>A missing start point means the order predates this feature or skipped a checkpoint. Both
     * are silent no-ops: a fabricated duration would be indistinguishable from a real one in the
     * percentiles, which is precisely the thing these metrics exist to keep honest. A negative
     * duration is dropped for the same reason — it can only mean a clock stepped backwards.
     */
    private void record(String name, Order order, Instant start, Instant end) {
        if (start == null || end == null) {
            return;
        }
        Duration elapsed = Duration.between(start, end);
        if (elapsed.isNegative()) {
            return;
        }
        Timer.builder(name)
                .tag(TAG_LEG, order.getLeg() != null ? order.getLeg().name() : UNSET)
                .tag(
                        TAG_EX_DESTINATION,
                        order.getExDestination() != null ? order.getExDestination() : UNSET)
                .register(meterRegistry)
                .record(elapsed);
    }
}
