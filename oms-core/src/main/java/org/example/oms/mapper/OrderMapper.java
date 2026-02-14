package org.example.oms.mapper;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.mapstruct.*;

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
    Order toOrder(org.example.common.model.cmd.Order cmdOrder);

    @Mapping(target = "sendingTime", source = "sendingTime", qualifiedByName = "instantToOffset")
    @Mapping(target = "expireTime", source = "expireTime", qualifiedByName = "instantToOffset")
    org.example.common.model.cmd.Order toCmdOrder(Order order);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "creationDate", ignore = true)
    @Mapping(target = "executionId", ignore = true)
    @Mapping(target = "avgPx", ignore = true)
    @Mapping(target = "cumQty", ignore = true)
    @Mapping(target = "execID", ignore = true)
    @Mapping(target = "lastCapacity", ignore = true)
    @Mapping(target = "lastMkt", ignore = true)
    @Mapping(target = "lastPx", ignore = true)
    @Mapping(target = "lastQty", ignore = true)
    @Mapping(target = "transactTime", ignore = true)
    @Mapping(target = "execType", ignore = true)
    @Mapping(target = "leavesQty", ignore = true)
    @Mapping(target = "dayOrderQty", ignore = true)
    @Mapping(target = "dayCumQty", ignore = true)
    @Mapping(target = "dayAvgPx", ignore = true)
    @Mapping(target = "secondaryExecID", ignore = true)
    Execution toExecution(org.example.common.model.cmd.Execution cmdExecution);

    @Named("offsetToInstant")
    public static Instant offsetToInstant(OffsetDateTime odt) {
        return odt == null ? null : odt.toInstant();
    }

    @Named("instantToOffset")
    public static OffsetDateTime instantToOffset(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
