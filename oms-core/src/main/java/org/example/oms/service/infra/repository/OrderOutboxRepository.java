package org.example.oms.service.infra.repository;

import org.example.oms.model.OrderOutbox;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OrderOutboxRepository extends JpaRepository<OrderOutbox, Long> {}
