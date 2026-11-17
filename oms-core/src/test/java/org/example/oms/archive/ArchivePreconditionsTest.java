package org.example.oms.archive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

/**
 * SPEC-0052 AC-7: the "post-trade analytics holds the history" precondition is pluggable and off by
 * default. Off, no check is consulted; on, an order is refused unless a check confirms it.
 */
class ArchivePreconditionsTest {

    /** A stub analytics check answering {@code holds}, counting its calls. */
    private static final class StubCheck implements AnalyticsHistoryCheck {
        final AtomicInteger calls = new AtomicInteger();
        final boolean holds;

        StubCheck(boolean holds) {
            this.holds = holds;
        }

        @Override
        public boolean holds(String orderId) {
            calls.incrementAndGet();
            return holds;
        }
    }

    @Test
    void analyticsCheckOffByDefault() {
        StubCheck check = new StubCheck(false);
        ArchivePreconditions preconditions = new ArchivePreconditions(Optional.of(check), false);

        assertEquals(Optional.empty(), preconditions.refuse("O-1"));
        assertEquals(0, check.calls.get(), "not consulted while switched off");
    }

    @Test
    void refusesWithoutAConfirmingCheckWhenRequired() {
        Optional<String> noCheck = new ArchivePreconditions(Optional.empty(), true).refuse("O-1");
        assertTrue(noCheck.isPresent());
        assertTrue(noCheck.get().contains("no analytics check"), noCheck.get());

        Optional<String> notConfirmed = new ArchivePreconditions(Optional.of(new StubCheck(false)), true).refuse("O-1");
        assertTrue(notConfirmed.isPresent());
        assertTrue(notConfirmed.get().contains("not confirmed"), notConfirmed.get());
    }

    @Test
    void allowsWhenRequiredAndConfirmed() {
        StubCheck check = new StubCheck(true);
        assertEquals(Optional.empty(), new ArchivePreconditions(Optional.of(check), true).refuse("O-1"));
        assertEquals(1, check.calls.get());
    }
}
