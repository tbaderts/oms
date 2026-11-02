package org.example.oms.service.endofday;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

/**
 * SPEC-0029 AC-5: end of day runs at the configured time of day, in the configured zone, on its own
 * thread (review: not on the scheduler thread that drains the outbox).
 */
class EndOfDaySchedulerTest {

    private static final Instant NOW = Instant.parse("2026-11-02T22:00:00Z");

    private final EndOfDayService endOfDayService = mock(EndOfDayService.class);
    private final OrderExpiryService orderExpiryService = mock(OrderExpiryService.class);
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    private EndOfDayScheduler scheduler(String time, String zone) {
        return new EndOfDayScheduler(endOfDayService, orderExpiryService, clock, time, ZoneId.of(zone), 60_000);
    }

    @Test
    void cronAndZoneFromConfiguration() {
        EndOfDayScheduler byDefault = scheduler("17:00", "America/New_York");
        assertEquals("0 0 17 * * *", byDefault.cronExpression());
        assertEquals(ZoneId.of("America/New_York"), byDefault.zone());

        EndOfDayScheduler configured = scheduler("16:30", "Europe/Zurich");
        assertEquals("0 30 16 * * *", configured.cronExpression());
        assertEquals(ZoneId.of("Europe/Zurich"), configured.zone());

        assertEquals("0 5 9 * * *", scheduler("9:05", "UTC").cronExpression(), "a one-digit hour is accepted");
    }

    @Test
    void anInvalidTimeFailsWithTheProperty() {
        IllegalArgumentException failure = assertThrows(IllegalArgumentException.class, () -> scheduler("25:00", "UTC"));
        assertTrue(failure.getMessage().contains("oms.end-of-day.time"), failure.getMessage());
    }

    @Test
    void runsTheStepsAtTheClocksInstant() {
        EndOfDayScheduler scheduler = scheduler("17:00", "America/New_York");

        scheduler.endOfDay();
        scheduler.expireDueGtd();

        verify(endOfDayService).run(NOW);
        verify(orderExpiryService).expireDueGtd(NOW);
    }

    @Test
    void runsOnItsOwnThread() throws Exception {
        EndOfDayScheduler scheduler = scheduler("17:00", "America/New_York");
        scheduler.start();
        try {
            String name = scheduler.taskScheduler().submit(() -> Thread.currentThread().getName()).get();
            assertTrue(name.startsWith("end-of-day-"), name);
        } finally {
            scheduler.stop();
        }
    }
}
