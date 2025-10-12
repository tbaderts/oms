package org.example.oms.api.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record OrderDto(
        String orderId,
        String rootOrderId,
        String parentOrderId,
        String symbol,
        String side,
        String state,
        String ordType,
        BigDecimal price,
        BigDecimal orderQty,
        LocalDateTime transactTime) {}
