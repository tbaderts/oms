package org.oms.transactions.api;

import org.oms.transactions.model.Order;
import org.oms.transactions.service.OrderRepository;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

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
        return Mono.just(orderRepository.save(order)).publishOn(Schedulers.boundedElastic());
    }

    @GetMapping("/orders")
    public Mono<Iterable<Order>> findAll() {
        return Mono.just(orderRepository.findAll()).publishOn(Schedulers.boundedElastic());
    }

    @GetMapping("/order/{clOrdId}")
    public Mono<Order> findByClOrdId(@RequestParam String clOrdId) {
        return Mono.just(orderRepository.findByClOrdId(clOrdId)).publishOn(Schedulers.boundedElastic());
    }
    
}
