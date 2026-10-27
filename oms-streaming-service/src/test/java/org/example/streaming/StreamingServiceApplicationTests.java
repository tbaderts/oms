package org.example.streaming;

import org.example.streaming.service.EventStreamProvider;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
@TestPropertySource(properties = {
    "streaming.kafka.enabled=false",
    // Random ports: a fixed one clashes with a locally running streaming service.
    "spring.rsocket.server.port=0",
    "server.port=0"
})
class StreamingServiceApplicationTests {

    // Mock the EventStreamProvider since neither provider will load during pure context test
    @MockitoBean
    private EventStreamProvider eventStreamProvider;

    @Test
    void contextLoads() {
        // Verify application context loads successfully
    }
}
