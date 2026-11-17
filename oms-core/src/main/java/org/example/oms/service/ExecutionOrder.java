package org.example.oms.service;

import java.util.Locale;

/**
 * The sort direction of the order-execution projection query (SPEC-0067): oldest first, the
 * default, or newest first.
 */
public enum ExecutionOrder {
    OLDEST,
    NEWEST;

    /** The query parameter as a direction: null means the default; anything else must be oldest or newest. */
    public static ExecutionOrder of(String value) {
        if (value == null || value.isBlank()) {
            return OLDEST;
        }
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "oldest" -> OLDEST;
            case "newest" -> NEWEST;
            default -> throw new IllegalArgumentException("order must be oldest or newest, not '" + value + "'");
        };
    }
}
