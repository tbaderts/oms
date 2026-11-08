package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.example.oms.OmsApplication;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Limit;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * SPEC-0048, from the review of leader handover: a relay that claims while another still holds its
 * claim waits for it, instead of skipping the held rows and claiming an aggregate's later rows ahead
 * of them. Even if two relays overlap during a handover, one aggregate's rows stay in order.
 *
 * <p>Kafka is off and the database is this class's own, so no relay claims anything but the test.
 */
@SpringBootTest(classes = OmsApplication.class)
class OutboxClaimIntegrationTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        String url = AbstractKafkaPostgresIntegrationTest.isolatedDatabaseUrl("claim");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", AbstractKafkaPostgresIntegrationTest.postgres::getUsername);
        registry.add("spring.datasource.password", AbstractKafkaPostgresIntegrationTest.postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("kafka.enabled", () -> "false");
    }

    @Autowired OutboxRepository outboxRepository;
    @Autowired TransactionTemplate transactionTemplate;

    @Test
    void aSecondClaimWaitsForTheFirstInsteadOfSkippingItsRows() throws Exception {
        String aggregate = "ORD-" + UUID.randomUUID();
        List<OutboxMessage> rows = transactionTemplate.execute(status -> List.of(
                outboxRepository.save(row(aggregate, 1)),
                outboxRepository.save(row(aggregate, 2)),
                outboxRepository.save(row(aggregate, 3))));
        CountDownLatch claimed = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        // The old leader claims the aggregate's first row and holds its claim, as while a send is
        // awaited, then publishes it (deletes the row) and commits.
        CompletableFuture<Void> oldLeader = CompletableFuture.runAsync(() -> transactionTemplate.executeWithoutResult(status -> {
            List<OutboxMessage> mine = outboxRepository.claimPending(10, Limit.of(1));
            assertEquals(rows.getFirst().getId(), mine.getFirst().getId());
            claimed.countDown();
            await(release);
            outboxRepository.delete(mine.getFirst());
        }));
        await(claimed);

        // The new leader claims meanwhile.
        CompletableFuture<List<Long>> newLeader = CompletableFuture.supplyAsync(() -> transactionTemplate.execute(status ->
                outboxRepository.claimPending(10, Limit.of(10)).stream()
                        .filter(m -> aggregate.equals(m.getAggregateId()))
                        .map(OutboxMessage::getId)
                        .toList()));

        Thread.sleep(1_000);
        assertFalse(newLeader.isDone(), "the second claim waits; it does not skip to the aggregate's later rows");
        release.countDown();
        oldLeader.get(15, TimeUnit.SECONDS);

        assertEquals(List.of(rows.get(1).getId(), rows.get(2).getId()), newLeader.get(15, TimeUnit.SECONDS),
                "after the first claim ends, the rest in order");
    }

    private static OutboxMessage row(String aggregate, long version) {
        return OutboxMessage.builder()
                .aggregateType(OutboxMessage.AggregateType.ORDER)
                .aggregateId(aggregate)
                .topic("orders")
                .aggregateVersion(version)
                .createdAt(Instant.now())
                .attempts(0)
                .build();
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(15, TimeUnit.SECONDS)) {
                throw new IllegalStateException("timed out");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
