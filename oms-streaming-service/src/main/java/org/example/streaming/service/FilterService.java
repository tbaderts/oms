package org.example.streaming.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Predicate;

import org.example.streaming.model.FilterCondition;
import org.example.streaming.model.FilterCondition.Operator;
import org.example.streaming.model.OrderDto;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.ExecutionDto;
import org.example.streaming.model.ExecutionEvent;
import org.example.streaming.model.StreamFilter;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Service for applying filters to streaming data.
 * 
 * <p>Converts StreamFilter specifications into Java predicates that can
 * be applied to reactive streams. Supports the same operators as the OMS Query API:
 * <ul>
 *   <li>EQ - equality</li>
 *   <li>LIKE - substring match (case-insensitive)</li>
 *   <li>GT, GTE, LT, LTE - numeric/date comparisons</li>
 *   <li>BETWEEN - inclusive range</li>
 * </ul>
 * 
 * <p>Security: Filter criteria are validated to prevent injection attacks.
 */
@Service
@Slf4j
public class FilterService {

    // Static accessor maps — compile-time safe field resolution, no reflection needed
    private static final Map<String, Function<OrderDto, Object>> ORDER_ACCESSORS = Map.ofEntries(
            Map.entry("eventId", o -> o.getEventId()),
            Map.entry("orderId", o -> o.getOrderId()),
            Map.entry("parentOrderId", o -> o.getParentOrderId()),
            Map.entry("rootOrderId", o -> o.getRootOrderId()),
            Map.entry("clOrdId", o -> o.getClOrdId()),
            Map.entry("account", o -> o.getAccount()),
            Map.entry("symbol", o -> o.getSymbol()),
            Map.entry("side", o -> o.getSide()),
            Map.entry("ordType", o -> o.getOrdType()),
            Map.entry("state", o -> o.getState()),
            Map.entry("cancelState", o -> o.getCancelState()),
            Map.entry("orderQty", o -> o.getOrderQty()),
            Map.entry("cumQty", o -> o.getCumQty()),
            Map.entry("leavesQty", o -> o.getLeavesQty()),
            Map.entry("price", o -> o.getPrice()),
            Map.entry("avgPx", o -> o.getAvgPx()),
            Map.entry("stopPx", o -> o.getStopPx()),
            Map.entry("timeInForce", o -> o.getTimeInForce()),
            Map.entry("securityId", o -> o.getSecurityId()),
            Map.entry("securityType", o -> o.getSecurityType()),
            Map.entry("exDestination", o -> o.getExDestination()),
            Map.entry("text", o -> o.getText()),
            Map.entry("sendingTime", o -> o.getSendingTime()),
            Map.entry("transactTime", o -> o.getTransactTime()),
            Map.entry("expireTime", o -> o.getExpireTime()),
            Map.entry("sequenceNumber", o -> o.getSequenceNumber()),
            Map.entry("eventTime", o -> o.getEventTime())
    );

    private static final Map<String, Function<ExecutionDto, Object>> EXECUTION_ACCESSORS = Map.ofEntries(
            Map.entry("execId", e -> e.getExecId()),
            Map.entry("orderId", e -> e.getOrderId()),
            Map.entry("executionId", e -> e.getExecutionId()),
            Map.entry("lastQty", e -> e.getLastQty()),
            Map.entry("lastPx", e -> e.getLastPx()),
            Map.entry("cumQty", e -> e.getCumQty()),
            Map.entry("avgPx", e -> e.getAvgPx()),
            Map.entry("leavesQty", e -> e.getLeavesQty()),
            Map.entry("execType", e -> e.getExecType()),
            Map.entry("lastMkt", e -> e.getLastMkt()),
            Map.entry("lastCapacity", e -> e.getLastCapacity()),
            Map.entry("transactTime", e -> e.getTransactTime()),
            Map.entry("creationDate", e -> e.getCreationDate()),
            Map.entry("sequenceNumber", e -> e.getSequenceNumber()),
            Map.entry("eventTime", e -> e.getEventTime())
    );

    /**
     * Creates a predicate for filtering OrderEvents based on StreamFilter criteria.
     */
    public Predicate<OrderEvent> createOrderEventPredicate(StreamFilter filter) {
        if (filter == null || filter.isEmpty()) {
            return event -> true;
        }
        
        return event -> {
            if (event.getOrder() == null) {
                return false;
            }
            return matchesFilter(event.getOrder(), filter);
        };
    }

    /**
     * Creates a predicate for filtering ExecutionEvents.
     */
    public Predicate<ExecutionEvent> createExecutionEventPredicate(StreamFilter filter) {
        if (filter == null || filter.isEmpty()) {
            return event -> true;
        }
        
        return event -> {
            if (event.getExecution() == null) {
                return false;
            }
            return matchesFilter(event.getExecution(), filter);
        };
    }

    /**
     * Creates a predicate for filtering OrderDto objects directly.
     */
    public Predicate<OrderDto> createOrderPredicate(StreamFilter filter) {
        if (filter == null || filter.isEmpty()) {
            return order -> true;
        }
        
        return order -> matchesFilter(order, filter);
    }

    /**
     * Creates a predicate for filtering ExecutionDto objects directly.
     */
    public Predicate<ExecutionDto> createExecutionPredicate(StreamFilter filter) {
        if (filter == null || filter.isEmpty()) {
            return exec -> true;
        }
        
        return exec -> matchesFilter(exec, filter);
    }

    /**
     * Checks if an object matches the given filter criteria using static accessor maps.
     */
    @SuppressWarnings("unchecked")
    private <T> boolean matchesFilter(T obj, StreamFilter filter) {
        List<FilterCondition> conditions = filter.getFilters();
        if (conditions == null || conditions.isEmpty()) {
            return true;
        }

        Map<String, Function<T, Object>> accessors;
        if (obj instanceof OrderDto) {
            accessors = (Map<String, Function<T, Object>>) (Map<String, ?>) ORDER_ACCESSORS;
        } else if (obj instanceof ExecutionDto) {
            accessors = (Map<String, Function<T, Object>>) (Map<String, ?>) EXECUTION_ACCESSORS;
        } else {
            log.warn("Unsupported object type for filtering: {}", obj.getClass().getSimpleName());
            return true;
        }

        StreamFilter.LogicalOperator logicalOp = filter.getLogicalOperator();
        if (logicalOp == null) {
            logicalOp = StreamFilter.LogicalOperator.AND;
        }

        if (logicalOp == StreamFilter.LogicalOperator.AND) {
            return conditions.stream().allMatch(cond -> matchesCondition(obj, cond, accessors));
        } else {
            return conditions.stream().anyMatch(cond -> matchesCondition(obj, cond, accessors));
        }
    }

    /**
     * Checks if an object matches a single filter condition using typed accessors.
     */
    private <T> boolean matchesCondition(T obj, FilterCondition condition, Map<String, Function<T, Object>> accessors) {
        try {
            String fieldName = sanitizeFieldName(condition.getField());
            Function<T, Object> accessor = accessors.get(fieldName);
            if (accessor == null) {
                log.warn("Unknown filter field '{}'. Valid fields: {}", fieldName, accessors.keySet());
                return false;
            }
            Object fieldValue = accessor.apply(obj);

            if (fieldValue == null) {
                // Null field only matches EQ with null/empty value
                return condition.getOperator() == Operator.EQ
                       && (condition.getValue() == null || condition.getValue().isEmpty());
            }

            String filterValue = condition.getValue();
            Operator operator = condition.getOperator() != null ? condition.getOperator() : Operator.EQ;

            return evaluateOperator(fieldValue, filterValue, condition.getValue2(), operator);

        } catch (Exception e) {
            log.warn("Error evaluating filter condition: field={}, error={}",
                    condition.getField(), e.getMessage());
            return false;
        }
    }

    /**
     * Evaluates the comparison between field value and filter value.
     */
    private boolean evaluateOperator(Object fieldValue, String filterValue, String filterValue2,
                                     Operator operator) {
        String stringValue = String.valueOf(fieldValue);
        
        switch (operator) {
            case EQ:
                return stringValue.equalsIgnoreCase(filterValue);
                
            case LIKE:
                return stringValue.toLowerCase().contains(filterValue.toLowerCase());
                
            case GT:
                return compareValues(fieldValue, filterValue) > 0;
                
            case GTE:
                return compareValues(fieldValue, filterValue) >= 0;
                
            case LT:
                return compareValues(fieldValue, filterValue) < 0;
                
            case LTE:
                return compareValues(fieldValue, filterValue) <= 0;
                
            case BETWEEN:
                return evaluateBetween(fieldValue, filterValue, filterValue2);
                
            default:
                log.warn("Unknown operator: {}", operator);
                return false;
        }
    }

    /**
     * Compares two values (supports numeric and date comparisons).
     * 
     * @return negative if fieldValue < filterValue, 0 if equal, positive if greater
     */
    private int compareValues(Object fieldValue, String filterValue) {
        // Try numeric comparison first
        try {
            BigDecimal numericField = toBigDecimal(fieldValue);
            BigDecimal numericFilter = new BigDecimal(filterValue);
            return numericField.compareTo(numericFilter);
        } catch (NumberFormatException e) {
            // Not numeric, try date comparison
        }
        
        // Try date comparison
        if (fieldValue instanceof Instant instant) {
            try {
                Instant filterInstant = parseDateTime(filterValue);
                return instant.compareTo(filterInstant);
            } catch (DateTimeParseException e) {
                log.warn("Cannot parse date value: {}", filterValue);
            }
        }
        
        // Fall back to string comparison
        return String.valueOf(fieldValue).compareToIgnoreCase(filterValue);
    }

    /**
     * Evaluates BETWEEN operator.
     */
    private boolean evaluateBetween(Object fieldValue, String minValue, String maxValue) {
        // Handle case where value2 is null but values are comma-separated in value
        if (maxValue == null && minValue != null && minValue.contains(",")) {
            String[] parts = minValue.split(",", 2);
            minValue = parts[0].trim();
            maxValue = parts[1].trim();
        }
        
        if (minValue == null && maxValue == null) {
            return true; // No bounds = match all
        }
        
        // Check lower bound if specified
        if (minValue != null && !minValue.isEmpty()) {
            if (compareValues(fieldValue, minValue) < 0) {
                return false;
            }
        }
        
        // Check upper bound if specified
        if (maxValue != null && !maxValue.isEmpty()) {
            if (compareValues(fieldValue, maxValue) > 0) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Parses datetime string to Instant.
     */
    private Instant parseDateTime(String value) {
        try {
            // Try ISO-8601 instant format
            return Instant.parse(value);
        } catch (DateTimeParseException e) {
            // Try with offset
            return OffsetDateTime.parse(value).toInstant();
        }
    }

    /**
     * Converts value to BigDecimal for numeric comparisons.
     */
    private BigDecimal toBigDecimal(Object value) {
        if (value instanceof BigDecimal bd) {
            return bd;
        } else if (value instanceof Number num) {
            return BigDecimal.valueOf(num.doubleValue());
        } else {
            return new BigDecimal(String.valueOf(value));
        }
    }

    /**
     * Sanitizes field name to prevent injection attacks.
     */
    private String sanitizeFieldName(String fieldName) {
        if (fieldName == null || fieldName.isEmpty()) {
            throw new IllegalArgumentException("Field name cannot be null or empty");
        }
        // Only allow alphanumeric characters and underscores
        if (!fieldName.matches("^[a-zA-Z][a-zA-Z0-9_]*$")) {
            throw new IllegalArgumentException("Invalid field name: " + fieldName);
        }
        return fieldName;
    }
}
