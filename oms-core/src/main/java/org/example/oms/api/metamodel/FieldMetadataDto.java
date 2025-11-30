package org.example.oms.api.metamodel;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Metadata for a single field in a domain entity. Used by UI to configure column display,
 * filtering, and sorting.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FieldMetadataDto {

    /** Field name (Java property name) */
    private String name;

    /** Display name for UI (human-readable) */
    private String displayName;

    /** Field type: string, number, date, boolean, enum, object */
    private String type;

    /** Whether field is required */
    private Boolean required;

    /** Available filter operations for this field: eq, like, gt, gte, lt, lte, between */
    private List<String> filterOperations;

    /** Whether field supports sorting */
    private Boolean sortable;

    /** Whether field supports filtering */
    private Boolean filterable;

    /** Suggested column width in pixels */
    private Integer width;

    /** Minimum column width in pixels */
    private Integer minWidth;

    /** Maximum column width in pixels */
    private Integer maxWidth;

    /** Enum values if type is 'enum' */
    private List<EnumValueDto> enumValues;

    /** True if field is a complex nested object */
    private Boolean isComplexObject;

    /** Type name for complex objects */
    private String complexObjectType;
}
