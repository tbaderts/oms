package org.example.oms.service;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.oms.api.metamodel.EntityMetadataDto;
import org.example.oms.api.metamodel.EnumValueDto;
import org.example.oms.api.metamodel.FieldMetadataDto;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.persistence.Enumerated;
import lombok.extern.slf4j.Slf4j;

/**
 * Service that generates metamodel information for domain entities using reflection. Analyzes
 * entity classes to extract field types, available operations, and configuration for UI components.
 */
@Service
@Slf4j
public class MetamodelService {

    private final Map<String, EntityMetadataDto> entityMetadata = new HashMap<>();

    /**
     * The fields the executions blotter offers (SPEC-0068): the FIX ExecutionReport fields the OMS
     * records for a fill, in reading order. ExecID (17), OrderID (37), the Instrument block the venue
     * reported (Symbol 55, SecurityID 48; SPEC-0069), ExecType (150), LastQty
     * (32), LastPx (31), LastMkt (30), LeavesQty (151), CumQty (14), AvgPx (6), TransactTime (60),
     * plus the OMS's own status (applied or reversed). Fields that are never filled (the day-order
     * fields, SecondaryExecID, creationDate, LastCapacity until a venue sends it, ExecRefID until
     * busts exist) and internal bookkeeping (id, orderVersion, rootOrderId, bustedAtVersion) stay on
     * the entity and the APIs but are not offered. A ticket that fills one adds it here, as
     * SPEC-0030 will for execRefId.
     */
    static final List<String> EXECUTION_FIELDS = List.of(
            "execId", "orderId", "symbol", "securityId", "execType", "lastQty", "lastPx", "lastMkt",
            "leavesQty", "cumQty", "avgPx", "transactTime", "status");

    /**
     * The executions blotter's default columns. The streaming ExecutionDto must carry each of them:
     * oms-streaming-service's ExecutionMessageMapperTest holds a copy of this list, so change both
     * together.
     */
    static final List<String> EXECUTION_DEFAULT_COLUMNS = List.of(
            "execId", "orderId", "symbol", "execType", "lastQty", "lastPx", "lastMkt",
            "cumQty", "leavesQty", "avgPx", "transactTime");

    // Fields that support query operations in OrderSpecifications
    private static final Set<String> ORDER_STRING_FIELDS =
            Set.of(
                    "orderId",
                    "rootOrderId",
                    "parentOrderId",
                    "clOrdId",
                    "account",
                    "symbol",
                    "securityId");
    private static final Set<String> ORDER_NUMERIC_FIELDS =
            Set.of("price", "orderQty", "cashOrderQty");
    private static final Set<String> ORDER_DATE_FIELDS =
            Set.of("sendingTime", "transactTime", "expireTime");
    private static final Set<String> ORDER_ENUM_FIELDS =
            Set.of("side", "ordType", "state", "cancelState");

    @PostConstruct
    public void initialize() {
        log.info("Initializing metamodel service...");
        entityMetadata.put("Order", buildOrderMetadata());
        entityMetadata.put("Execution", buildExecutionMetadata());
        log.info(
                "Metamodel initialized with entities: {}",
                entityMetadata.keySet().stream().sorted().collect(Collectors.joining(", ")));
    }

    /**
     * Get metadata for all available entities.
     *
     * @return Map of entity name to metadata
     */
    public Map<String, EntityMetadataDto> getAllMetadata() {
        return new HashMap<>(entityMetadata);
    }

    /**
     * Get metadata for a specific entity.
     *
     * @param entityName Entity name (e.g., "Order", "Execution")
     * @return Entity metadata or null if not found
     */
    public EntityMetadataDto getEntityMetadata(String entityName) {
        return entityMetadata.get(entityName);
    }

    /**
     * List all available entity names.
     *
     * @return List of entity names
     */
    public List<String> listEntities() {
        return new ArrayList<>(entityMetadata.keySet());
    }

    private EntityMetadataDto buildOrderMetadata() {
        List<FieldMetadataDto> fields = new ArrayList<>();

        // Use reflection to analyze Order class
        Field[] declaredFields = Order.class.getDeclaredFields();
        for (Field field : declaredFields) {
            try {
                String fieldName = field.getName();
                Class<?> fieldType = field.getType();

                // Skip internal fields
                if (fieldName.equals("serialVersionUID")) {
                    continue;
                }

                FieldMetadataDto fieldMeta =
                        buildFieldMetadata(fieldName, fieldType, field, true);
                fields.add(fieldMeta);
            } catch (Exception e) {
                log.warn("Failed to process field {} in Order: {}", field.getName(), e.getMessage());
            }
        }

        return EntityMetadataDto.builder()
                .name("Order")
                .displayName("Orders")
                .primaryKey("id")
                .fields(fields)
                .defaultColumns(
                        List.of(
                                "orderId",
                                "clOrdId",
                                "side",
                                "orderQty",
                                "ordType",
                                "price",
                                "symbol",
                                "state",
                                "timeInForce",
                                "securityId",
                                "transactTime"))
                .defaultSort("transactTime,DESC")
                .build();
    }

    private EntityMetadataDto buildExecutionMetadata() {
        List<FieldMetadataDto> fields = new ArrayList<>();

        // Only the execution report fields, in order (SPEC-0068); see EXECUTION_FIELDS.
        for (String fieldName : EXECUTION_FIELDS) {
            try {
                Field field = Execution.class.getDeclaredField(fieldName);
                fields.add(buildFieldMetadata(fieldName, field.getType(), field, false));
            } catch (Exception e) {
                log.error("Execution has no field {} listed in EXECUTION_FIELDS: {}", fieldName, e.getMessage());
            }
        }

        return EntityMetadataDto.builder()
                .name("Execution")
                .displayName("Executions")
                // A fill is identified by its business key (orderId, execId), as an order is by
                // orderId (SPEC-0041). The surrogate id is no longer offered (SPEC-0068).
                .primaryKey("execId")
                .fields(fields)
                .defaultColumns(EXECUTION_DEFAULT_COLUMNS)
                .defaultSort("transactTime,DESC")
                .build();
    }

    private FieldMetadataDto buildFieldMetadata(
            String fieldName, Class<?> fieldType, Field field, boolean isOrder) {
        FieldMetadataDto.FieldMetadataDtoBuilder builder = FieldMetadataDto.builder();

        builder.name(fieldName);
        builder.displayName(formatDisplayName(fieldName));
        builder.sortable(true); // Most fields are sortable

        // Determine field type and operations
        String type = determineFieldType(fieldType, field);
        builder.type(type);

        // Set filterability and operations based on OrderSpecifications support
        if (isOrder) {
            configureOrderFieldOperations(builder, fieldName, type);
        } else {
            // For Execution, basic filtering support
            builder.filterable(true);
            builder.filterOperations(getBasicOperations(type));
        }

        // Handle enums
        if (field.isAnnotationPresent(Enumerated.class) && fieldType.isEnum()) {
            try {
                builder.enumValues(extractEnumValues(fieldType));
            } catch (Exception e) {
                log.warn("Failed to extract enum values for {}: {}", fieldName, e.getMessage());
                builder.enumValues(Collections.emptyList());
            }
        }

        // Determine if required (simplified - ID is required, others optional)
        builder.required(fieldName.equals("id"));

        // Set width hints
        builder.width(determineColumnWidth(fieldName, type));

        return builder.build();
    }

    private void configureOrderFieldOperations(
            FieldMetadataDto.FieldMetadataDtoBuilder builder, String fieldName, String type) {
        if (ORDER_STRING_FIELDS.contains(fieldName)) {
            builder.filterable(true);
            builder.filterOperations(List.of("eq", "like"));
        } else if (ORDER_NUMERIC_FIELDS.contains(fieldName)) {
            builder.filterable(true);
            builder.filterOperations(List.of("eq", "gt", "gte", "lt", "lte", "between"));
        } else if (ORDER_DATE_FIELDS.contains(fieldName)) {
            builder.filterable(true);
            builder.filterOperations(List.of("eq", "gt", "gte", "lt", "lte", "between"));
        } else if (ORDER_ENUM_FIELDS.contains(fieldName)) {
            builder.filterable(true);
            builder.filterOperations(List.of("eq"));
        } else {
            // Field not supported in OrderSpecifications
            builder.filterable(false);
            builder.filterOperations(Collections.emptyList());
        }
    }

    private List<String> getBasicOperations(String type) {
        return switch (type) {
            case "string" -> List.of("eq", "like");
            case "number" -> List.of("eq", "gt", "gte", "lt", "lte", "between");
            case "date" -> List.of("eq", "gt", "gte", "lt", "lte", "between");
            case "enum" -> List.of("eq");
            case "boolean" -> List.of("eq");
            default -> Collections.emptyList();
        };
    }

    private String determineFieldType(Class<?> fieldType, Field field) {
        if (field.isAnnotationPresent(Enumerated.class) || fieldType.isEnum()) {
            return "enum";
        }
        if (fieldType.equals(String.class)) {
            return "string";
        }
        if (fieldType.equals(Integer.class)
                || fieldType.equals(int.class)
                || fieldType.equals(Long.class)
                || fieldType.equals(long.class)
                || fieldType.equals(BigDecimal.class)
                || fieldType.equals(Double.class)
                || fieldType.equals(double.class)) {
            return "number";
        }
        if (fieldType.equals(Instant.class) || fieldType.equals(LocalDate.class)) {
            return "date";
        }
        if (fieldType.equals(Boolean.class) || fieldType.equals(boolean.class)) {
            return "boolean";
        }
        return "object";
    }

    private List<EnumValueDto> extractEnumValues(Class<?> enumClass) {
        if (!enumClass.isEnum()) {
            return Collections.emptyList();
        }

        Object[] enumConstants = enumClass.getEnumConstants();
        List<EnumValueDto> values = new ArrayList<>();
        for (Object constant : enumConstants) {
            Enum<?> enumConstant = (Enum<?>) constant;
            values.add(
                    EnumValueDto.builder()
                            .value(enumConstant.name())
                            .label(formatEnumLabel(enumConstant.name()))
                            .build());
        }
        return values;
    }

    /** Domain codes an enum constant may contain; they stay as they are in a label (SPEC-0058). */
    private static final Set<String> ENUM_ACRONYMS = Set.of(
            "ISIN", "RIC", "CLI", "MKT", "CS", "FUT", "OPT", "ETF", "ETN", "MF",
            "CXL", "PCXL", "PMOD", "REJ", "EXP", "OK", "GTC", "IOC", "FOK");

    /**
     * The label of an enum constant, as a badge shows it (SPEC-0058): words split on '_', each in
     * Title case except domain codes. {@code SELL_SHORT -> "Sell Short"}, {@code CXL -> "CXL"}.
     * Not {@link #formatDisplayName}: that splits camelCase field names, and on an all-caps constant
     * puts a space before every letter.
     */
    static String formatEnumLabel(String constant) {
        return Arrays.stream(constant.split("_"))
                .filter(word -> !word.isEmpty())
                .map(word -> ENUM_ACRONYMS.contains(word)
                        ? word
                        : word.charAt(0) + word.substring(1).toLowerCase(Locale.ROOT))
                .collect(Collectors.joining(" "));
    }

    private String formatDisplayName(String fieldName) {
        // Convert camelCase to Title Case with spaces
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < fieldName.length(); i++) {
            char c = fieldName.charAt(i);
            if (i == 0) {
                result.append(Character.toUpperCase(c));
            } else if (Character.isUpperCase(c)) {
                result.append(' ').append(c);
            } else {
                result.append(c);
            }
        }
        return result.toString();
    }

    private Integer determineColumnWidth(String fieldName, String type) {
        // Provide sensible default widths
        if (fieldName.equals("id")) {
            return 80;
        }
        return switch (type) {
            case "date" -> 180;
            case "number" -> 100;
            case "enum" -> 120;
            case "boolean" -> 80;
            default -> 150; // string, object
        };
    }
}
