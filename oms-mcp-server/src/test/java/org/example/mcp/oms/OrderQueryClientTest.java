package org.example.mcp.oms;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

class OrderQueryClientTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
    }

    @Nested
    class ResponseParsing {

        @Test
        void shouldParseStandardPageResponse() throws Exception {
            String json = """
                    {
                      "content": [
                        {"orderId": "O-001", "symbol": "AAPL"},
                        {"orderId": "O-002", "symbol": "GOOG"}
                      ],
                      "page": {
                        "number": 0,
                        "size": 20,
                        "totalElements": 2,
                        "totalPages": 1
                      }
                    }
                    """;

            // Test the parsing logic by simulating what OrderQueryClient does
            var root = objectMapper.readTree(json);
            var contentNode = root.path("content");

            assertThat(contentNode.isArray()).isTrue();
            assertThat(contentNode.size()).isEqualTo(2);

            Map<String, Object> first = objectMapper.convertValue(contentNode.get(0), Map.class);
            assertThat(first.get("orderId")).isEqualTo("O-001");
            assertThat(first.get("symbol")).isEqualTo("AAPL");
        }

        @Test
        void shouldParseHalFormat() throws Exception {
            String json = """
                    {
                      "_embedded": {
                        "orders": [
                          {"orderId": "O-001", "symbol": "AAPL"}
                        ]
                      },
                      "page": {
                        "number": 0,
                        "size": 20,
                        "totalElements": 1,
                        "totalPages": 1
                      }
                    }
                    """;

            var root = objectMapper.readTree(json);
            var embedded = root.path("_embedded").path("orders");

            assertThat(embedded.isArray()).isTrue();
            assertThat(embedded.size()).isEqualTo(1);
        }

        @Test
        void shouldParseRootArray() throws Exception {
            String json = """
                    [
                      {"orderId": "O-001", "symbol": "AAPL"},
                      {"orderId": "O-002", "symbol": "GOOG"}
                    ]
                    """;

            var root = objectMapper.readTree(json);
            assertThat(root.isArray()).isTrue();
            assertThat(root.size()).isEqualTo(2);
        }
    }

    @Nested
    class PageResponseRecord {

        @Test
        void shouldCreatePageResponse() {
            var response = new PageResponse<>(List.of("a", "b"), 0, 10, 2, 1);

            assertThat(response.content()).containsExactly("a", "b");
            assertThat(response.pageNumber()).isEqualTo(0);
            assertThat(response.pageSize()).isEqualTo(10);
            assertThat(response.totalElements()).isEqualTo(2);
            assertThat(response.totalPages()).isEqualTo(1);
        }

        @Test
        @SuppressWarnings("deprecation")
        void legacyGettersShouldWork() {
            var response = new PageResponse<>(List.of("x"), 1, 5, 10, 2);

            assertThat(response.getContent()).containsExactly("x");
            assertThat(response.getPageNumber()).isEqualTo(1);
            assertThat(response.getPageSize()).isEqualTo(5);
            assertThat(response.getTotalElements()).isEqualTo(10);
            assertThat(response.getTotalPages()).isEqualTo(2);
        }
    }
}
