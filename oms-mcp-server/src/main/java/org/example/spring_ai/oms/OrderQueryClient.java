package org.example.spring_ai.oms;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import lombok.extern.slf4j.Slf4j;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * REST client to call the OMS OrderQueryController search endpoint.
 */
@Slf4j
@Component
public class OrderQueryClient {

    private final RestClient restClient;

    public OrderQueryClient(RestClient omsRestClient) {
        this.restClient = omsRestClient;
    }

    /**
     * Calls /api/query/orders with dynamic filter, pagination and sort parameters.
     * All parameters are optional. Only non-null ones are added as query params.
     * 
     * @param params dynamic filter params (already using the server naming
     *               conventions)
     * @param page   page index (0-based)
     * @param size   page size
     * @param sort   sort string e.g. "field,DESC;otherField,ASC"
     * @return PageResponse of OrderDto (maps through generic types, so raw map is
     *         returned)
     */
    @SuppressWarnings({ "unchecked" })
    public PageResponse<Map<String, Object>> search(Map<String, ?> params, Integer page, Integer size, String sort) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromPath("/api/query/orders");

        Map<String, Object> merged = new HashMap<>();
        if (params != null)
            merged.putAll(params);
        if (page != null)
            merged.put("page", page);
        if (size != null)
            merged.put("size", size);
        if (sort != null && !sort.isBlank())
            merged.put("sort", sort);

        merged.forEach((k, v) -> {
            if (Objects.nonNull(v)) {
                builder.queryParam(k, v);
            }
        });

        URI uri = builder.build(true).toUri();
        
        log.info("OMS Order Search Request - URI: {}", uri);

        // Get the response as raw string to parse manually
        String raw = restClient.get()
                .uri(uri)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(String.class);
        
        log.info("OMS Order Search Response - Body: {}", raw);

        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(raw);
            
            // Extract content from different possible formats
            List<Map<String, Object>> content = new ArrayList<>();
            
            // Check for direct "content" array (Spring Data REST standard format)
            JsonNode contentNode = root.path("content");
            if (contentNode.isArray()) {
                for (JsonNode node : contentNode) {
                    content.add(mapper.convertValue(node, Map.class));
                }
            } 
            // Check for HAL format (_embedded.orders)
            else {
                JsonNode embedded = root.path("_embedded");
                JsonNode orders = embedded.path("orders");
                
                if (orders.isArray()) {
                    for (JsonNode node : orders) {
                        content.add(mapper.convertValue(node, Map.class));
                    }
                } 
                // Check if root itself is an array
                else if (root.isArray()) {
                    for (JsonNode node : root) {
                        content.add(mapper.convertValue(node, Map.class));
                    }
                }
            }
            
            // Extract page metadata
            JsonNode pageNode = root.path("page");
            int pageNumber = pageNode.path("number").asInt(0);
            int pageSize = pageNode.path("size").asInt(content.size());
            long totalElements = pageNode.path("totalElements").asLong(content.size());
            long totalPages = pageNode.path("totalPages").asLong(1);
            
            return new PageResponse<>(content, pageNumber, pageSize, totalElements, totalPages);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse orders from response", e);
        }
    }
}
