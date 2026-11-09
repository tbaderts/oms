package org.example.oms.service.command;

import java.util.HashMap;
import java.util.Map;

import org.example.common.model.Order;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Each order as the current transaction loaded it, so its event can record what the command changed
 * (SPEC-0049). The pipelines {@link #remember} an order right after loading it; the appender diffs
 * the order it saves against {@link #before}, and remembers the saved state, so a second event in
 * the same transaction diffs from the first one's result. A new order has no entry.
 *
 * <p>Orders are kept as JSON trees in a resource bound to the transaction and dropped when it
 * completes. Before and after are both built by {@link #toJson}, so they compare like for like.
 * Outside a transaction nothing is kept, and {@link #before} is null.
 */
public final class LoadedOrders {

    private static final Object KEY = LoadedOrders.class;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private LoadedOrders() {}

    /** Remembers the order's current state as loaded. */
    public static void remember(Order order) {
        if (order != null) {
            remember(order.getOrderId(), toJson(order));
        }
    }

    public static void remember(String orderId, JsonNode state) {
        Map<String, JsonNode> orders = orders(true);
        if (orders != null && orderId != null) {
            orders.put(orderId, state);
        }
    }

    /** The order as loaded (or as last saved) in this transaction, or null. */
    public static JsonNode before(String orderId) {
        Map<String, JsonNode> orders = orders(false);
        return orders == null ? null : orders.get(orderId);
    }

    public static JsonNode toJson(Order order) {
        return JSON.valueToTree(order);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, JsonNode> orders(boolean create) {
        Map<String, JsonNode> orders = (Map<String, JsonNode>) TransactionSynchronizationManager.getResource(KEY);
        if (orders == null && create && TransactionSynchronizationManager.isSynchronizationActive()) {
            Map<String, JsonNode> fresh = new HashMap<>();
            TransactionSynchronizationManager.bindResource(KEY, fresh);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    TransactionSynchronizationManager.unbindResourceIfPossible(KEY);
                }
            });
            orders = fresh;
        }
        return orders;
    }
}
