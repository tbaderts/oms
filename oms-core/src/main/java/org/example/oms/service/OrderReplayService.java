package org.example.oms.service;

import java.util.List;
import java.util.Optional;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.ExecutionRepository;
import org.example.oms.repository.OrderEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * Reconstructs an order from its event log.
 *
 * <p>This is what makes the event log a claim that can be checked rather than an assertion in a
 * document: if replay cannot produce the order, the log is incomplete. It reads the snapshot stored
 * on each event, so reconstruction is a single lookup rather than a fold over deltas — appropriate
 * here because orders are small and every event already records the state it produced.
 *
 * <p>Comparing {@link #replay} against the live {@code orders} row is the cheapest way to detect a
 * path that mutated an order without appending an event.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderReplayService {

    private final OrderEventRepository orderEventRepository;
    private final ExecutionRepository executionRepository;

    /** The order as it stood after the most recent recorded event. */
    public Optional<Order> replay(String orderId) {
        return replayAt(orderId, Long.MAX_VALUE);
    }

    /**
     * The order as it stood after the given version. Its version is the event's: snapshots written
     * before the order version became the event version (SPEC-0027) carry an older counter.
     */
    public Optional<Order> replayAt(String orderId, long version) {
        return orderEventRepository
                .findFirstByOrderIdAndVersionLessThanEqualOrderByVersionDesc(orderId, version)
                // A copy: the stored snapshot is part of the append-only log and is never changed.
                .map(event -> event.getOrderSnapshot() == null
                        ? null
                        : event.getOrderSnapshot().toBuilder().txNr(event.getVersion()).build());
    }

    /**
     * The order's executions as they stood after the given version: those applied at or before it
     * and not busted or corrected by then (SPEC-0044). With {@link #replayAt} this gives the order
     * and its fills as of any version, from two indexed queries.
     */
    public List<Execution> executionsAt(String orderId, long version) {
        return executionRepository.findInForceAt(orderId, version);
    }

    /** The full ordered history of an order. */
    public List<OrderEvent> history(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId);
    }

    /**
     * Checks the log is contiguous from version 1 with no gaps.
     *
     * <p>A gap means a state change was applied to the order without being recorded, which the
     * unique constraint on {@code (order_id, version)} cannot catch on its own.
     */
    public boolean isContiguous(String orderId) {
        List<OrderEvent> events = history(orderId);
        for (int i = 0; i < events.size(); i++) {
            if (events.get(i).getVersion() != i + 1L) {
                return false;
            }
        }
        return true;
    }
}
