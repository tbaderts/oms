package org.example.streaming;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {
    "streaming.kafka.enabled=false"
})
class StreamingServiceApplicationTests {

    @Test
    void contextLoads() {
        // Verify application context loads successfully
    }
}
