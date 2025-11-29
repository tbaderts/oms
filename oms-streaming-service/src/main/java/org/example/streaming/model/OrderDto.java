package org.example.streaming.model;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Order data transfer object for streaming to Trade Blotter UI.
 * 
 * <p>This DTO contains the essential order fields needed for display
 * and filtering in the Trade Blotter grid. It is designed to be 
 * serializable to JSON for RSocket streaming.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class OrderDto {

    /** Database event ID - used for deduplication when merging REST snapshot with Kafka stream */
    private Long eventId;
    
    private String orderId;
    private String parentOrderId;
    private String rootOrderId;
    private String clOrdId;
    private String account;
    private String symbol;
    private String side;
    private String ordType;
    private String state;
    private String cancelState;
    
    private BigDecimal orderQty;
    private BigDecimal cumQty;
    private BigDecimal leavesQty;
    private BigDecimal price;
    private BigDecimal avgPx;
    private BigDecimal stopPx;
    
    private String timeInForce;
    private String securityId;
    private String securityType;
    private String exDestination;
    private String text;
    
    private Instant sendingTime;
    private Instant transactTime;
    private Instant expireTime;
    
    private Long sequenceNumber;
    private Instant eventTime;
}
