package org.example.oms.mapper;

import java.util.List;

import org.example.common.model.query.OrderEventDto;
import org.example.oms.model.OrderEvent;
import org.mapstruct.InjectionStrategy;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

/**
 * Maps event-log entries to the generated query DTO (SPEC-0035). The snapshot and timestamps reuse
 * {@link QueryOrderDtoMapper}, so a snapshot has the same shape as a search result; the command
 * goes through {@link CommandJsonConverter} so it keeps its {@code type}. The event kind
 * is mapped by name: an {@code Event} value missing from the contract's {@code OrderEventType} fails
 * compilation here.
 */
@Mapper(
        componentModel = "spring",
        uses = {QueryOrderDtoMapper.class, CommandJsonConverter.class},
        injectionStrategy = InjectionStrategy.CONSTRUCTOR)
public interface OrderEventDtoMapper {

    @Mapping(target = "transaction", source = "transaction", qualifiedByName = "toTransaction")
    OrderEventDto toOrderEventDto(OrderEvent event);

    List<OrderEventDto> toOrderEventDtos(List<OrderEvent> events);
}
