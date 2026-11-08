package org.example.oms.mapper;

import java.util.List;

import org.example.common.model.query.CommandLogEntryDto;
import org.example.oms.model.CommandLogEntry;
import org.mapstruct.InjectionStrategy;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

/**
 * Maps command-log rows to the generated query DTO (SPEC-0046). Source and outcome are mapped by
 * name: a value missing from the contract's enums fails compilation here. Timestamps are UTC, as
 * {@link QueryOrderDtoMapper} renders every other one.
 */
@Mapper(
        componentModel = "spring",
        uses = QueryOrderDtoMapper.class,
        injectionStrategy = InjectionStrategy.CONSTRUCTOR)
public interface CommandLogEntryDtoMapper {

    @Mapping(target = "receivedAt", source = "receivedAt", qualifiedByName = "toOffsetDateTime")
    CommandLogEntryDto toDto(CommandLogEntry entry);

    List<CommandLogEntryDto> toDtos(List<CommandLogEntry> entries);
}
