package org.example.oms.mapper;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.mapstruct.*;

/**
 * MapStruct mapper for converting between Order domain entities and command/query DTOs.
 * Uses MapStruct annotation processor for compile-time type-safe mapping.
 *
 * <p>Mapping features:
 * <ul>
 *   <li>Command API (cmd) to domain entity mapping with field ignoring</li>
 *   <li>Domain entity to command API mapping</li>
 *   <li>OffsetDateTime ↔ Instant conversion for timestamp fields</li>
 *   <li>Ignores derived/calculated fields (cumQty, leavesQty, state)</li>
 * </ul>
 *
 * @see <a href="file:///oms-knowledge-base/oms-framework/openapi-contracts.md">OpenAPI Contracts - MapStruct Integration</a>
 * @see <a href="file:///oms-knowledge-base/oms-framework/domain-model_spec.md">Domain Model - Order Entity Mapping</a>
 */
@Mapper(componentModel = "spring")
public interface OrderMapper {
    @Mapping(target = "sendingTime", source = "sendingTime", qualifiedByName = "offsetToInstant")
    @Mapping(target = "expireTime", source = "expireTime", qualifiedByName = "offsetToInstant")
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "transactTime", ignore = true)
    @Mapping(target = "tifTimestamp", ignore = true)
    @Mapping(target = "state", ignore = true)
    @Mapping(target = "cancelState", ignore = true)
    @Mapping(target = "allocQty", ignore = true)
    @Mapping(target = "cumQty", ignore = true)
    @Mapping(target = "leavesQty", ignore = true)
    @Mapping(target = "leg", ignore = true)
    @Mapping(target = "placeQty", ignore = true)
    @Mapping(target = "txNr", ignore = true)
    // SLA checkpoints are stamped by the OMS on its own clock and are deliberately absent from the
    // command contract. A client that could set its own ackTime could report any latency it liked.
    @Mapping(target = "orderReceivedTime", ignore = true)
    @Mapping(target = "ackTime", ignore = true)
    @Mapping(target = "marketSendTime", ignore = true)
    @Mapping(target = "marketAckTime", ignore = true)
    Order toOrder(org.example.common.model.cmd.Order cmdOrder);

    @Mapping(target = "sendingTime", source = "sendingTime", qualifiedByName = "instantToOffset")
    @Mapping(target = "expireTime", source = "expireTime", qualifiedByName = "instantToOffset")
    org.example.common.model.cmd.Order toCmdOrder(Order order);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "creationDate", ignore = true)
    @Mapping(target = "executionId", ignore = true)
    @Mapping(target = "avgPx", ignore = true)
    @Mapping(target = "execID", source = "execId")
    @Mapping(target = "transactTime", source = "transactTime", qualifiedByName = "offsetToInstant")
    @Mapping(target = "dayOrderQty", ignore = true)
    @Mapping(target = "dayCumQty", ignore = true)
    @Mapping(target = "dayAvgPx", ignore = true)
    @Mapping(target = "secondaryExecID", ignore = true)
    Execution toExecution(org.example.common.model.cmd.Execution cmdExecution);

    /**
     * Maps a fill received over Kafka to the command model. Explicit rather than Jackson
     * {@code convertValue}: Avro records expose {@code getSchema()}, which Jackson tries to
     * serialize and fails on.
     */
    @Mapping(target = "transactTime", source = "transactTime", qualifiedByName = "instantToOffset")
    org.example.common.model.cmd.Execution toCmdExecution(
            org.example.common.model.msg.Execution message);

    /**
     * Maps an order received over Kafka to the command model, for the same reason as
     * {@link #toCmdExecution}: Jackson's {@code convertValue} fails on Avro records. Order creation
     * over Kafka used that and could never succeed; found by SPEC-0039.
     */
    @Mapping(target = "sendingTime", source = "sendingTime", qualifiedByName = "isoToOffset")
    @Mapping(target = "expireTime", source = "expireTime", qualifiedByName = "isoToOffset")
    org.example.common.model.cmd.Order toCmdOrder(org.example.common.model.msg.Order message);

    /** The Avro order carries its timestamps as ISO-8601 strings. */
    @Named("isoToOffset")
    public static OffsetDateTime isoToOffset(String value) {
        return value == null || value.isBlank() ? null : OffsetDateTime.parse(value);
    }

    @Named("offsetToInstant")
    public static Instant offsetToInstant(OffsetDateTime odt) {
        return odt == null ? null : odt.toInstant();
    }

    @Named("instantToOffset")
    public static OffsetDateTime instantToOffset(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
