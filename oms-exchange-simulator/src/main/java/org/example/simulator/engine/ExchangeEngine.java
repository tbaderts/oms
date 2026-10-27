package org.example.simulator.engine;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.example.common.model.msg.CancelState;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.State;
import org.example.simulator.config.SimulatorProperties;
import org.example.simulator.metrics.SimulatorMetrics;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

/**
 * The simulated venue's matching engine.
 *
 * <p>Everything runs on one thread, as in a real venue's matching engine: each order's events are
 * handled strictly in sequence, so a cancel request that arrives while an order is being filled
 * cancels exactly the quantity still open. The Kafka listener only enqueues.
 *
 * <p>The engine reacts to two things in the OMS's order stream and ignores everything else:
 *
 * <ul>
 *   <li>The first sight of an order in state UNACK: a NewOrderSingle. It is evaluated and
 *       rejected, or acknowledged and then filled, rested, or (IOC) cancelled.
 *   <li>A change of the order's cancel state into PCXL: an OrderCancelRequest. Open quantity is
 *       cancelled; otherwise the request is refused.
 * </ul>
 *
 * <p>That is also what makes it idempotent: a redelivered order, or the OMS republishing the
 * order after applying the engine's own answers, triggers nothing. State is in memory only; after a
 * restart, cancel requests for earlier orders are refused as unknown.
 */
@Component
@Slf4j
public class ExchangeEngine {

    private final OrderEvaluator evaluator;
    private final SimulatorProperties properties;
    private final CommandSink sink;
    private final SimulatorMetrics metrics;
    private final ScheduledExecutorService thread =
            Executors.newSingleThreadScheduledExecutor(runnable -> {
                Thread t = new Thread(runnable, "exchange-engine");
                t.setDaemon(true);
                return t;
            });

    /**
     * Engine-thread only. Insertion-ordered and capped at {@code maxTrackedOrders}: the oldest
     * order is forgotten first. Orders are not dropped as soon as they are terminal, because a Kafka
     * replay of their NewOrderSingle would then look new and be traded again.
     */
    private final Map<String, SimOrder> orders;

    public ExchangeEngine(
            OrderEvaluator evaluator,
            SimulatorProperties properties,
            CommandSink sink,
            SimulatorMetrics metrics) {
        this.evaluator = evaluator;
        this.properties = properties;
        this.sink = sink;
        this.metrics = metrics;
        int capacity = properties.maxTrackedOrders();
        this.orders =
                new LinkedHashMap<>() {
                    @Override
                    protected boolean removeEldestEntry(Map.Entry<String, SimOrder> eldest) {
                        return size() > capacity;
                    }
                };
    }

    /** Hands an order update from the OMS to the engine thread. Returns immediately. */
    public void onOrderMessage(OrderMessage message) {
        thread.execute(() -> withOrderContext(message.getOrderId(), () -> handle(message)));
    }

    /** Waits until everything enqueued so far has been handled. Fills scheduled with a delay may still be pending. */
    public void flush() {
        try {
            thread.submit(() -> {}).get(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while flushing the engine", e);
        } catch (ExecutionException | java.util.concurrent.TimeoutException e) {
            throw new IllegalStateException("Engine did not drain", e);
        }
    }

    @PreDestroy
    public void shutdown() {
        thread.shutdownNow();
    }

    // ----------------------------------------------------------------------------------------

    private void handle(OrderMessage message) {
        String orderId = message.getOrderId();
        SimOrder known = orders.get(orderId);
        CancelState cancelState = message.getCancelState();

        if (known == null) {
            SimOrder order = new SimOrder(orderId);
            orders.put(orderId, order);
            if (message.getState() == State.UNACK && cancelState != CancelState.PCXL) {
                newOrder(order, message);
            } else {
                // Not an order this venue was sent (or one it has forgotten since a restart).
                order.done = true;
                if (cancelState == CancelState.PCXL) {
                    send(() -> sink.cancelReject(orderId, "Unknown order", commandId(orderId, "CXLREJ", message)), metrics::cancelReject, "cancel reject", orderId);
                }
            }
            order.lastCancelState = cancelState;
            return;
        }

        if (cancelState == CancelState.PCXL && known.lastCancelState != CancelState.PCXL) {
            cancelRequest(known, message);
        }
        known.lastCancelState = cancelState;
    }

    private void newOrder(SimOrder order, OrderMessage message) {
        metrics.orderReceived();
        Evaluation evaluation = evaluator.evaluate(message);

        if (!evaluation.accepted()) {
            order.done = true;
            log.info("Rejecting order {}: {}", order.orderId, evaluation.rejectReason());
            send(() -> sink.reject(order.orderId, evaluation.rejectReason(), commandId(order.orderId, "REJ", message)), metrics::reject, "reject", order.orderId);
            return;
        }

        order.leavesQty = message.getOrderQty().setScale(FillSlicer.QUANTITY_SCALE);
        log.info(
                "Accepting order {}: marketable={}, ioc={}, fillPrice={}",
                order.orderId,
                evaluation.marketable(),
                evaluation.ioc(),
                evaluation.fillPrice());
        send(() -> sink.accept(order.orderId), metrics::ack, "accept", order.orderId);

        if (evaluation.marketable()) {
            scheduleFills(order, evaluation.fillPrice());
        } else if (evaluation.ioc()) {
            order.done = true;
            send(() -> sink.cancel(order.orderId, "IOC order not marketable", commandId(order.orderId, "CXL", message)), metrics::cancel, "cancel", order.orderId);
        }
        // Otherwise the order rests until a cancel request arrives.
    }

    private void scheduleFills(SimOrder order, BigDecimal price) {
        List<BigDecimal> slices = FillSlicer.slice(order.leavesQty, properties.fillSlices());
        long delayMillis = properties.fillDelay().toMillis();

        for (int i = 0; i < slices.size(); i++) {
            BigDecimal qty = slices.get(i);
            if (delayMillis == 0) {
                fill(order, qty, price);
            } else {
                thread.schedule(
                        () -> withOrderContext(order.orderId, () -> fill(order, qty, price)),
                        delayMillis * i,
                        TimeUnit.MILLISECONDS);
            }
        }
    }

    private void fill(SimOrder order, BigDecimal qty, BigDecimal price) {
        if (order.done) {
            log.debug("Skipping fill for order {}: no longer open", order.orderId);
            return;
        }
        order.fills++;
        order.cumQty = order.cumQty.add(qty);
        order.leavesQty = order.leavesQty.subtract(qty);
        if (order.leavesQty.signum() == 0) {
            order.done = true;
        }

        String execId = order.orderId + "-F" + order.fills;
        BigDecimal cum = order.cumQty;
        BigDecimal leaves = order.leavesQty;
        log.info("Filling order {}: execId={}, lastQty={}, lastPx={}, leaves={}", order.orderId, execId, qty, price, leaves);
        send(() -> sink.fill(order.orderId, execId, qty, price, cum, leaves), metrics::execution, "fill", order.orderId);
    }

    private void cancelRequest(SimOrder order, OrderMessage request) {
        if (order.isOpen()) {
            order.done = true;
            log.info("Cancelling order {} on request: {} open", order.orderId, order.leavesQty);
            send(() -> sink.cancel(order.orderId, "Cancelled on request", commandId(order.orderId, "CXL", request)), metrics::cancel, "cancel", order.orderId);
        } else {
            log.info("Refusing cancel request for order {}: nothing open", order.orderId);
            send(() -> sink.cancelReject(order.orderId, "Too late to cancel", commandId(order.orderId, "CXLREJ", request)), metrics::cancelReject, "cancel reject", order.orderId);
        }
    }

    /**
     * A failed send must not kill the engine thread, which would silently stop the venue for every
     * order. The order is left as it is in the OMS, as after a dropped venue connection.
     */
    private void send(Runnable action, Runnable count, String what, String orderId) {
        try {
            action.run();
            count.run();
        } catch (RuntimeException e) {
            log.error("Failed to send {} for order {}", what, orderId, e);
        }
    }

    /**
     * The id of an answer: the order, the kind of answer, and the event-log version of the OMS message
     * being answered. Stable across replays and simulator restarts, distinct for every new request.
     */
    private static String commandId(String orderId, String kind, OrderMessage trigger) {
        return trigger.getEventId() == null ? null : orderId + "-" + kind + "-" + trigger.getEventId();
    }

    private static void withOrderContext(String orderId, Runnable work) {
        MDC.put("orderId", orderId);
        try {
            work.run();
        } catch (RuntimeException e) {
            log.error("Engine failed while handling order {}", orderId, e);
        } finally {
            MDC.remove("orderId");
        }
    }
}
