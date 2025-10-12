package org.example.oms.model;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import org.example.common.model.Order;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
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
@Table(name = "order_messages")
@SuperBuilder
@EqualsAndHashCode
@NoArgsConstructor
@Getter
public class OrderOutbox {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_outbox_sequence")
    @SequenceGenerator(
            name = "order_outbox_sequence",
            sequenceName = "order_outbox_seq",
            allocationSize = 1)
    private Long id;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", name = "outbound_order")
    private Order order;

    @Override
    public String toString() {
        return ReflectionToStringBuilder.toString(this, ToStringStyle.JSON_STYLE);
    }
}
