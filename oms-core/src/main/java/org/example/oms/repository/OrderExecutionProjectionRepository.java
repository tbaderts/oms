package org.example.oms.repository;

import java.util.Optional;

import org.example.oms.model.OrderExecutionView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

/** The order-execution projection (SPEC-0020): written by the projection, read by the query API. */
@Repository
public interface OrderExecutionViewRepository
        extends JpaRepository<OrderExecutionView, Long>, JpaSpecificationExecutor<OrderExecutionView> {

    Optional<OrderExecutionView> findByOrderIdAndExecId(String orderId, String execId);
}
