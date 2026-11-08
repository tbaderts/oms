package org.example.oms.integration;

import java.util.Map;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;

/**
 * SPEC-0048 AC-7: every {@link OutboxHoldIntegrationTest} scenario holds with a second instance
 * running: whichever instance leads the relay, a stuck row still holds back only its own aggregate.
 */
class OutboxHoldTwoInstanceIntegrationTest extends OutboxHoldIntegrationTest {

    private static ConfigurableApplicationContext second;

    @Autowired Environment environment;

    @BeforeEach
    void startSecondInstance() {
        if (second == null) {
            second = SecondInstance.start(environment, Map.of());
        }
    }

    @AfterAll
    static void stopSecondInstance() {
        if (second != null) {
            second.close();
            second = null;
        }
    }
}
