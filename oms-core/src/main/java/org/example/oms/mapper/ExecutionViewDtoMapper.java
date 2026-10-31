package org.example.oms.mapper;

import java.util.List;

import org.example.common.model.query.ExecutionViewDto;
import org.example.oms.model.OrderExecutionView;
import org.mapstruct.InjectionStrategy;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

/**
 * Maps order-execution projection rows to the generated query DTO (SPEC-0020). Field names match;
 * timestamps go through {@link QueryOrderDtoMapper}'s conversion, as search results do.
 */
@Mapper(
        componentModel = "spring",
        uses = QueryOrderDtoMapper.class,
        injectionStrategy = InjectionStrategy.CONSTRUCTOR)
public interface ExecutionViewDtoMapper {

    @Mapping(target = "transactTime", source = "transactTime", qualifiedByName = "toOffsetDateTime")
    ExecutionViewDto toExecutionViewDto(OrderExecutionView row);

    List<ExecutionViewDto> toExecutionViewDtos(List<OrderExecutionView> rows);
}
