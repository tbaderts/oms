package org.example.oms.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.example.common.model.Order;
import org.springframework.data.jpa.domain.Specification;

import lombok.extern.slf4j.Slf4j;

/**
 * Utility builder producing JPA Specifications for dynamic Order queries. Supports a minimal set of
 * operations (eq, like, gt, gte, lt, lte, between) and a few typed fields.
 */
@Slf4j
public final class OrderSpecifications {

    private OrderSpecifications() {}

    public static Specification<Order> dynamic(Map<String, String> params) {
        List<Specification<Order>> specs = new ArrayList<>();

        params.forEach(
                (k, v) -> {
                    if (v == null || v.isBlank()) return;
                    String key = k.trim();
                    String field;
                    String op;
                    int idx = key.indexOf("__");
                    if (idx > 0) {
                        field = key.substring(0, idx);
                        op = key.substring(idx + 2);
                    } else {
                        field = key;
                        op = "eq";
                    }
                    switch (field) {
                        case "orderId",
                                        "rootOrderId",
                                        "parentOrderId",
                                        "clOrdId",
                                        "account",
                                        "symbol",
                                        "securityId" ->
                                specs.add(buildString(field, op, v));
                        case "price", "orderQty", "cashOrderQty" ->
                                specs.add(buildNumeric(field, op, v));
                        case "sendingTime", "transactTime", "expireTime" ->
                                specs.add(buildDate(field, op, v));
                        case "side", "ordType", "state", "cancelState" ->
                                specs.add(buildEnum(field, op, v));
                        default ->
                                log.warn("Unknown filter field ignored: {}", field);
                    }
                });

        return specs.stream().reduce(all(), Specification::and);
    }

    private static Specification<Order> all() {
        return (r, q, cb) -> cb.conjunction();
    }

    private static Specification<Order> buildString(String field, String op, String value) {
        return (root, query, cb) -> {
            switch (op) {
                case "like":
                    return cb.like(cb.lower(root.get(field)), "%" + value.toLowerCase() + "%");
                case "eq":
                default:
                    return cb.equal(root.get(field), value);
            }
        };
    }

    private static Specification<Order> buildNumeric(String field, String op, String value) {
        return (root, query, cb) -> {
            try {
                switch (op) {
                    case "between":
                        {
                            String[] parts = value.split(",", -1);
                            if (parts.length != 2) {
                                return cb.conjunction();
                            }
                            String leftRaw = parts[0].trim();
                            String rightRaw = parts[1].trim();
                            boolean hasLeft = !leftRaw.isEmpty();
                            boolean hasRight = !rightRaw.isEmpty();
                            if (hasLeft && hasRight) {
                                BigDecimal a = new BigDecimal(leftRaw);
                                BigDecimal b = new BigDecimal(rightRaw);
                                return cb.between(root.get(field), a, b);
                            } else if (hasLeft) {
                                BigDecimal a = new BigDecimal(leftRaw);
                                return cb.greaterThanOrEqualTo(root.get(field), a);
                            } else if (hasRight) {
                                BigDecimal b = new BigDecimal(rightRaw);
                                return cb.lessThanOrEqualTo(root.get(field), b);
                            } else {
                                return cb.conjunction();
                            }
                        }
                    case "gt":
                        return cb.greaterThan(root.get(field), new BigDecimal(value));
                    case "gte":
                        return cb.greaterThanOrEqualTo(root.get(field), new BigDecimal(value));
                    case "lt":
                        return cb.lessThan(root.get(field), new BigDecimal(value));
                    case "lte":
                        return cb.lessThanOrEqualTo(root.get(field), new BigDecimal(value));
                    case "eq":
                    default:
                        return cb.equal(root.get(field), new BigDecimal(value));
                }
            } catch (NumberFormatException ex) {
                log.warn("Invalid numeric filter value for field {}: {}", field, value);
                return cb.conjunction();
            }
        };
    }

    private static Specification<Order> buildDate(String field, String op, String value) {
        return (root, query, cb) -> {
            try {
                switch (op) {
                    case "between":
                        {
                            String[] parts = value.split(",", -1);
                            if (parts.length != 2) return cb.conjunction();
                            String leftRaw = parts[0].trim();
                            String rightRaw = parts[1].trim();
                            boolean hasLeft = !leftRaw.isEmpty();
                            boolean hasRight = !rightRaw.isEmpty();
                            if (hasLeft && hasRight) {
                                Instant a = Instant.parse(leftRaw);
                                Instant b = Instant.parse(rightRaw);
                                return cb.between(root.get(field), a, b);
                            } else if (hasLeft) {
                                Instant a = Instant.parse(leftRaw);
                                return cb.greaterThanOrEqualTo(root.get(field), a);
                            } else if (hasRight) {
                                Instant b = Instant.parse(rightRaw);
                                return cb.lessThanOrEqualTo(root.get(field), b);
                            } else {
                                return cb.conjunction();
                            }
                        }
                    case "gt":
                        return cb.greaterThan(root.get(field), Instant.parse(value));
                    case "gte":
                        return cb.greaterThanOrEqualTo(root.get(field), Instant.parse(value));
                    case "lt":
                        return cb.lessThan(root.get(field), Instant.parse(value));
                    case "lte":
                        return cb.lessThanOrEqualTo(root.get(field), Instant.parse(value));
                    case "eq":
                    default:
                        return cb.equal(root.get(field), Instant.parse(value));
                }
            } catch (DateTimeParseException ex) {
                log.warn("Invalid date filter value for field {}: {}", field, value);
                return cb.conjunction();
            }
        };
    }

    private static Specification<Order> buildEnum(String field, String op, String value) {
        return (root, query, cb) -> {
            try {
                Class<?> javaType = root.get(field).getJavaType();
                if (!javaType.isEnum()) {
                    return cb.conjunction();
                }
                @SuppressWarnings({"rawtypes", "unchecked"})
                Enum enumValue =
                        Enum.valueOf((Class<? extends Enum>) javaType.asSubclass(Enum.class), value);
                return cb.equal(root.get(field), enumValue);
            } catch (IllegalArgumentException ex) {
                log.warn("Invalid enum filter value for field {}: {}", field, value);
                return cb.conjunction();
            }
        };
    }
}
