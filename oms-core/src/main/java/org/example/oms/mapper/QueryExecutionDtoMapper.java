package org.example.oms.mapper;

import java.util.List;
import org.example.common.model.Execution;
import org.example.common.model.query.ExecutionDto;
import org.example.common.model.query.PageMetadata;
import org.example.common.model.query.PagedExecutionDto;
import org.mapstruct.InjectionStrategy;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;
import org.springframework.data.domain.Page;

/**
 * Maps stored executions to the execution search's DTOs (SPEC-0070). Field and enum names match;
 * timestamps go through {@link QueryOrderDtoMapper}'s conversion, as the other query results do.
 */
@Mapper(
        componentModel = "spring",
        uses = QueryOrderDtoMapper.class,
        injectionStrategy = InjectionStrategy.CONSTRUCTOR,
        unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface QueryExecutionDtoMapper {

    @Mapping(target = "transactTime", source = "transactTime", qualifiedByName = "toOffsetDateTime")
    ExecutionDto toExecutionDto(Execution execution);

    List<ExecutionDto> toExecutionDtos(List<Execution> executions);

    default PagedExecutionDto toPagedExecutionDto(Page<Execution> page) {
        return PagedExecutionDto.builder()
                .content(toExecutionDtos(page.getContent()))
                .page(PageMetadata.builder()
                        .size(page.getSize())
                        .totalElements((int) page.getTotalElements())
                        .totalPages(page.getTotalPages())
                        .number(page.getNumber())
                        .build())
                .build();
    }
}
