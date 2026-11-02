package org.example.oms.service.endofday;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

/**
 * Runs the order expiry and end of day on their schedules (SPEC-0029).
 *
 * <ul>
 *   <li>GTD expiry every {@code oms.end-of-day.gtd-poll-interval-ms} (default one minute).</li>
 *   <li>End of day once a day at {@code oms.end-of-day.time} ({@code H:mm}) in
 *       {@code oms.end-of-day.zone} (default 17:00 America/New_York, after the US close). There is
 *       no trading calendar: it runs every day.</li>
 * </ul>
 *
 * <p>Both run on this component's own thread, not on Spring's shared scheduler: that one has a
 * single thread, which also drains the outbox, and a long end of day must not hold up the Kafka
 * messages of live trading.
 *
 * <p>Off with {@code oms.end-of-day.enabled=false}, as in the tests, which call the services
 * directly.
 */
@Component
@Slf4j
@ConditionalOnProperty(prefix = "oms.end-of-day", name = "enabled", havingValue = "true", matchIfMissing = true)
public class EndOfDayScheduler {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("H:mm");

    private final EndOfDayService endOfDayService;
    private final OrderExpiryService orderExpiryService;
    private final Clock clock;
    private final LocalTime time;
    private final ZoneId zone;
    private final Duration gtdPollInterval;
    private final ThreadPoolTaskScheduler taskScheduler = new ThreadPoolTaskScheduler();

    public EndOfDayScheduler(
            EndOfDayService endOfDayService,
            OrderExpiryService orderExpiryService,
            Clock clock,
            @Value("${oms.end-of-day.time:17:00}") String time,
            @Value("${oms.end-of-day.zone:America/New_York}") ZoneId zone,
            @Value("${oms.end-of-day.gtd-poll-interval-ms:60000}") long gtdPollIntervalMs) {
        this.endOfDayService = endOfDayService;
        this.orderExpiryService = orderExpiryService;
        this.clock = clock;
        this.time = parseTime(time);
        this.zone = zone;
        this.gtdPollInterval = Duration.ofMillis(gtdPollIntervalMs);
        taskScheduler.setPoolSize(1);
        taskScheduler.setThreadNamePrefix("end-of-day-");
    }

    @PostConstruct
    void start() {
        taskScheduler.initialize();
        taskScheduler.schedule(this::endOfDay, new CronTrigger(cronExpression(), zone));
        taskScheduler.scheduleWithFixedDelay(this::expireDueGtd, gtdPollInterval);
        log.info("End of day scheduled at {} {}; GTD expiry every {}", time, zone, gtdPollInterval);
    }

    @PreDestroy
    void stop() {
        taskScheduler.shutdown();
    }

    void endOfDay() {
        try {
            endOfDayService.run(clock.instant());
        } catch (RuntimeException e) {
            log.error("End of day failed", e);
        }
    }

    void expireDueGtd() {
        try {
            orderExpiryService.expireDueGtd(clock.instant());
        } catch (RuntimeException e) {
            log.error("GTD expiry failed", e);
        }
    }

    String cronExpression() {
        return "0 " + time.getMinute() + " " + time.getHour() + " * * *";
    }

    ZoneId zone() {
        return zone;
    }

    ThreadPoolTaskScheduler taskScheduler() {
        return taskScheduler;
    }

    /**
     * {@code H:mm}, e.g. {@code 17:00} or {@code 9:05}. In YAML the value must be quoted: unquoted
     * {@code 16:30} is read as a base-60 number.
     */
    private static LocalTime parseTime(String value) {
        try {
            return LocalTime.parse(value.trim(), TIME);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new IllegalArgumentException(
                    "oms.end-of-day.time must be a time of day as H:mm (quote it in YAML), was: " + value, e);
        }
    }
}
