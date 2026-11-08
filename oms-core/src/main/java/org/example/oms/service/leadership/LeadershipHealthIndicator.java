package org.example.oms.service.leadership;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Which roles this instance holds (SPEC-0048), as the {@code instanceRoles} contributor of the
 * {@code leadership} health group, at {@code /actuator/health/leadership}. Always UP: a
 * follower is healthy; it simply does not drain the outbox or run the schedulers.
 */
@Component("instanceRoles") // shown in the "leadership" health group
@RequiredArgsConstructor
public class LeadershipHealthIndicator implements HealthIndicator {

    private final Leadership leadership;

    @Override
    public Health health() {
        var held = leadership.held();
        return Health.up()
                .withDetail("outboxRelay", held.get(Role.OUTBOX_RELAY))
                .withDetail("scheduler", held.get(Role.SCHEDULER))
                .build();
    }
}
