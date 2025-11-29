package org.example.streaming.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Filter criteria for Trade Blotter streams.
 * 
 * <p>Filter format matches the OMS Query API specification. Filters are represented
 * as a list of conditions that are combined with a logical operator (AND/OR).
 * 
 * <p>Example JSON from UI:
 * <pre>
 * {
 *   "logicalOperator": "AND",
 *   "filters": [
 *     {"field": "symbol", "operator": "EQ", "value": "INTC"},
 *     {"field": "side", "operator": "EQ", "value": "BUY"},
 *     {"field": "price", "operator": "BETWEEN", "value": "30", "value2": "50"}
 *   ]
 * }
 * </pre>
 * 
 * <p>These filters are applied to:
 * <ol>
 *   <li>REST API query to fetch initial snapshot from OMS Core</li>
 *   <li>Real-time Kafka stream filtering</li>
 * </ol>
 * 
 * @see FilterCondition
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class StreamFilter {

    @Builder.Default
    private LogicalOperator logicalOperator = LogicalOperator.AND;
    
    @Builder.Default
    private List<FilterCondition> filters = new ArrayList<>();
    
    /** Whether to include initial snapshot from REST API */
    @Builder.Default
    private boolean includeSnapshot = true;
    
    public enum LogicalOperator {
        AND, OR
    }
    
    public boolean isEmpty() {
        return filters == null || filters.isEmpty();
    }
    
    /**
     * Converts filters to Query API parameter map.
     * 
     * <p>Example: [symbol=INTC, price__between=30,50]
     * 
     * @return Map of query parameter name to value
     */
    public Map<String, String> toQueryParams() {
        if (isEmpty()) {
            return Map.of();
        }
        return filters.stream()
                .filter(f -> f.getField() != null && f.getValue() != null)
                .collect(Collectors.toMap(
                        FilterCondition::toQueryParam,
                        FilterCondition::toQueryValue,
                        (v1, v2) -> v2  // In case of duplicate keys, use the later one
                ));
    }
    
    /**
     * Creates a simple equality filter.
     */
    public static StreamFilter eq(String field, String value) {
        return StreamFilter.builder()
                .filters(List.of(FilterCondition.eq(field, value)))
                .build();
    }
    
    /**
     * Creates a filter with multiple equality conditions (AND).
     */
    public static StreamFilter and(FilterCondition... conditions) {
        return StreamFilter.builder()
                .logicalOperator(LogicalOperator.AND)
                .filters(List.of(conditions))
                .build();
    }
    
    /**
     * Creates an empty filter that includes snapshot (no filtering).
     */
    public static StreamFilter withSnapshot() {
        return StreamFilter.builder()
                .includeSnapshot(true)
                .build();
    }
    
    /**
     * Creates an empty filter without snapshot (live stream only).
     */
    public static StreamFilter liveOnly() {
        return StreamFilter.builder()
                .includeSnapshot(false)
                .build();
    }
}
