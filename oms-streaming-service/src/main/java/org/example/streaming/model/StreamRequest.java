package org.example.streaming.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request to subscribe to a Trade Blotter stream.
 * 
 * <p>Contains the blotter identifier and optional filter criteria.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class StreamRequest {

    private String blotterId;
    private StreamFilter filter;
    private StreamType streamType;
    
    public enum StreamType {
        ORDERS,
        EXECUTIONS,
        ALL
    }
    
    public static StreamRequest ordersOnly(String blotterId) {
        return StreamRequest.builder()
                .blotterId(blotterId)
                .streamType(StreamType.ORDERS)
                .build();
    }
    
    public static StreamRequest executionsOnly(String blotterId) {
        return StreamRequest.builder()
                .blotterId(blotterId)
                .streamType(StreamType.EXECUTIONS)
                .build();
    }
}
