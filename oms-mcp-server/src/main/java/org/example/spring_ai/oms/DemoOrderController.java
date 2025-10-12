package org.example.spring_ai.oms;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Demo controller for quick local testing of the {@link OrderQueryClient}.
 *
 * Exposes a single endpoint:
 *   GET /api/demo/orders
 *
 * Behavior:
 * - Calls {@code OrderQueryClient.search(...)} with simple, hard-coded filters.
 * - Returns the parsed {@code PageResponse} for fast verification.
 *
 * Quick test (PowerShell):
 *   Invoke-RestMethod -Uri 'http://localhost:8080/api/demo/orders' -Method GET
 *
 * Adjust the filters in {@link #demoOrders()} when iterating during development.
 */
@RestController
@RequestMapping("/api/demo")
public class DemoOrderController {

    private final OrderQueryClient orderQueryClient;

    public DemoOrderController(OrderQueryClient orderQueryClient) {
        this.orderQueryClient = orderQueryClient;
    }

    /** Invoke the {@link OrderQueryClient} with static params. Modify the
     *  hard-coded filters in-place while developing. */
    @GetMapping("/orders")
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public ResponseEntity<PageResponse<Map<String, Object>>> demoOrders() {
        Map<String, Object> filters = new HashMap<>();
        // Example static filters (modify to match actual server-side fields if needed)

        PageResponse result = orderQueryClient.search(filters, 0, 5, "id,DESC");
        return ResponseEntity.ok(result);
    }
}
