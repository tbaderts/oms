package org.example.oms.api.mapper;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.example.common.model.Order;
import org.example.common.model.query.OrderDto;
import org.example.common.model.query.PageMetadata;
import org.example.common.model.query.PagedOrderDto;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.mapstruct.ReportingPolicy;
import org.springframework.data.domain.Page;

/**
 * Mapper for converting domain Order entities to OpenAPI-generated query DTOs. Maps to simple
 * PagedOrderDto format with content list and page metadata.
 */
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface QueryOrderDtoMapper {

    /** Maps a domain Order entity to the generated OrderDto for query responses. */
    @Mapping(target = "transactTime", source = "transactTime", qualifiedByName = "toOffsetDateTime")
    @Mapping(target = "expireTime", source = "expireTime", qualifiedByName = "toOffsetDateTime")
    @Mapping(target = "sendingTime", source = "sendingTime", qualifiedByName = "toOffsetDateTime")
    @Mapping(target = "tifTimestamp", source = "tifTimestamp", qualifiedByName = "toOffsetDateTime")
    OrderDto toOrderDto(Order order);

    /** Converts LocalDateTime to OffsetDateTime using system default zone. */
    @Named("toOffsetDateTime")
    default OffsetDateTime toOffsetDateTime(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            return null;
        }
        return localDateTime.atZone(ZoneId.systemDefault()).toOffsetDateTime();
    }

    /** MapStruct auto-conversion method for LocalDateTime to OffsetDateTime. */
    default OffsetDateTime map(LocalDateTime localDateTime) {
        return toOffsetDateTime(localDateTime);
    }

    /** Maps a list of Order entities to OrderDto list. */
    default List<OrderDto> toOrderDtos(List<Order> orders) {
        if (orders == null) {
            return new ArrayList<>();
        }
        return orders.stream().map(this::toOrderDto).collect(Collectors.toList());
    }

    /** Converts a Spring Data Page of Orders to simple PagedOrderDto. */
    default PagedOrderDto toPagedOrderDto(Page<Order> page) {
        if (page == null) {
            return PagedOrderDto.builder().build();
        }

        // Convert orders to DTOs
        List<OrderDto> orderDtos = toOrderDtos(page.getContent());

        // Build page metadata - use Integer types as expected by PageMetadata
        PageMetadata pageMetadata =
                PageMetadata.builder()
                        .size(page.getSize())
                        .totalElements((int) page.getTotalElements())
                        .totalPages(page.getTotalPages())
                        .number(page.getNumber())
                        .build();

        // Build final paged DTO with content and page metadata
        return PagedOrderDto.builder().content(orderDtos).page(pageMetadata).build();
    }
}
