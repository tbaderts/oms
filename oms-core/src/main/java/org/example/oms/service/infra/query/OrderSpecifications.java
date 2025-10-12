package org.example.oms.service.infra.query;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.example.common.model.Order;
import org.springframework.data.jpa.domain.Specification;

/**
 * Utility builder producing JPA Specifications for dynamic Order queries. Supports a minimal set of
 * operations (eq, like, gt, gte, lt, lte, between) and a few typed fields. Extend safely by adding
 * cases inside buildNumeric / buildString / buildDate.
 */
public final class OrderSpecifications {

    private OrderSpecifications() {}

    public static Specification<Order> dynamic(Map<String, String> params) {
        List<Specification<Order>> specs = new ArrayList<>();

        params.forEach(
                (k, v) -> {
                    if (v == null || v.isBlank()) return; // skip empties
                    String key = k.trim();
                    // pattern: field__op e.g. price__gte, symbol__like
                    String field;
                    String op;
                    int idx = key.indexOf("__");
                    if (idx > 0) {
                        field = key.substring(0, idx);
                        op = key.substring(idx + 2);
                    } else {
                        field = key;
                        op = "eq"; // default
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
                        default -> {
                            // ignore unknown fields silently (could log)
                        }
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
                            String[] parts = value.split(",", -1); // keep empties
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
                            } else if (hasLeft) { // treat as >=
                                BigDecimal a = new BigDecimal(leftRaw);
                                return cb.greaterThanOrEqualTo(root.get(field), a);
                            } else if (hasRight) { // treat as <=
                                BigDecimal b = new BigDecimal(rightRaw);
                                return cb.lessThanOrEqualTo(root.get(field), b);
                            } else {
                                return cb.conjunction();
                            }
                        }
                    case "gt":
                        {
                            BigDecimal v = new BigDecimal(value);
                            return cb.greaterThan(root.get(field), v);
                        }
                    case "gte":
                        {
                            BigDecimal v = new BigDecimal(value);
                            return cb.greaterThanOrEqualTo(root.get(field), v);
                        }
                    case "lt":
                        {
                            BigDecimal v = new BigDecimal(value);
                            return cb.lessThan(root.get(field), v);
                        }
                    case "lte":
                        {
                            BigDecimal v = new BigDecimal(value);
                            return cb.lessThanOrEqualTo(root.get(field), v);
                        }
                    case "eq":
                    default:
                        {
                            BigDecimal v = new BigDecimal(value);
                            return cb.equal(root.get(field), v);
                        }
                }
            } catch (NumberFormatException ex) {
                // Invalid number -> ignore filter
                return cb.conjunction();
            }
        };
    }

    private static Specification<Order> buildDate(String field, String op, String value) {
        return (root, query, cb) -> {
            // ISO-8601 expected; between uses comma
            switch (op) {
                case "between":
                    {
                        String[] parts = value.split(",", -1);
                        if (parts.length != 2) return cb.conjunction();
                        String leftRaw = parts[0].trim();
                        String rightRaw = parts[1].trim();
                        boolean hasLeft = !leftRaw.isEmpty();
                        boolean hasRight = !rightRaw.isEmpty();
                        try {
                            if (hasLeft && hasRight) {
                                LocalDateTime a = LocalDateTime.parse(leftRaw);
                                LocalDateTime b = LocalDateTime.parse(rightRaw);
                                return cb.between(root.get(field), a, b);
                            } else if (hasLeft) {
                                LocalDateTime a = LocalDateTime.parse(leftRaw);
                                return cb.greaterThanOrEqualTo(root.get(field), a);
                            } else if (hasRight) {
                                LocalDateTime b = LocalDateTime.parse(rightRaw);
                                return cb.lessThanOrEqualTo(root.get(field), b);
                            } else {
                                return cb.conjunction();
                            }
                        } catch (Exception e) {
                            return cb.conjunction();
                        }
                    }
                case "gt":
                    return cb.greaterThan(root.get(field), LocalDateTime.parse(value));
                case "gte":
                    return cb.greaterThanOrEqualTo(root.get(field), LocalDateTime.parse(value));
                case "lt":
                    return cb.lessThan(root.get(field), LocalDateTime.parse(value));
                case "lte":
                    return cb.lessThanOrEqualTo(root.get(field), LocalDateTime.parse(value));
                case "eq":
                default:
                    return cb.equal(root.get(field), LocalDateTime.parse(value));
            }
        };
    }

    private static Specification<Order> buildEnum(String field, String op, String value) {
        return (root, query, cb) -> {
            Class<?> javaType = root.get(field).getJavaType();
            if (!javaType.isEnum()) {
                return cb.conjunction();
            }
            @SuppressWarnings({"rawtypes", "unchecked"})
            Enum enumValue =
                    Enum.valueOf((Class<? extends Enum>) javaType.asSubclass(Enum.class), value);
            return cb.equal(root.get(field), enumValue);
        };
    }
}
