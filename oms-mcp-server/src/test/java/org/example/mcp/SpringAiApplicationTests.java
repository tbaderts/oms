package org.example.mcp;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Smoke test that verifies the Spring context loads successfully
 * without requiring external services (Qdrant, Ollama, oms-core).
 */
@SpringBootTest(properties = "spring.main.web-application-type=reactive")
@ActiveProfiles("test")
class SpringAiApplicationTests {

	@Test
	void contextLoads() {
		// Context loads without exceptions — vector store and MCP transport are disabled
	}
}
