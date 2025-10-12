package org.example.oms.service.infra.repository;

import java.util.List;

import org.example.oms.model.OrderEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OrderEventRepository extends JpaRepository<OrderEvent, Long> {

    List<OrderEvent> findByOrderId(String orderId);
}
