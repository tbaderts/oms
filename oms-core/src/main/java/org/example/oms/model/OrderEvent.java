package org.example.oms.model;

import java.time.LocalDateTime;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import org.example.common.model.cmd.Command;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@Table(name = "order_events")
@SuperBuilder
@EqualsAndHashCode
@NoArgsConstructor
@Getter
public class OrderEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_event_sequence")
    @SequenceGenerator(
            name = "order_event_sequence",
            sequenceName = "order_event_seq",
            allocationSize = 1)
    private Long id;

    private String orderId;

    @Enumerated(EnumType.STRING)
    private Event event;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Command transaction;

    private LocalDateTime timeStamp;

    @Override
    public String toString() {
        return ReflectionToStringBuilder.toString(this, ToStringStyle.JSON_STYLE);
    }
}
