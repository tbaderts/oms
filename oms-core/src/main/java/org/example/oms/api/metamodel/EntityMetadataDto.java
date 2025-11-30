package org.example.oms.api.metamodel;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Complete metadata for a domain entity (e.g., Order, Execution). Used by UI to dynamically
 * configure blotter tables.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EntityMetadataDto {

    /** Entity name (e.g., "Order", "Execution") */
    private String name;

    /** Display name for UI (e.g., "Orders", "Executions") */
    private String displayName;

    /** List of field metadata */
    private List<FieldMetadataDto> fields;

    /** Default columns to display in UI */
    private List<String> defaultColumns;

    /** Default sort specification (e.g., "sendingTime,DESC") */
    private String defaultSort;

    /** Primary key field name */
    private String primaryKey;
}
