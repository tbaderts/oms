package org.example.streaming.service;

import java.util.List;

import org.example.streaming.model.ObjectMetadata;
import org.example.streaming.model.ObjectMetadata.FieldMetadata;
import org.springframework.stereotype.Service;

/**
 * Service for providing metadata about domain objects.
 * 
 * <p>Describes available fields, data types, and filtering capabilities
 * for the Trade Blotter UI to build dynamic filter interfaces.
 */
@Service
public class MetadataService {

    /**
     * Returns metadata for Order objects.
     */
    public ObjectMetadata getOrderMetadata() {
        return ObjectMetadata.builder()
                .objectType("Order")
                .fields(List.of(
                        field("orderId", "String", "Unique order identifier", true, true),
                        field("clOrdId", "String", "Client Order ID (FIX Tag 11)", true, true),
                        field("parentOrderId", "String", "Parent order ID for child orders", true, true),
                        field("rootOrderId", "String", "Root order ID for order hierarchy", true, true),
                        field("account", "String", "Trading account", true, true),
                        field("symbol", "String", "Security symbol", true, true),
                        field("side", "Enum", "Order side: BUY, SELL, SELL_SHORT", true, true),
                        field("ordType", "Enum", "Order type: MARKET, LIMIT, STOP", true, true),
                        field("state", "Enum", "Order state: NEW, LIVE, FILLED, CXL, REJ", true, true),
                        field("cancelState", "Enum", "Cancel state: CXL, PCXL, PMOD, REJ", true, true),
                        field("orderQty", "Decimal", "Order quantity", true, true),
                        field("cumQty", "Decimal", "Cumulative filled quantity", true, true),
                        field("leavesQty", "Decimal", "Remaining quantity", true, true),
                        field("price", "Decimal", "Limit price", true, true),
                        field("avgPx", "Decimal", "Average execution price", true, true),
                        field("stopPx", "Decimal", "Stop price", true, true),
                        field("timeInForce", "Enum", "Time in force: DAY, GTC, IOC, FOK", true, true),
                        field("securityId", "String", "Security identifier", true, true),
                        field("securityType", "Enum", "Security type: CS, OPT, FUT", true, true),
                        field("exDestination", "String", "Execution destination", true, true),
                        field("text", "String", "Free text field", true, false),
                        field("sendingTime", "Timestamp", "Order sending time", true, true),
                        field("transactTime", "Timestamp", "Last transaction time", true, true),
                        field("expireTime", "Timestamp", "Order expiration time", true, true)
                ))
                .build();
    }

    /**
     * Returns metadata for Execution objects.
     */
    public ObjectMetadata getExecutionMetadata() {
        return ObjectMetadata.builder()
                .objectType("Execution")
                .fields(List.of(
                        field("execId", "String", "Execution ID", true, true),
                        field("orderId", "String", "Associated order ID", true, true),
                        field("executionId", "String", "External execution ID", true, true),
                        field("execType", "Enum", "Execution type: NEW, FILL, PARTIAL", true, true),
                        field("lastQty", "Decimal", "Last fill quantity", true, true),
                        field("lastPx", "Decimal", "Last fill price", true, true),
                        field("cumQty", "Decimal", "Cumulative quantity", true, true),
                        field("avgPx", "Decimal", "Average price", true, true),
                        field("leavesQty", "Decimal", "Remaining quantity", true, true),
                        field("lastMkt", "String", "Last market", true, true),
                        field("lastCapacity", "String", "Last capacity", true, false),
                        field("transactTime", "Timestamp", "Transaction time", true, true),
                        field("creationDate", "Timestamp", "Creation date", true, true)
                ))
                .build();
    }

    /**
     * Returns metadata for all supported object types.
     */
    public List<ObjectMetadata> getAllMetadata() {
        return List.of(getOrderMetadata(), getExecutionMetadata());
    }

    private FieldMetadata field(String name, String dataType, String description, 
                                boolean filterable, boolean sortable) {
        return FieldMetadata.builder()
                .name(name)
                .dataType(dataType)
                .description(description)
                .filterable(filterable)
                .sortable(sortable)
                .build();
    }
}
