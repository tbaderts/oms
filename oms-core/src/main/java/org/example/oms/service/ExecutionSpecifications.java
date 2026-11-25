package org.example.oms.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.example.common.model.Execution;
import org.springframework.data.jpa.domain.Specification;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import lombok.extern.slf4j.Slf4j;

/**
 * Dynamic filters for the execution search (SPEC-0070), in the order search's language
 * ({@link OrderSpecifications}): a parameter {@code field} means equals, {@code field__op} applies
 * {@code like}, {@code gt}, {@code gte}, {@code lt}, {@code lte} or {@code between} ({@code a,b},
 * either side may be empty). Strings compare by equals or a case-insensitive {@code like}; numbers
 * and {@code transactTime} by comparison; enums by equals only. Unknown fields and blank values are
 * ignored, as in the order search. A malformed number or time is ignored too; an enum value that
 * does not exist matches nothing.
 *
 * @see <a href="file:///oms-knowledge-base/framework/query-engine.md">Query Engine</a>
 */
@Slf4j
public final class ExecutionSpecifications {

    /** How a field is compared. */
    public enum Kind {
        STRING,
        NUMBER,
        TIME,
        ENUM
    }

    /** One filter read from the request. */
    public record Filter(String field, String op, String value, Kind kind) {}

    /** Every field of an {@code ExecutionDto} a caller may filter on, in the contract's order. */
    static final Map<String, Kind> FILTERABLE = filterable();

    private ExecutionSpecifications() {}

    private static Map<String, Kind> filterable() {
        Map<String, Kind> fields = new LinkedHashMap<>();
        for (String f : List.of("execId", "orderId", "rootOrderId", "symbol", "securityId", "execType", "lastMkt",
                "lastCapacity")) {
            fields.put(f, Kind.STRING);
        }
        for (String f : List.of("lastQty", "lastPx", "cumQty", "leavesQty", "avgPx", "orderVersion")) {
            fields.put(f, Kind.NUMBER);
        }
        fields.put("transactTime", Kind.TIME);
        fields.put("status", Kind.ENUM);
        fields.put("securityIdSource", Kind.ENUM);
        return Collections.unmodifiableMap(fields);
    }

    /** The filters in {@code params}, in their order, skipping unknown fields and blank values. */
    public static List<Filter> parse(Map<String, String> params) {
        List<Filter> filters = new ArrayList<>();
        params.forEach((key, value) -> {
            if (value == null || value.isBlank()) {
                return;
            }
            String k = key.trim();
            int idx = k.indexOf("__");
            String field = idx > 0 ? k.substring(0, idx) : k;
            String op = idx > 0 ? k.substring(idx + 2) : "eq";
            Kind kind = FILTERABLE.get(field);
            if (kind == null) {
                log.warn("Unknown execution filter field ignored: {}", field);
                return;
            }
            filters.add(new Filter(field, op, value, kind));
        });
        return filters;
    }

    /** All filters in {@code params}, combined with AND. */
    public static Specification<Execution> dynamic(Map<String, String> params) {
        return (root, query, cb) -> cb.and(parse(params).stream()
                .map(f -> predicate(f, root, cb))
                .toArray(Predicate[]::new));
    }

    private static Predicate predicate(Filter f, Root<Execution> root, CriteriaBuilder cb) {
        return switch (f.kind()) {
            case STRING -> "like".equals(f.op())
                    ? cb.like(cb.lower(root.get(f.field())), "%" + f.value().toLowerCase().replace("%", "") + "%")
                    : cb.equal(root.get(f.field()), f.value());
            case NUMBER -> compare(f, root.get(f.field()), cb, raw -> number(root.get(f.field()).getJavaType(), raw));
            case TIME -> compare(f, root.get(f.field()), cb, Instant::parse);
            case ENUM -> enumEquals(f, root, cb);
        };
    }

    /** Numbers are compared in the attribute's own type: BigDecimal for quantities, Long for versions. */
    private static Comparable<?> number(Class<?> type, String raw) {
        return Long.class.equals(type) ? Long.valueOf(raw.trim()) : new BigDecimal(raw.trim());
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static Predicate compare(
            Filter f, Expression attribute, CriteriaBuilder cb, Function<String, Comparable<?>> parse) {
        try {
            if ("between".equals(f.op())) {
                String[] parts = f.value().split(",", -1);
                if (parts.length != 2) {
                    return cb.conjunction();
                }
                String left = parts[0].trim();
                String right = parts[1].trim();
                List<Predicate> bounds = new ArrayList<>();
                if (!left.isEmpty()) {
                    bounds.add(cb.greaterThanOrEqualTo(attribute, (Comparable) parse.apply(left)));
                }
                if (!right.isEmpty()) {
                    bounds.add(cb.lessThanOrEqualTo(attribute, (Comparable) parse.apply(right)));
                }
                return cb.and(bounds.toArray(Predicate[]::new));
            }
            Comparable value = parse.apply(f.value());
            return switch (f.op()) {
                case "gt" -> cb.greaterThan(attribute, value);
                case "gte" -> cb.greaterThanOrEqualTo(attribute, value);
                case "lt" -> cb.lessThan(attribute, value);
                case "lte" -> cb.lessThanOrEqualTo(attribute, value);
                default -> cb.equal(attribute, value);
            };
        } catch (NumberFormatException | DateTimeParseException e) {
            log.warn("Invalid execution filter value ignored: {}={}", f.field(), f.value());
            return cb.conjunction();
        }
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static Predicate enumEquals(Filter f, Root<Execution> root, CriteriaBuilder cb) {
        Class type = root.get(f.field()).getJavaType();
        try {
            return cb.equal(root.get(f.field()), Enum.valueOf(type, f.value().trim()));
        } catch (IllegalArgumentException e) {
            // No execution has a value that does not exist.
            return cb.disjunction();
        }
    }
}
