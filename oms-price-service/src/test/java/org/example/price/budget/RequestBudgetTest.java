package org.example.price.budget;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.example.price.MutableClock;
import org.junit.jupiter.api.Test;

/** The provider requests the price service allows itself (SPEC-0079 AC-4, AC-5). */
class RequestBudgetTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-26T10:00:00Z"));

    @Test
    void dailyLimitThenResetAtMidnightUtc() {
        RequestBudget budget = new RequestBudget(3, 100, ZoneOffset.UTC, clock);

        assertThat(budget.remainingToday()).isEqualTo(3);
        for (int i = 0; i < 3; i++) {
            assertThat(budget.tryAcquire()).isTrue();
            clock.advance(Duration.ofMinutes(1));
        }
        assertThat(budget.tryAcquire()).isFalse();
        assertThat(budget.remainingToday()).isZero();

        clock.set(Instant.parse("2026-11-26T23:59:59Z"));
        assertThat(budget.tryAcquire()).isFalse();
        clock.set(Instant.parse("2026-11-27T00:00:00Z"));
        assertThat(budget.remainingToday()).isEqualTo(3);
        assertThat(budget.tryAcquire()).isTrue();
    }

    @Test
    void perMinuteLimitSlides() {
        RequestBudget budget = new RequestBudget(25, 2, ZoneOffset.UTC, clock);

        assertThat(budget.tryAcquire()).isTrue();
        clock.advance(Duration.ofSeconds(30));
        assertThat(budget.tryAcquire()).isTrue();
        assertThat(budget.tryAcquire()).isFalse();
        // the first request leaves the window 60 s after it was made
        clock.advance(Duration.ofSeconds(30));
        assertThat(budget.tryAcquire()).isTrue();
        assertThat(budget.tryAcquire()).isFalse();
        // a refused request costs nothing from the day
        assertThat(budget.remainingToday()).isEqualTo(22);
    }

    @Test
    void exhaustSpendsTheDayUntilItsReset() {
        RequestBudget budget = new RequestBudget(25, 5, ZoneOffset.UTC, clock);

        budget.exhaust();

        assertThat(budget.remainingToday()).isZero();
        assertThat(budget.tryAcquire()).isFalse();
        clock.set(Instant.parse("2026-11-27T00:00:01Z"));
        assertThat(budget.tryAcquire()).isTrue();
    }

    // Review finding: a restart must not hand out the day's budget again, nor forget a rate limit.
    @Test
    void aRestartKeepsTheDaysUseAndARateLimit(@org.junit.jupiter.api.io.TempDir java.nio.file.Path dir) {
        java.nio.file.Path state = dir.resolve("budget.txt");
        RequestBudget first = new RequestBudget(3, 100, ZoneOffset.UTC, clock, state);
        assertThat(first.tryAcquire()).isTrue();
        assertThat(first.tryAcquire()).isTrue();

        RequestBudget restarted = new RequestBudget(3, 100, ZoneOffset.UTC, clock, state);
        assertThat(restarted.remainingToday()).isEqualTo(1);
        restarted.exhaust();

        RequestBudget again = new RequestBudget(3, 100, ZoneOffset.UTC, clock, state);
        assertThat(again.tryAcquire()).isFalse();

        clock.set(Instant.parse("2026-11-27T00:00:00Z"));
        RequestBudget nextDay = new RequestBudget(3, 100, ZoneOffset.UTC, clock, state);
        assertThat(nextDay.remainingToday()).isEqualTo(3);
    }

    @Test
    void anUnreadableStateFileStartsTheDayAfresh(@org.junit.jupiter.api.io.TempDir java.nio.file.Path dir) throws Exception {
        java.nio.file.Path state = dir.resolve("budget.txt");
        java.nio.file.Files.writeString(state, "garbage");

        assertThat(new RequestBudget(3, 100, ZoneOffset.UTC, clock, state).remainingToday()).isEqualTo(3);
    }

    @Test
    void resetZoneDecidesWhenTheDayStarts() {
        clock.set(Instant.parse("2026-11-26T04:30:00Z")); // 23:30 the day before in New York
        RequestBudget budget = new RequestBudget(1, 5, java.time.ZoneId.of("America/New_York"), clock);
        assertThat(budget.tryAcquire()).isTrue();
        assertThat(budget.tryAcquire()).isFalse();

        clock.set(Instant.parse("2026-11-26T05:00:00Z")); // midnight in New York
        assertThat(budget.tryAcquire()).isTrue();
    }
}
