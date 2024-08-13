package org.oms.transactions.api;

import org.oms.transactions.model.Order;
import org.oms.transactions.service.OrderRepository;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Mono;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;


@RestController
public class OrderController {

    private OrderRepository orderRepository;

    public OrderController(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @PostMapping("/order")
    public Mono<Order> postMethodName(@RequestBody Order order) {
        return Mono.just(orderRepository.save(order));
    }

    @GetMapping("/order/{orderId}")
    public Mono<Order> findByClOrdId(@RequestParam String orderId) {
        return Mono.just(orderRepository.findByClOrdId(orderId));
    }
    
}
