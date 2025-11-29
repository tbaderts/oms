package org.example.streaming.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A single filter condition for stream filtering.
 * 
 * <p>Supports various comparison operators matching the OMS Query API format:
 * <ul>
 *   <li>EQ - equals (default for enum fields)</li>
 *   <li>LIKE - substring match (case-insensitive)</li>
 *   <li>GT, GTE, LT, LTE - numeric/date comparisons</li>
 *   <li>BETWEEN - inclusive range (value format: "min,max")</li>
 * </ul>
 * 
 * <p>Query API parameter mapping:
 * <ul>
 *   <li>field=value → EQ</li>
 *   <li>field__like=value → LIKE</li>
 *   <li>field__gt=value → GT</li>
 *   <li>field__gte=value → GTE</li>
 *   <li>field__lt=value → LT</li>
 *   <li>field__lte=value → LTE</li>
 *   <li>field__between=a,b → BETWEEN</li>
 * </ul>
 * 
 * @see StreamFilter
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class FilterCondition {

    private String field;
    private Operator operator;
    private String value;
    
    /** For BETWEEN operator: second value */
    private String value2;
    
    /**
     * Supported filter operators matching OMS Query API.
     */
    public enum Operator {
        /** Equality comparison (default) */
        EQ,
        /** Substring match (case-insensitive) - maps to __like */
        LIKE,
        /** Greater than - maps to __gt */
        GT,
        /** Greater than or equal - maps to __gte */
        GTE,
        /** Less than - maps to __lt */
        LT,
        /** Less than or equal - maps to __lte */
        LTE,
        /** Inclusive range - maps to __between */
        BETWEEN
    }
    
    /**
     * Creates an equality filter condition.
     */
    public static FilterCondition eq(String field, String value) {
        return FilterCondition.builder()
                .field(field)
                .operator(Operator.EQ)
                .value(value)
                .build();
    }
    
    /**
     * Creates a LIKE (substring) filter condition.
     */
    public static FilterCondition like(String field, String value) {
        return FilterCondition.builder()
                .field(field)
                .operator(Operator.LIKE)
                .value(value)
                .build();
    }
    
    /**
     * Creates a BETWEEN filter condition.
     */
    public static FilterCondition between(String field, String min, String max) {
        return FilterCondition.builder()
                .field(field)
                .operator(Operator.BETWEEN)
                .value(min)
                .value2(max)
                .build();
    }
    
    /**
     * Converts to Query API parameter format.
     * @return parameter name (e.g., "price__between" or "symbol")
     */
    public String toQueryParam() {
        if (operator == null || operator == Operator.EQ) {
            return field;
        }
        return field + "__" + operator.name().toLowerCase();
    }
    
    /**
     * Gets the value in Query API format.
     * For BETWEEN, returns "value,value2".
     */
    public String toQueryValue() {
        if (operator == Operator.BETWEEN && value2 != null) {
            return value + "," + value2;
        }
        return value;
    }
}
