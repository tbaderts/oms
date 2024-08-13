package org.oms.transactions.service;

import org.oms.transactions.model.Order;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OrderRepository extends CrudRepository<Order, String> {

    public Order findByOrderId(String orderId);
    public Order findByClOrdId(String clOrdId);
    public Order findByParentOrderId(String parentOrderId);
    public Order findByRootOrderId(String rootOrderId);
    
}
