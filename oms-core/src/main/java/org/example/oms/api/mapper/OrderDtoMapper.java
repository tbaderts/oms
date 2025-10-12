package org.example.oms.api.mapper;

import java.util.List;

import org.example.common.model.Order;
import org.example.oms.api.dto.OrderDto;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface OrderDtoMapper {

    @Mapping(
            target = "side",
            expression = "java(order.getSide()!=null ? order.getSide().name() : null)")
    @Mapping(
            target = "state",
            expression = "java(order.getState()!=null ? order.getState().name() : null)")
    @Mapping(
            target = "ordType",
            expression = "java(order.getOrdType()!=null ? order.getOrdType().name() : null)")
    OrderDto toDto(Order order);

    List<OrderDto> toDtos(List<Order> orders);
}
