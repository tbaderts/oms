package org.example.common.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Entity
@Table(name = "quotes")
@SuperBuilder
@EqualsAndHashCode
@NoArgsConstructor
@Getter
public class Quote {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "quote_sequence")
    @SequenceGenerator(name = "quote_sequence", sequenceName = "quote_seq", allocationSize = 1)
    private Long id;

    private String symbol;
    private BigDecimal price;
    private LocalDateTime timestamp;

    @Override
    public String toString() {
        return ReflectionToStringBuilder.toString(this, ToStringStyle.JSON_STYLE);
    }
}
