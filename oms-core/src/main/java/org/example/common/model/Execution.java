package org.example.common.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

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
@Table(name = "executions")
@SuperBuilder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@NoArgsConstructor
@Getter
public class Execution implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "execution_sequence")
    @SequenceGenerator(
            name = "execution_sequence",
            sequenceName = "execution_seq",
            allocationSize = 1)
    @EqualsAndHashCode.Include
    private Long id;

    private String orderId;
    private String executionId;
    private BigDecimal avgPx;
    private BigDecimal cumQty;
    private String execID;
    private String lastCapacity;
    private String lastMkt;
    private BigDecimal lastPx;
    private BigDecimal lastQty;
    private Instant transactTime;
    private String execType;
    private BigDecimal leavesQty;
    private BigDecimal dayOrderQty;
    private BigDecimal dayCumQty;
    private BigDecimal dayAvgPx;
    private String secondaryExecID;
    private Instant creationDate;

    @Override
    public String toString() {
        return ReflectionToStringBuilder.toString(this, ToStringStyle.JSON_STYLE);
    }
}
