package org.example.oms.service;

import java.util.Map;

import org.example.common.model.Order;
import org.springframework.data.domain.Page;

/**
 * A page of orders together with each order's latest event-log version (orderId → version), read
 * in one snapshot so the version always matches the state on the page.
 */
public record OrderSearchResult(Page<Order> orders, Map<String, Long> eventVersions) {}
