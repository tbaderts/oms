package org.example.streaming.client;

import java.time.Duration;
import java.util.Map;

import org.example.common.model.query.OrderDto;
import org.example.common.model.query.PagedOrderDto;
import org.example.streaming.model.StreamFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriBuilder;

import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Reactive REST client for OMS Core Query API.
 * 
 * <p>Used to fetch the initial order snapshot when a client subscribes
 * to the streaming service. The snapshot is merged with the real-time
 * Kafka stream to provide a complete view of orders.
 * 
 * <p>Supports dynamic filtering using the same filter format as the
 * streaming API, which maps to Query API parameters.
 * 
 * <h2>Usage</h2>
 * <pre>{@code
 * // Fetch all orders
 * omsQueryClient.fetchAllOrders()
 *     .doOnNext(order -> log.debug("Fetched order: {}", order.getOrderId()))
 *     .subscribe();
 * 
 * // Fetch with filter
 * StreamFilter filter = StreamFilter.and(
 *     FilterCondition.eq("symbol", "INTC"),
 *     FilterCondition.eq("side", "BUY")
 * );
 * omsQueryClient.fetchOrdersWithFilter(filter)
 *     .subscribe();
 * }</pre>
 */
@Component
@Slf4j
public class OmsQueryClient {

    private static final int DEFAULT_PAGE_SIZE = 500;

    private final WebClient webClient;

    @Value("${streaming.oms.read-timeout-ms:30000}")
    private int readTimeoutMs;

    @Value("${streaming.oms.connect-timeout-ms:5000}")
    private int connectTimeoutMs;

    public OmsQueryClient(
            WebClient.Builder webClientBuilder,
            @Value("${streaming.oms.base-url}") String baseUrl,
            @Value("${streaming.oms.max-buffer-size-mb:16}") int maxBufferSizeMb) {
        int maxBufferSize = maxBufferSizeMb * 1024 * 1024;
        this.webClient = webClientBuilder
                .baseUrl(baseUrl)
                .codecs(configurer -> configurer
                        .defaultCodecs()
                        .maxInMemorySize(maxBufferSize))
                .build();
        log.info("OMS Query Client initialized with baseUrl: {}, maxBufferSize: {}MB", baseUrl, maxBufferSizeMb);
    }

    /**
     * Fetches all orders from OMS Core Query API.
     * 
     * <p>Uses pagination to retrieve all orders efficiently. Continues fetching
     * until all pages are retrieved.
     * 
     * @return Flux of OrderDto representing all orders
     */
    public Flux<OrderDto> fetchAllOrders() {
        return fetchOrdersWithFilter(null);
    }

    /**
     * Fetches orders matching the specified filter from OMS Core Query API.
     * 
     * <p>Converts StreamFilter to Query API parameters and uses pagination
     * to retrieve all matching orders.
     * 
     * @param filter optional filter criteria (null = fetch all)
     * @return Flux of OrderDto matching the filter
     */
    public Flux<OrderDto> fetchOrdersWithFilter(StreamFilter filter) {
        Map<String, String> filterParams = filter != null ? filter.toQueryParams() : Map.of();
        
        log.info("fetchOrdersWithFilter called with filter: {}, params: {}", filter, filterParams);
        
        return fetchOrdersPage(0, DEFAULT_PAGE_SIZE, filterParams)
                .expand(pagedResult -> {
                    log.info("Expanding page: currentPage={}, totalPages={}, contentSize={}", 
                            pagedResult.getPage() != null ? pagedResult.getPage().getNumber() : "null",
                            pagedResult.getPage() != null ? pagedResult.getPage().getTotalPages() : "null",
                            pagedResult.getContent() != null ? pagedResult.getContent().size() : 0);
                    if (pagedResult.getPage() != null && 
                        pagedResult.getPage().getNumber() < pagedResult.getPage().getTotalPages() - 1) {
                        return fetchOrdersPage(pagedResult.getPage().getNumber() + 1, DEFAULT_PAGE_SIZE, filterParams);
                    }
                    return Mono.empty();
                })
                .flatMapIterable(PagedOrderDto::getContent)
                .doOnSubscribe(s -> log.info("Starting to fetch orders from OMS Core with filter: {}", filterParams))
                .doOnComplete(() -> log.info("Completed fetching orders from OMS Core"))
                .doOnError(e -> log.error("Error fetching orders from OMS Core", e));
    }

    /**
     * Fetches orders with a specific filter (legacy method - kept for compatibility).
     * 
     * @param symbol optional symbol filter
     * @param side optional side filter (BUY, SELL)
     * @param state optional state filter
     * @return Flux of OrderDto matching the filter
     */
    public Flux<OrderDto> fetchOrders(String symbol, String side, String state) {
        Map<String, String> filterParams = new java.util.HashMap<>();
        if (symbol != null && !symbol.isEmpty()) {
            filterParams.put("symbol", symbol);
        }
        if (side != null && !side.isEmpty()) {
            filterParams.put("side", side);
        }
        if (state != null && !state.isEmpty()) {
            filterParams.put("state", state);
        }
        
        return fetchOrdersPage(0, DEFAULT_PAGE_SIZE, filterParams)
                .expand(pagedResult -> {
                    if (pagedResult.getPage() != null && 
                        pagedResult.getPage().getNumber() < pagedResult.getPage().getTotalPages() - 1) {
                        return fetchOrdersPage(pagedResult.getPage().getNumber() + 1, DEFAULT_PAGE_SIZE, filterParams);
                    }
                    return Mono.empty();
                })
                .flatMapIterable(PagedOrderDto::getContent);
    }

    /**
     * Fetches a single page of orders with dynamic filter parameters.
     */
    private Mono<PagedOrderDto> fetchOrdersPage(int page, int size, Map<String, String> filterParams) {
        return webClient.get()
                .uri(uriBuilder -> {
                    UriBuilder builder = uriBuilder
                            .path("/api/query/search")
                            .queryParam("page", page)
                            .queryParam("size", size)
                            .queryParam("sort", "id,DESC");
                    
                    // Add dynamic filter parameters
                    filterParams.forEach(builder::queryParam);
                    
                    return builder.build();
                })
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .bodyToMono(PagedOrderDto.class)
                .timeout(Duration.ofMillis(readTimeoutMs))
                .doOnNext(result -> log.debug("Fetched page {} with {} orders (filters: {})", 
                        page, result.getContent() != null ? result.getContent().size() : 0, filterParams))
                .doOnError(e -> log.error("Error fetching orders page {}: {}", page, e.getMessage()));
    }

    /**
     * Health check for OMS Core connectivity.
     * 
     * @return Mono of true if OMS Core is reachable
     */
    public Mono<Boolean> isHealthy() {
        return webClient.get()
                .uri("/actuator/health")
                .retrieve()
                .toBodilessEntity()
                .map(response -> response.getStatusCode().is2xxSuccessful())
                .timeout(Duration.ofMillis(connectTimeoutMs))
                .onErrorReturn(false);
    }
}
