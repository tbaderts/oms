package org.example.oms.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Asks the outbox relay to drain as soon as a transaction that staged rows commits (SPEC-0048), so
 * publication does not wait for the relay's poll.
 *
 * <p>One nudge per transaction, however many rows it staged. Nothing happens on rollback, and
 * nothing when Kafka is off (there is no relay). The relay drains only on the leader; on any other
 * instance the nudge is a no-op and the leader's poll publishes the rows.
 */
@Component
public class OutboxNudge {

    private static final Object REGISTERED = OutboxNudge.class.getName() + ".registered";

    private final ObjectProvider<OutboxRelay> relay;

    public OutboxNudge(ObjectProvider<OutboxRelay> relay) {
        this.relay = relay;
    }

    /** Nudges the relay once the current transaction commits; at most once per transaction. */
    public void afterCommit() {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            nudge();
            return;
        }
        if (TransactionSynchronizationManager.hasResource(REGISTERED)) {
            return;
        }
        TransactionSynchronizationManager.bindResource(REGISTERED, Boolean.TRUE);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                nudge();
            }

            @Override
            public void afterCompletion(int status) {
                TransactionSynchronizationManager.unbindResourceIfPossible(REGISTERED);
            }
        });
    }

    private void nudge() {
        relay.ifAvailable(OutboxRelay::nudge);
    }
}
