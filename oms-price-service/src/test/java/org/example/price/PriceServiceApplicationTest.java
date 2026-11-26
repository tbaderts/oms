package org.example.price;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** The service starts with no key and an empty data directory (SPEC-0079). */
@SpringBootTest
class PriceServiceApplicationTest {

    @TempDir
    static Path dataDir;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("oms.price.data-dir", dataDir::toString);
        registry.add("oms.price.alpha-vantage.api-key", () -> "");
    }

    @Autowired
    ApplicationContext context;

    @Test
    void startsWithoutKeyOrData() {
        assertThat(context.getId()).isNotBlank();
    }
}
