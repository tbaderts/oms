package org.example.oms.service.leadership;

import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * {@code oms.leadership.held{role}}: 1 while this instance holds the role, else 0 (SPEC-0048). Summed
 * over instances it should be exactly 1 per role; 0 means nobody drains the outbox or runs the
 * schedulers, 2 should be impossible.
 */
@Component
public class LeadershipMetrics {

    public LeadershipMetrics(Leadership leadership, MeterRegistry meterRegistry) {
        for (Role role : Role.values()) {
            Gauge.builder("oms.leadership.held", leadership, l -> Boolean.TRUE.equals(l.held().get(role)) ? 1 : 0)
                    .description("1 while this instance holds the role")
                    .tag("role", role.name())
                    .register(meterRegistry);
        }
    }
}
