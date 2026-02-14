package org.example.oms.service;

import java.util.List;

import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderEventReadService {

    private final OrderEventRepository orderEventRepository;

    public List<OrderEvent> findByOrderId(String orderId) {
        return orderEventRepository.findByOrderId(orderId);
    }
}
