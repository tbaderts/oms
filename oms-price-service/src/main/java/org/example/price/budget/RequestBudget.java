package org.example.price.budget;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.Deque;

import lombok.extern.slf4j.Slf4j;

/**
 * The provider requests the price service allows itself (SPEC-0079): at most {@code daily} a day and
 * {@code perMinute} in any 60 seconds. Alpha Vantage's free key allows 25 and 5.
 *
 * <ul>
 *   <li>The day starts at 00:00 in {@code resetZone}; Alpha Vantage does not document its own reset,
 *       so this is configurable.
 *   <li>The minute is a sliding window of the requests made.
 *   <li>{@link #exhaust()} records that the provider refused (its rate-limit answer): the rest of
 *       the day counts as spent, so no further request is wasted on a refusal.
 *   <li>With a state file, the day and its use survive a restart ({@code yyyy-MM-dd,used}), so a
 *       restarted service does not spend the day again, nor forget a rate limit.
 * </ul>
 */
@Slf4j
public class RequestBudget {

    private static final Duration MINUTE = Duration.ofSeconds(60);

    private final int daily;
    private final int perMinute;
    private final ZoneId resetZone;
    private final Clock clock;
    private final Path stateFile;

    private LocalDate day;
    private int usedToday;
    private final Deque<Instant> lastMinute = new ArrayDeque<>();

    /** A budget kept in memory only, for tests. */
    public RequestBudget(int daily, int perMinute, ZoneId resetZone, Clock clock) {
        this(daily, perMinute, resetZone, clock, null);
    }

    /** @param stateFile where the day and its use are kept across restarts; null keeps them in memory */
    public RequestBudget(int daily, int perMinute, ZoneId resetZone, Clock clock, Path stateFile) {
        if (daily < 0 || perMinute < 0) {
            throw new IllegalArgumentException("budgets must not be negative");
        }
        this.daily = daily;
        this.perMinute = perMinute;
        this.resetZone = resetZone;
        this.clock = clock;
        this.stateFile = stateFile;
        this.day = today();
        restore();
    }

    /** Takes one request if both the day and the minute have room; a refusal costs nothing. */
    public synchronized boolean tryAcquire() {
        Instant now = clock.instant();
        rollDay();
        while (!lastMinute.isEmpty() && !lastMinute.peekFirst().isAfter(now.minus(MINUTE))) {
            lastMinute.pollFirst();
        }
        if (usedToday >= daily || lastMinute.size() >= perMinute) {
            return false;
        }
        usedToday++;
        lastMinute.addLast(now);
        save();
        return true;
    }

    /** The provider said it is rate limited: nothing more today. */
    public synchronized void exhaust() {
        rollDay();
        usedToday = daily;
        save();
    }

    /** Requests left today, ignoring the per-minute window. */
    public synchronized int remainingToday() {
        rollDay();
        return Math.max(0, daily - usedToday);
    }

    private void rollDay() {
        LocalDate today = today();
        if (!today.equals(day)) {
            day = today;
            usedToday = 0;
        }
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), resetZone);
    }

    /** Takes the saved use when it is for today; anything else starts the day afresh. */
    private void restore() {
        if (stateFile == null || !Files.isRegularFile(stateFile)) {
            return;
        }
        try {
            String[] parts = Files.readString(stateFile, StandardCharsets.UTF_8).strip().split(",");
            if (parts.length == 2 && LocalDate.parse(parts[0]).equals(day)) {
                usedToday = Math.min(daily, Math.max(0, Integer.parseInt(parts[1])));
                log.info("Provider budget: {} of {} requests already used today", usedToday, daily);
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Could not read the provider budget state {} ({}); starting the day afresh", stateFile, e.getClass().getSimpleName());
        }
    }

    private void save() {
        if (stateFile == null) {
            return;
        }
        try {
            Files.createDirectories(stateFile.toAbsolutePath().getParent());
            Path temp = Files.createTempFile(stateFile.toAbsolutePath().getParent(), "budget", ".tmp");
            try {
                Files.writeString(temp, day + "," + usedToday, StandardCharsets.UTF_8);
                Files.move(temp, stateFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException e) {
            // The budget still holds in memory; only a restart before the next write loses it.
            log.warn("Could not write the provider budget state {}: {}", stateFile, e.getClass().getSimpleName());
        }
    }
}
