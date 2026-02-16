# Error Handling Specification

**Version:** 1.0
**Last Updated:** 2026-02-16
**Status:** Complete

---

## Related Documents

- [OpenAPI Contracts](openapi-contracts.md) - API error responses
- [Streaming Architecture](streaming-architecture.md) - Stream error handling and resilience
- [Testing Patterns](testing-patterns.md) - Testing error scenarios
- [Validation Rules](validation-rules.md) - Validation error patterns

---

## 1. Overview

This specification defines the comprehensive error handling strategy for the OMS application, covering:

- **RFC 7807 Problem Details** - Standard error response format
- **Error Code Registry** - Consistent error categorization
- **Exception Hierarchy** - Domain-specific exceptions
- **Retry Patterns** - Transient failure recovery
- **Circuit Breakers** - Cascading failure prevention
- **Idempotency** - Safe error recovery

### Design Principles

1. **Consistency** - Uniform error responses across all APIs
2. **Actionability** - Errors provide clear guidance for resolution
3. **Observability** - All errors are logged with correlation IDs
4. **Security** - Sensitive information is never exposed in error responses
5. **Resilience** - Graceful degradation under failure conditions

---

## 2. RFC 7807 Problem Details

### Standard Format

The OMS application uses [RFC 7807 Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc7807.html) as the standard error response format.

#### Problem Detail Structure

```json
{
  "type": "https://oms.example.com/errors/invalid-state-transition",
  "title": "Invalid State Transition",
  "status": 409,
  "detail": "Cannot transition order from FILLED to LIVE",
  "instance": "/api/commands/orders/ORD-12345",
  "timestamp": "2026-02-16T10:30:00Z",
  "errorCode": "OMS-STATE-001",
  "orderId": "ORD-12345",
  "fromState": "FILLED",
  "toState": "LIVE"
}
```

#### Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | URI reference identifying the error type |
| `title` | Yes | Short, human-readable summary |
| `status` | Yes | HTTP status code |
| `detail` | Yes | Human-readable explanation specific to this occurrence |
| `instance` | No | URI reference identifying the specific occurrence |
| `timestamp` | No | ISO 8601 timestamp when the error occurred |
| `errorCode` | No | OMS-specific error code for client handling |
| *extensions* | No | Additional domain-specific fields |

---

## 3. Spring Boot Implementation

### Global Exception Handler

```java
package org.example.oms.api;

import java.net.URI;
import java.time.Instant;
import java.util.stream.Collectors;

import org.example.common.state.StateTransitionException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Bad request: {}", ex.getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.BAD_REQUEST, ex.getMessage()
        );
        problem.setType(URI.create("urn:oms:error:bad-request"));
        problem.setTitle("Bad Request");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-VAL-001");
        return problem;
    }

    @ExceptionHandler(StateTransitionException.class)
    public ProblemDetail handleStateTransition(StateTransitionException ex) {
        log.warn("Invalid state transition: {}", ex.getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.CONFLICT, ex.getMessage()
        );
        problem.setType(URI.create("urn:oms:error:invalid-state-transition"));
        problem.setTitle("Invalid State Transition");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-STATE-001");
        problem.setProperty("fromState", ex.getFromState());
        problem.setProperty("toState", ex.getToState());
        problem.setProperty("orderId", ex.getOrderId());
        return problem;
    }

    @ExceptionHandler(OrderNotFoundException.class)
    public ProblemDetail handleOrderNotFound(OrderNotFoundException ex) {
        log.warn("Order not found: {}", ex.getOrderId());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.NOT_FOUND,
            "Order not found: " + ex.getOrderId()
        );
        problem.setType(URI.create("urn:oms:error:order-not-found"));
        problem.setTitle("Order Not Found");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-ORDER-001");
        problem.setProperty("orderId", ex.getOrderId());
        return problem;
    }

    @ExceptionHandler(DuplicateOrderException.class)
    public ProblemDetail handleDuplicateOrder(DuplicateOrderException ex) {
        log.warn("Duplicate order: sessionId={}, clOrdId={}", ex.getSessionId(), ex.getClOrdId());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.CONFLICT,
            String.format("Order already exists: sessionId=%s, clOrdId=%s", ex.getSessionId(), ex.getClOrdId())
        );
        problem.setType(URI.create("urn:oms:error:duplicate-order"));
        problem.setTitle("Duplicate Order");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-ORDER-002");
        problem.setProperty("sessionId", ex.getSessionId());
        problem.setProperty("clOrdId", ex.getClOrdId());
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        log.warn("Validation error: {}", ex.getMessage());

        var errors = ex.getBindingResult().getFieldErrors().stream()
            .collect(Collectors.groupingBy(
                FieldError::getField,
                Collectors.mapping(FieldError::getDefaultMessage, Collectors.toList())
            ));

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.BAD_REQUEST,
            "Validation failed for one or more fields"
        );
        problem.setType(URI.create("urn:oms:error:validation-failed"));
        problem.setTitle("Validation Failed");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-VAL-002");
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.error("Data integrity violation", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.CONFLICT,
            "Data integrity constraint violation"
        );
        problem.setType(URI.create("urn:oms:error:data-integrity"));
        problem.setTitle("Data Integrity Violation");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-DATA-001");
        return problem;
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ProblemDetail handleOptimisticLock(OptimisticLockingFailureException ex) {
        log.warn("Optimistic locking failure", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.CONFLICT,
            "The resource was modified by another user. Please retry."
        );
        problem.setType(URI.create("urn:oms:error:optimistic-lock"));
        problem.setTitle("Concurrent Modification");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-LOCK-001");
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGeneric(Exception ex) {
        log.error("Unexpected error", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "An unexpected error occurred. Please contact support."
        );
        problem.setType(URI.create("urn:oms:error:internal"));
        problem.setTitle("Internal Server Error");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-SYS-001");
        // Never expose internal exception details to clients
        return problem;
    }
}
```

---

## 4. Error Code Registry

### Code Structure

Error codes follow the pattern: `OMS-{CATEGORY}-{NUMBER}`

- **OMS** - Application prefix
- **CATEGORY** - Error category (3-5 letters)
- **NUMBER** - Sequential number (001-999)

### Error Categories

| Category | Code Prefix | Description |
|----------|-------------|-------------|
| Validation | OMS-VAL | Input validation errors |
| State | OMS-STATE | State machine transition errors |
| Order | OMS-ORDER | Order-specific business errors |
| Execution | OMS-EXEC | Execution processing errors |
| Data | OMS-DATA | Database/persistence errors |
| Locking | OMS-LOCK | Concurrency control errors |
| Auth | OMS-AUTH | Authentication/authorization errors |
| External | OMS-EXT | External service errors |
| System | OMS-SYS | Internal system errors |

### Error Code Catalog

#### Validation Errors (OMS-VAL-xxx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| OMS-VAL-001 | 400 | General validation failure |
| OMS-VAL-002 | 400 | Field validation failure (Jakarta Validation) |
| OMS-VAL-003 | 400 | Required field missing |
| OMS-VAL-004 | 400 | Invalid field format |
| OMS-VAL-005 | 400 | Value out of range |

#### State Errors (OMS-STATE-xxx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| OMS-STATE-001 | 409 | Invalid state transition |
| OMS-STATE-002 | 409 | Order not in expected state |
| OMS-STATE-003 | 409 | Terminal state reached |

#### Order Errors (OMS-ORDER-xxx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| OMS-ORDER-001 | 404 | Order not found |
| OMS-ORDER-002 | 409 | Duplicate order (sessionId + clOrdId) |
| OMS-ORDER-003 | 400 | Invalid order type |
| OMS-ORDER-004 | 400 | Insufficient quantity |
| OMS-ORDER-005 | 409 | Order already cancelled |
| OMS-ORDER-006 | 409 | Order already filled |

#### Execution Errors (OMS-EXEC-xxx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| OMS-EXEC-001 | 404 | Execution not found |
| OMS-EXEC-002 | 409 | Duplicate execution (execID) |
| OMS-EXEC-003 | 400 | Invalid execution type |
| OMS-EXEC-004 | 400 | Execution quantity exceeds order quantity |
| OMS-EXEC-005 | 409 | Execution bust not allowed |

#### Data Errors (OMS-DATA-xxx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| OMS-DATA-001 | 409 | Data integrity constraint violation |
| OMS-DATA-002 | 500 | Database connection failure |
| OMS-DATA-003 | 500 | Transaction rollback |

#### Locking Errors (OMS-LOCK-xxx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| OMS-LOCK-001 | 409 | Optimistic locking failure |
| OMS-LOCK-002 | 409 | Pessimistic lock timeout |

#### System Errors (OMS-SYS-xxx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| OMS-SYS-001 | 500 | Internal server error |
| OMS-SYS-002 | 503 | Service temporarily unavailable |
| OMS-SYS-003 | 504 | Gateway timeout |

---

## 5. Exception Hierarchy

### Domain Exception Classes

```java
package org.example.common.exception;

import lombok.Getter;

/**
 * Base exception for all OMS domain exceptions.
 */
@Getter
public abstract class OmsException extends RuntimeException {
    private final String errorCode;

    protected OmsException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    protected OmsException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }
}

/**
 * Exception thrown when an order is not found.
 */
@Getter
public class OrderNotFoundException extends OmsException {
    private final String orderId;

    public OrderNotFoundException(String orderId) {
        super("OMS-ORDER-001", "Order not found: " + orderId);
        this.orderId = orderId;
    }
}

/**
 * Exception thrown when attempting to create a duplicate order.
 */
@Getter
public class DuplicateOrderException extends OmsException {
    private final String sessionId;
    private final String clOrdId;

    public DuplicateOrderException(String sessionId, String clOrdId) {
        super("OMS-ORDER-002",
            String.format("Duplicate order: sessionId=%s, clOrdId=%s", sessionId, clOrdId));
        this.sessionId = sessionId;
        this.clOrdId = clOrdId;
    }
}

/**
 * Exception thrown when a state transition is invalid.
 */
@Getter
public class StateTransitionException extends OmsException {
    private final String orderId;
    private final State fromState;
    private final State toState;

    public StateTransitionException(String orderId, State fromState, State toState) {
        super("OMS-STATE-001",
            String.format("Invalid state transition for order %s: %s -> %s", orderId, fromState, toState));
        this.orderId = orderId;
        this.fromState = fromState;
        this.toState = toState;
    }
}

/**
 * Exception thrown when execution processing fails.
 */
@Getter
public class ExecutionProcessingException extends OmsException {
    private final String executionId;
    private final String orderId;

    public ExecutionProcessingException(String executionId, String orderId, String message) {
        super("OMS-EXEC-001", message);
        this.executionId = executionId;
        this.orderId = orderId;
    }
}

/**
 * Exception thrown when validation fails.
 */
@Getter
public class ValidationException extends OmsException {
    private final Map<String, List<String>> errors;

    public ValidationException(Map<String, List<String>> errors) {
        super("OMS-VAL-001", "Validation failed: " + errors);
        this.errors = errors;
    }

    public ValidationException(String field, String message) {
        this(Map.of(field, List.of(message)));
    }
}
```

### Exception Hierarchy Diagram

```
java.lang.RuntimeException
└── OmsException (abstract)
    ├── OrderNotFoundException
    ├── DuplicateOrderException
    ├── StateTransitionException
    ├── ExecutionProcessingException
    ├── ValidationException
    ├── InsufficientQuantityException
    ├── OrderAlreadyCancelledException
    └── OptimisticLockException
```

---

## 6. Validation Error Handling

### Jakarta Validation Integration

```java
package org.example.common.model.cmd;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public class Order {

    @NotNull(message = "Symbol is required")
    @Pattern(regexp = "[A-Z]{1,6}", message = "Symbol must be 1-6 uppercase letters")
    private String symbol;

    @NotNull(message = "Side is required")
    private Side side;

    @NotNull(message = "Order quantity is required")
    @DecimalMin(value = "0.0001", message = "Order quantity must be greater than 0")
    @Digits(integer = 15, fraction = 4, message = "Order quantity has invalid precision")
    private BigDecimal orderQty;

    @DecimalMin(value = "0.01", message = "Price must be positive")
    private BigDecimal price;

    @NotBlank(message = "Client order ID is required")
    @Size(max = 48, message = "Client order ID must not exceed 48 characters")
    private String clOrdId;

    @NotBlank(message = "Account is required")
    @Size(max = 32, message = "Account must not exceed 32 characters")
    private String account;
}
```

### Custom Validators

```java
package org.example.oms.validation;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.*;

/**
 * Validates that a limit order has a price.
 */
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = LimitOrderValidator.class)
public @interface ValidLimitOrder {
    String message() default "Limit orders must have a price";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class LimitOrderValidator implements ConstraintValidator<ValidLimitOrder, Order> {

    @Override
    public boolean isValid(Order order, ConstraintValidatorContext context) {
        if (order.getOrdType() == OrdType.LIMIT) {
            if (order.getPrice() == null || order.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                context.disableDefaultConstraintViolation();
                context.buildConstraintViolationWithTemplate("Limit orders must have a positive price")
                    .addPropertyNode("price")
                    .addConstraintViolation();
                return false;
            }
        }
        return true;
    }
}
```

### Validation Error Response Example

```json
{
  "type": "urn:oms:error:validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Validation failed for one or more fields",
  "timestamp": "2026-02-16T10:30:00Z",
  "errorCode": "OMS-VAL-002",
  "errors": {
    "symbol": ["Symbol is required"],
    "orderQty": ["Order quantity must be greater than 0"],
    "price": ["Limit orders must have a positive price"]
  }
}
```

---

## 7. Retry Patterns

### Exponential Backoff with Jitter

```java
package org.example.common.retry;

import java.time.Duration;
import java.util.Random;
import java.util.function.Predicate;

import lombok.Builder;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Getter
@Builder
public class RetryPolicy {
    private final int maxAttempts;
    private final Duration initialDelay;
    private final Duration maxDelay;
    private final double backoffMultiplier;
    private final double jitterFactor;
    private final Predicate<Throwable> retryableExceptions;

    private static final Random RANDOM = new Random();

    /**
     * Calculates the delay for the next retry attempt.
     *
     * @param attempt The current attempt number (0-based)
     * @return The delay duration
     */
    public Duration calculateDelay(int attempt) {
        long baseDelay = initialDelay.toMillis();
        long exponentialDelay = (long) (baseDelay * Math.pow(backoffMultiplier, attempt));
        long cappedDelay = Math.min(exponentialDelay, maxDelay.toMillis());

        // Add jitter to prevent thundering herd
        double jitter = cappedDelay * jitterFactor * (RANDOM.nextDouble() - 0.5);
        long finalDelay = cappedDelay + (long) jitter;

        return Duration.ofMillis(Math.max(0, finalDelay));
    }

    /**
     * Checks if an exception is retryable.
     */
    public boolean isRetryable(Throwable throwable) {
        return retryableExceptions.test(throwable);
    }

    /**
     * Default retry policy for transient failures.
     */
    public static RetryPolicy defaultPolicy() {
        return RetryPolicy.builder()
            .maxAttempts(5)
            .initialDelay(Duration.ofSeconds(1))
            .maxDelay(Duration.ofSeconds(30))
            .backoffMultiplier(2.0)
            .jitterFactor(0.2)
            .retryableExceptions(throwable ->
                throwable instanceof DataAccessException ||
                throwable instanceof TimeoutException ||
                throwable instanceof OptimisticLockingFailureException
            )
            .build();
    }
}
```

### Retry Executor

```java
package org.example.common.retry;

import java.util.function.Supplier;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class RetryExecutor {

    private final RetryPolicy policy;

    public RetryExecutor(RetryPolicy policy) {
        this.policy = policy;
    }

    /**
     * Executes a supplier with retry logic.
     *
     * @param operation The operation to execute
     * @return The result of the operation
     * @throws Exception if all retries are exhausted
     */
    public <T> T execute(Supplier<T> operation) throws Exception {
        int attempt = 0;
        Throwable lastException = null;

        while (attempt < policy.getMaxAttempts()) {
            try {
                return operation.get();
            } catch (Exception e) {
                lastException = e;

                if (!policy.isRetryable(e)) {
                    log.warn("Non-retryable exception encountered", e);
                    throw e;
                }

                attempt++;
                if (attempt >= policy.getMaxAttempts()) {
                    log.error("Max retry attempts ({}) exhausted", policy.getMaxAttempts(), e);
                    break;
                }

                Duration delay = policy.calculateDelay(attempt - 1);
                log.warn("Retry attempt {}/{} after {}ms", attempt, policy.getMaxAttempts(), delay.toMillis(), e);

                try {
                    Thread.sleep(delay.toMillis());
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Retry interrupted", ie);
                }
            }
        }

        throw new RuntimeException("Operation failed after " + attempt + " attempts", lastException);
    }
}
```

### Spring Retry Integration

```java
package org.example.oms.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.retry.annotation.EnableRetry;

@Configuration
@EnableRetry
public class RetryConfig {
}
```

```java
package org.example.oms.service;

import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;

@Service
public class ExternalMarketDataService {

    @Retryable(
        retryFor = {TimeoutException.class, IOException.class},
        maxAttempts = 5,
        backoff = @Backoff(
            delay = 1000,
            multiplier = 2.0,
            maxDelay = 30000
        )
    )
    public QuoteData fetchQuote(String symbol) {
        // Call external API with retry on transient failures
        return marketDataClient.getQuote(symbol);
    }
}
```

---

## 8. Circuit Breaker Pattern

### Resilience4j Integration

```gradle
// build.gradle
dependencies {
    implementation 'io.github.resilience4j:resilience4j-spring-boot3:2.2.0'
    implementation 'org.springframework.boot:spring-boot-starter-actuator'
    implementation 'org.springframework.boot:spring-boot-starter-aop'
}
```

### Circuit Breaker Configuration

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      marketDataService:
        registerHealthIndicator: true
        slidingWindowSize: 100
        permittedNumberOfCallsInHalfOpenState: 10
        slidingWindowType: COUNT_BASED
        minimumNumberOfCalls: 20
        waitDurationInOpenState: 60s
        failureRateThreshold: 50
        slowCallRateThreshold: 50
        slowCallDurationThreshold: 2s
        recordExceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException
        ignoreExceptions:
          - org.example.oms.exception.ValidationException

  timelimiter:
    instances:
      marketDataService:
        timeoutDuration: 5s
        cancelRunningFuture: true
```

### Circuit Breaker Usage

```java
package org.example.oms.service;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

@Service
public class MarketDataService {

    @CircuitBreaker(name = "marketDataService", fallbackMethod = "fallbackQuote")
    @TimeLimiter(name = "marketDataService")
    public CompletableFuture<QuoteData> fetchQuoteAsync(String symbol) {
        return CompletableFuture.supplyAsync(() -> externalApi.getQuote(symbol));
    }

    /**
     * Fallback method called when circuit is open or call fails.
     */
    private CompletableFuture<QuoteData> fallbackQuote(String symbol, Throwable throwable) {
        log.warn("Circuit breaker fallback for symbol {}: {}", symbol, throwable.getMessage());
        // Return cached quote or default value
        return CompletableFuture.completedFuture(cachedQuoteRepository.findBySymbol(symbol)
            .orElse(QuoteData.stale(symbol)));
    }
}
```

### Circuit Breaker Monitoring

```java
@RestController
@RequestMapping("/actuator/circuit-breakers")
public class CircuitBreakerController {

    private final CircuitBreakerRegistry circuitBreakerRegistry;

    @GetMapping("/{name}")
    public CircuitBreakerState getState(@PathVariable String name) {
        CircuitBreaker circuitBreaker = circuitBreakerRegistry.circuitBreaker(name);
        CircuitBreaker.Metrics metrics = circuitBreaker.getMetrics();

        return CircuitBreakerState.builder()
            .name(name)
            .state(circuitBreaker.getState().name())
            .failureRate(metrics.getFailureRate())
            .slowCallRate(metrics.getSlowCallRate())
            .numberOfBufferedCalls(metrics.getNumberOfBufferedCalls())
            .numberOfFailedCalls(metrics.getNumberOfFailedCalls())
            .numberOfSlowCalls(metrics.getNumberOfSlowCalls())
            .build();
    }
}
```

---

## 9. Idempotency and Error Recovery

### Idempotent Command Processing

```java
package org.example.oms.service.command;

import org.example.common.model.Order;
import org.example.oms.repository.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderCreateCommandProcessor {

    private final OrderRepository orderRepository;

    @Transactional
    public ProcessingResult process(CreateOrderCommand command) {
        // Check for duplicate using natural key (sessionId + clOrdId)
        if (orderRepository.existsBySessionIdAndClOrdId(
                command.getSessionId(), command.getClOrdId())) {

            // Idempotent: Return existing order instead of failing
            Order existing = orderRepository.findBySessionIdAndClOrdId(
                command.getSessionId(), command.getClOrdId()
            ).orElseThrow();

            log.info("Idempotent create: returning existing order {}", existing.getOrderId());
            return ProcessingResult.success(existing);
        }

        // Create new order
        Order order = orderMapper.toEntity(command);
        order = orderRepository.save(order);

        return ProcessingResult.success(order);
    }
}
```

### Kafka Exactly-Once Semantics

```java
@Service
public class CommandListener {

    @KafkaListener(
        topics = "${kafka.command-topic}",
        groupId = "oms-command-processor",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleCommand(
            @Payload CommandMessage message,
            @Header(KafkaHeaders.RECEIVED_KEY) String key,
            Acknowledgment acknowledgment) {

        try {
            // Process command (must be idempotent)
            ProcessingResult result = commandProcessor.process(message);

            if (result.isSuccess()) {
                // Manually acknowledge only on success
                acknowledgment.acknowledge();
                log.info("Command processed successfully: key={}", key);
            } else {
                // Do not acknowledge - message will be retried
                log.warn("Command processing failed, will retry: key={}", key);
            }
        } catch (Exception e) {
            log.error("Error processing command: key={}", key, e);
            // Do not acknowledge - message will be retried
            // Consider DLQ after max retries
        }
    }
}
```

### Optimistic Locking for Concurrent Updates

```java
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE)
    private Long id;

    @Version  // Optimistic locking
    private Long version;

    private String orderId;
    private State state;
    private BigDecimal cumQty;
    // ... other fields
}

@Service
public class OrderUpdateService {

    @Transactional
    public Order updateOrderState(String orderId, State newState) {
        Order order = orderRepository.findByOrderId(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));

        // Optimistic lock check happens automatically on commit
        order.setState(newState);

        try {
            return orderRepository.save(order);
        } catch (OptimisticLockingFailureException e) {
            log.warn("Optimistic lock failure for order {}, version {}", orderId, order.getVersion());
            throw new OmsException("OMS-LOCK-001", "Order was modified by another transaction", e);
        }
    }
}
```

---

## 10. Error Logging and Observability

### Structured Logging with SLF4J

```java
@Slf4j
@Service
public class OrderService {

    public Order createOrder(CreateOrderCommand command) {
        MDC.put("orderId", command.getOrderId());
        MDC.put("clOrdId", command.getClOrdId());
        MDC.put("sessionId", command.getSessionId());

        try {
            log.info("Creating order: symbol={}, side={}, qty={}",
                command.getSymbol(), command.getSide(), command.getOrderQty());

            Order order = processOrder(command);

            log.info("Order created successfully: orderId={}, state={}",
                order.getOrderId(), order.getState());

            return order;
        } catch (ValidationException e) {
            log.warn("Validation failed: errors={}", e.getErrors());
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error creating order", e);
            throw new OmsException("OMS-SYS-001", "Failed to create order", e);
        } finally {
            MDC.clear();
        }
    }
}
```

### Correlation ID Tracking

```java
@Component
public class CorrelationIdFilter extends OncePerRequestFilter {

    private static final String CORRELATION_ID_HEADER = "X-Correlation-ID";
    private static final String CORRELATION_ID_MDC_KEY = "correlationId";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {
        String correlationId = request.getHeader(CORRELATION_ID_HEADER);
        if (correlationId == null || correlationId.isEmpty()) {
            correlationId = UUID.randomUUID().toString();
        }

        MDC.put(CORRELATION_ID_MDC_KEY, correlationId);
        response.setHeader(CORRELATION_ID_HEADER, correlationId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(CORRELATION_ID_MDC_KEY);
        }
    }
}
```

### Prometheus Metrics for Errors

```java
@Component
public class ErrorMetrics {

    private final Counter errorCounter;
    private final Counter errorByCodeCounter;

    public ErrorMetrics(MeterRegistry meterRegistry) {
        this.errorCounter = Counter.builder("oms.errors.total")
            .description("Total number of errors")
            .tag("application", "oms")
            .register(meterRegistry);

        this.errorByCodeCounter = Counter.builder("oms.errors.by_code")
            .description("Errors grouped by error code")
            .register(meterRegistry);
    }

    public void recordError(String errorCode, String errorType) {
        errorCounter.increment();
        errorByCodeCounter.tag("error_code", errorCode)
            .tag("error_type", errorType)
            .increment();
    }
}

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private final ErrorMetrics errorMetrics;

    @ExceptionHandler(OmsException.class)
    public ProblemDetail handleOmsException(OmsException ex) {
        errorMetrics.recordError(ex.getErrorCode(), ex.getClass().getSimpleName());
        // ... create ProblemDetail
    }
}
```

---

## 11. Client Error Handling

### TypeScript Error Handling

```typescript
// api-client.ts
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  timestamp?: string;
  errorCode?: string;
  [key: string]: any;
}

export class OmsApiError extends Error {
  constructor(
    public readonly problem: ProblemDetail,
    public readonly httpStatus: number
  ) {
    super(problem.detail || problem.title);
    this.name = 'OmsApiError';
  }

  get errorCode(): string | undefined {
    return this.problem.errorCode;
  }

  isValidationError(): boolean {
    return this.errorCode?.startsWith('OMS-VAL') ?? false;
  }

  isConflictError(): boolean {
    return this.httpStatus === 409;
  }

  isRetryable(): boolean {
    return this.httpStatus === 503 ||
           this.httpStatus === 504 ||
           this.httpStatus === 429;
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': generateCorrelationId(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const problem: ProblemDetail = await response.json();
    throw new OmsApiError(problem, response.status);
  }

  return response.json();
}

// Usage
try {
  const order = await apiRequest<Order>('/api/commands/orders', {
    method: 'POST',
    body: JSON.stringify(orderCommand),
  });
  console.log('Order created:', order);
} catch (error) {
  if (error instanceof OmsApiError) {
    if (error.isValidationError()) {
      // Handle validation errors
      console.error('Validation errors:', error.problem.errors);
    } else if (error.isConflictError()) {
      // Handle conflicts (duplicate, state transition)
      console.error('Conflict:', error.problem.detail);
    } else if (error.isRetryable()) {
      // Retry the request
      console.warn('Retrying after transient failure');
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## 12. Summary

### Error Handling Checklist

- [ ] Use RFC 7807 Problem Details for all API errors
- [ ] Define error codes with OMS-{CATEGORY}-{NUMBER} pattern
- [ ] Create domain-specific exception hierarchy
- [ ] Implement global exception handler with @RestControllerAdvice
- [ ] Add Jakarta Validation constraints to command DTOs
- [ ] Implement retry logic with exponential backoff and jitter
- [ ] Use circuit breakers for external service calls
- [ ] Ensure idempotent command processing
- [ ] Add correlation IDs to all requests
- [ ] Record error metrics for observability
- [ ] Never expose sensitive information in error responses
- [ ] Provide actionable error messages for clients

### Key Principles

1. **Fail Fast** - Validate input early, return errors immediately
2. **Fail Safely** - Graceful degradation, no cascading failures
3. **Fail Visibly** - Log all errors with context, emit metrics
4. **Fail Recoverable** - Idempotent operations, retry transient failures
5. **Fail Securely** - Never expose internal details or sensitive data

---

**End of Error Handling Specification**
