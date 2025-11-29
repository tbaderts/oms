package org.example.streaming.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Metadata describing available fields for a domain object.
 * 
 * <p>Provides information for UI to build filter interfaces and display grids.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ObjectMetadata {

    private String objectType;
    private List<FieldMetadata> fields;
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FieldMetadata {
        private String name;
        private String dataType;
        private String description;
        private boolean filterable;
        private boolean sortable;
    }
}
