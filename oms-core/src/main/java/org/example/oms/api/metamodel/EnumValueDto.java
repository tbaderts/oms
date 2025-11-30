package org.example.oms.api.metamodel;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Represents a possible value for an enum field. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EnumValueDto {

    /** Enum constant name */
    private String value;

    /** Human-readable label for UI display */
    private String label;
}
