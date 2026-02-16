# Order Management System (OMS) State Store Specification

**Version:** 1.0
**Last Updated:** 2026-02-14
**Author:** OMS Team
**Status:** Active

---

**1. Introduction**

This document specifies the design and functionality of the State Store component within the Order Management System (OMS). The OMS operates in a trading environment and manages the lifecycle of key domain objects. This specification outlines the technical details for the State Store, adhering to Event Sourcing and CQRS principles.

**2. Goals**

*   Provide a persistent and consistent state management solution for the OMS domain objects.
*   Enable efficient querying of domain object state.
*   Facilitate event-driven communication for downstream consumers.
*   Support extensibility for different asset classes and sub-domains.
*   Ensure data integrity through validation and state machine enforcement.
*   Provide necessary data for execution desk monitoring and control.

**3. Architecture and Principles**

*   **Event Sourcing:** All state changes are captured as events and stored in an event log.
*   **CQRS (Command Query Responsibility Segregation):**  Separate command (write) and query (read) models. The command API modifies the state store, while the query API provides read-only access to the data.
*   **Microservices:** The State Store is designed to be a self-contained component, deployable as a microservice.
*   **Azure Cloud Native:** Leverages Azure services for scalability, reliability, and manageability.

**4. Technology Stack**

*   **Programming Language:** Java 21
*   **Framework:** Spring Boot
*   **Database:** PostgreSQL (Azure Database for PostgreSQL)
*   **Cloud Platform:** Microsoft Azure
*   **Messaging:** Confluent kafka
*   **Serialization:** JSON (e.g., Jackson)

**5. Domain Model**

*   **Core Domain Objects:**
    *   `Order`
    *   `Execution`
    *   `QuoteRequest`
    *   `Quote`
*   **Common Model:** A base class or interface defines common attributes shared across all domain objects.  FIX protocol semantics should be followed where appropriate.
*   **Extensibility:**  The domain model is extensible via Java inheritance to accommodate asset class-specific attributes.

    ```java
    // Example (Illustrative)
    public abstract class Order {
        private String orderId;
        private String clOrdID; // FIX Tag 11
        // ... other common attributes
    }

    public class EquityOrder extends Order {
        private String symbol;
        // ... equity-specific attributes
    }
    ```

**6. State Store Structure**

*   **Denormalized Data Model:**  A table for each domain object type (`orders`, `executions`, `quote_requests`, `quotes`). An event table per domain object type (`order_events`, `execution_events`, etc.)
*   **Event Table:** Stores events as binary JSON, including the command that triggered the event and metadata (timestamp, sequence number).
*   **No Referential Integrity:**  Database constraints are *not* used to enforce relationships.  Relationships are managed in application code.

**7. API**

*   **Command API:**
    *   Used to create, update, and expire/purge domain objects.
    *   Receives commands (e.g., `CreateOrderCommand`, `ExecuteOrderCommand`, `CancelOrderCommand`).
    *   Validates commands using the validation engine and state machine.
    *   Appends events to the event log.
    *   Example endpoint (Illustrative):
        ```
        POST /commands/orders
        {
          "commandType": "CreateOrderCommand",
          "orderId": "...",
          "clOrdID": "..."
          // ... other command parameters
        }
        ```
*   **Query API:**
    *   Provides read-only access to the current state of domain objects.
    *   Supports dynamic queries using a specification builder pattern (see Section 10).
    *   Example endpoint (Illustrative):
        ```
        GET /queries/orders?clOrdID=XYZ&status=New
        ```

**8. Eventing**

*   **Event Emission:** After a successful state mutation, an event is published to a dedicated topic (e.g., `order-events`, `execution-events`).
*   **Event Format:** Events should include the updated domain object state and relevant metadata.
*   **Downstream Consumers:** Downstream services (e.g., risk management, reporting) subscribe to these topics to receive real-time updates.

**9. Validation Engine and State Machine**

*   **Generic Validation Engine:** Uses Java predicates to enforce business rules and data integrity. Rules are configurable and extensible.
*   **State Machine:** Enforces valid state transitions for each domain object type. Prevents invalid operations based on the current state.

    ```java
    // Example (Illustrative) - Order State Machine
    public enum OrderState {
        NEW,
        PARTIALLY_FILLED,
        FILLED,
        CANCELLED,
        REJECTED
    }
    ```

**10. Query Service and Specification Builder**

*   **Generic Query Service:** Provides a common interface for querying domain objects.
*   **Specification Builder:** Allows clients to construct complex queries using a fluent API.

    ```java
    // Example (Illustrative) - Specification Builder
    OrderSpecification spec = OrderSpecification.builder()
        .clOrdID("XYZ")
        .status(OrderState.NEW)
        .build();

    List<Order> orders = queryService.findOrders(spec);
    ```

**11. Order Tree Structure**

*   **Flat Structure:** Orders are stored in a flat table (`orders`).
*   **Relationships:** `id` (primary key), `rootId` (root order ID), `parentId` (parent order ID).
*   **Tree Traversal:**  Application logic is responsible for traversing the order tree.

    ```
    Order Table:
    | id      | rootId  | parentId | clOrdID | ... |
    |---------|---------|----------|---------|-----|
    | O1      | O1      | NULL     | Client1 | ... |  <-- Client Order (Root)
    | O2      | O1      | O1       | Market1 | ... |  <-- Market Order (Child of Client Order)
    | O3      | O1      | O2       | Slice1  | ... |  <-- Slice of algorithmic orders

    ```

    **Order Tree Diagram (Simplified):**

    ```
         O1 (Client1) - Root
         |
         ---- O2 (Market1)
              |
              ---- O3 (Slice1)
    ```

**12. Execution Processing**

*   **Execution Allocation:** Executions are applied to market orders.
*   **Validation:** Executions are validated against market orders *before* allocation to client orders.
*   **Error Handling:** Executions that fail validation are placed in a special state for review and potential correction by the execution desk.
*   **Manual Execution Entry:** The execution desk can manually create executions.
*   **Quantity Calculation:** The State Store calculates and updates the following quantities:
    *   `executedQuantity`
    *   `leavesQuantity` (remaining quantity)
    *   `allocatedQuantity` (quantity allocated to client orders)
*   **Order Tree Quantity Reflection:** The calculated quantities on market orders are reflected on the corresponding client orders.

**13. Order Flow and Execution Desk Interaction**

*   **Rules Engine:** A dedicated rules engine determines when orders should be routed to the execution desk for manual intervention.
*   **Execution Desk UI (Trade Blotter):**
    *   Displays real-time updates from the OMS.
    *   Provides filtering and sorting capabilities.
    *   Allows the execution desk to monitor order flow and execution processing.
    *   Enables manual order placement.
*   **Execution Desk Actions:**
    *   Trigger order placement.
    *   Modify and allocate executions.
    *   Reject executions.

    **Order Flow Diagram (Simplified):**

    ```
    [Client Order] --> [Rules Engine]
                      |
                      +-- (Rule Triggered) --> [Execution Desk UI] --> [Manual Action (Place Order)]
                      |
                      +-- (No Rule) --> [Automatic Order Placement] --> [Market Order(s)]
                                                                      |
                                                                      +--> [Execution(s)] --> [State Store (Quantity Updates)]
                                                                      |
                                                                      +--> [Execution(s) Validation]
                                                                           |
                                                                           +-- (Validation Success) --> [Allocate to Client Order]
                                                                           |
                                                                           +-- (Validation Failure) --> [Execution Desk Review]
    ```

**14. Lifecycle Management (Expiration and Purging)**

*   A separate component is responsible for expiring and purging old domain objects and events.
*   Retention policies should be configurable.

**15.  OMS Core Library**

*   Provides reusable components:
    *   Basic Domain Model (Base Classes and Interfaces)
    *   State Machine Implementation
    *   Validation Engine
    *   Generic Query Service and Specification Builder
    *   Orchestration Engine (for business service execution)

**16. Non-Functional Requirements**

*   **Performance:**  The State Store must be able to handle high volumes of transactions with low latency.
*   **Scalability:**  The State Store must be scalable to accommodate increasing data volumes and transaction rates.
*   **Reliability:**  The State Store must be highly reliable and available.
*   **Security:**  Appropriate security measures must be implemented to protect sensitive data.
*   **Auditability:**  All state changes must be auditable.

**17. Future Considerations**

*   **AI-Powered Data Anomaly Detection:** Implement AI models to detect unusual patterns in order execution or data inconsistencies.
*   **Automated Test Case Generation for State Transitions:**  Use AI to generate test cases that cover all possible state transitions and edge cases.
*   **Predictive Scaling:**  Use AI to predict future load and automatically scale resources accordingly.

---

## 18. Spring Data JPA Implementation Patterns

This section provides comprehensive Java implementation examples for the State Store using Spring Data JPA and PostgreSQL.

### 18.1 JPA Entity Mappings

#### Complete Order Entity

```java
package org.example.common.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

/**
 * Order entity representing the current state of an order.
 * Stored in 'orders' table with denormalized fields for query performance.
 */
@Entity
@Table(name = "orders",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_session_clordid",
            columnNames = {"session_id", "cl_ord_id"}
        )
    },
    indexes = {
        @Index(name = "idx_order_id", columnList = "order_id"),
        @Index(name = "idx_root_order_id", columnList = "root_order_id"),
        @Index(name = "idx_parent_order_id", columnList = "parent_order_id"),
        @Index(name = "idx_symbol_state", columnList = "symbol, state"),
        @Index(name = "idx_account_state", columnList = "account, state"),
        @Index(name = "idx_creation_date", columnList = "creation_date")
    }
)
@SuperBuilder(toBuilder = true)
@NoArgsConstructor
@Getter
@Setter
public class Order implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_sequence")
    @SequenceGenerator(
        name = "order_sequence",
        sequenceName = "order_seq",
        allocationSize = 1
    )
    private Long id;

    // Business Keys
    @Column(name = "order_id", nullable = false, unique = true, length = 50)
    private String orderId;

    @Column(name = "cl_ord_id", nullable = false, length = 50)
    private String clOrdId;  // FIX Tag 11

    // Order Tree Structure
    @Column(name = "root_order_id", length = 50)
    private String rootOrderId;

    @Column(name = "parent_order_id", length = 50)
    private String parentOrderId;

    // Order Details
    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;

    @Column(name = "account", nullable = false, length = 50)
    private String account;

    @Enumerated(EnumType.STRING)
    @Column(name = "side", nullable = false, length = 10)
    private Side side;  // BUY, SELL (FIX Tag 54)

    @Enumerated(EnumType.STRING)
    @Column(name = "ord_type", nullable = false, length = 20)
    private OrdType ordType;  // MARKET, LIMIT, STOP (FIX Tag 40)

    // Quantities (precision 19, scale 4)
    @Column(name = "order_qty", nullable = false, precision = 19, scale = 4)
    private BigDecimal orderQty;  // FIX Tag 38

    @Column(name = "cum_qty", precision = 19, scale = 4)
    private BigDecimal cumQty;  // FIX Tag 14

    @Column(name = "leaves_qty", precision = 19, scale = 4)
    private BigDecimal leavesQty;  // FIX Tag 151

    // Prices
    @Column(name = "price", precision = 19, scale = 6)
    private BigDecimal price;  // FIX Tag 44

    @Column(name = "avg_px", precision = 19, scale = 6)
    private BigDecimal avgPx;  // FIX Tag 6

    // State
    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 20)
    private State state;  // NEW, LIVE, FILLED, CXL, REJ

    // Timestamps
    @Column(name = "session_id", nullable = false, length = 50)
    private String sessionId;

    @Column(name = "creation_date", nullable = false)
    private Instant creationDate;

    @Column(name = "updated_date")
    private Instant updatedDate;
}
```

**Key Annotations:**
- `@Table(indexes = {...})` - Creates database indexes for query performance
- `@UniqueConstraint` - Prevents duplicate orders (same sessionId + clOrdId)
- `@Column(precision = 19, scale = 4)` - Exact decimal precision for financial quantities
- `@Enumerated(EnumType.STRING)` - Stores enums as strings (more readable than ordinals)

---

#### OrderEvent Entity (Event Sourcing)

```java
package org.example.oms.model;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;
import org.example.common.model.cmd.Command;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Immutable event log entry for event sourcing.
 * Stores command payload as PostgreSQL JSONB.
 */
@Entity
@Table(name = "order_events",
    indexes = {
        @Index(name = "idx_order_event_order_id", columnList = "order_id"),
        @Index(name = "idx_order_event_timestamp", columnList = "time_stamp")
    }
)
@SuperBuilder
@NoArgsConstructor
@Getter
public class OrderEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_event_sequence")
    @SequenceGenerator(
        name = "order_event_sequence",
        sequenceName = "order_event_seq",
        allocationSize = 1
    )
    private Long id;

    @Column(name = "order_id", nullable = false, length = 50)
    private String orderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event", nullable = false, length = 50)
    private Event event;  // NEW_ORDER, ORDER_ACCEPTED, ORDER_FILLED

    /**
     * JSONB column storing the command that triggered this event.
     * Uses Hibernate @JdbcTypeCode for PostgreSQL JSONB support.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "transaction", columnDefinition = "jsonb")
    private Command transaction;

    @Column(name = "time_stamp", nullable = false)
    private Instant timeStamp;
}
```

**JSONB Benefits:**
- Store arbitrary JSON data (commands, metadata)
- Indexable and queryable using PostgreSQL JSON operators
- Schema flexibility for different command types

---

### 18.2 Repository Interfaces

#### OrderRepository with Specifications

```java
package org.example.oms.repository;

import java.util.Optional;
import org.example.common.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

/**
 * Repository interface for Order entity.
 * Extends JpaSpecificationExecutor for dynamic query support.
 */
@Repository
public interface OrderRepository
        extends JpaRepository<Order, Long>, JpaSpecificationExecutor<Order> {

    Optional<Order> findByOrderId(String orderId);
    Optional<Order> findByRootOrderId(String rootOrderId);
    boolean existsBySessionIdAndClOrdId(String sessionId, String clOrdId);
}
```

#### OrderEventRepository

```java
package org.example.oms.repository;

import java.time.Instant;
import java.util.List;
import org.example.oms.model.OrderEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface OrderEventRepository extends JpaRepository<OrderEvent, Long> {

    /**
     * Find all events for an order (for event replay).
     */
    List<OrderEvent> findByOrderId(String orderId);

    /**
     * Find events within time range (for bulk processing).
     */
    @Query("SELECT e FROM OrderEvent e WHERE e.timeStamp BETWEEN :start AND :end ORDER BY e.id")
    List<OrderEvent> findEventsBetween(
        @Param("start") Instant start,
        @Param("end") Instant end
    );
}
```

---

### 18.3 JPA Specification Pattern

**Dynamic query building using the Specification pattern:**

```java
package org.example.oms.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.example.common.model.Order;
import org.springframework.data.jpa.domain.Specification;

/**
 * Builds JPA Specifications for dynamic Order queries.
 *
 * Example: GET /api/query/orders?symbol=AAPL&state=LIVE&orderQty__gte=1000
 * Generates: WHERE symbol = 'AAPL' AND state = 'LIVE' AND orderQty >= 1000
 */
public final class OrderSpecifications {

    public static Specification<Order> dynamic(Map<String, String> params) {
        List<Specification<Order>> specs = new ArrayList<>();

        params.forEach((k, v) -> {
            if (v == null || v.isBlank()) return;

            String[] parts = k.split("__");
            String field = parts[0];
            String op = parts.length > 1 ? parts[1] : "eq";

            switch (field) {
                case "orderId", "symbol", "account" ->
                    specs.add(buildString(field, op, v));

                case "orderQty", "cumQty", "price" ->
                    specs.add(buildNumeric(field, op, v));

                case "creationDate", "transactTime" ->
                    specs.add(buildDate(field, op, v));

                case "side", "ordType", "state" ->
                    specs.add(buildEnum(field, op, v));
            }
        });

        return specs.stream().reduce(all(), Specification::and);
    }

    private static Specification<Order> all() {
        return (root, query, cb) -> cb.conjunction();
    }

    private static Specification<Order> buildString(String field, String op, String value) {
        return (root, query, cb) -> {
            return op.equals("like")
                ? cb.like(cb.lower(root.get(field)), "%" + value.toLowerCase() + "%")
                : cb.equal(root.get(field), value);
        };
    }

    private static Specification<Order> buildNumeric(String field, String op, String value) {
        return (root, query, cb) -> {
            BigDecimal num = new BigDecimal(value);
            return switch (op) {
                case "gt" -> cb.greaterThan(root.get(field), num);
                case "gte" -> cb.greaterThanOrEqualTo(root.get(field), num);
                case "lt" -> cb.lessThan(root.get(field), num);
                case "lte" -> cb.lessThanOrEqualTo(root.get(field), num);
                default -> cb.equal(root.get(field), num);
            };
        };
    }

    private static Specification<Order> buildDate(String field, String op, String value) {
        return (root, query, cb) -> {
            Instant instant = Instant.parse(value);
            return switch (op) {
                case "gt" -> cb.greaterThan(root.get(field), instant);
                case "gte" -> cb.greaterThanOrEqualTo(root.get(field), instant);
                default -> cb.equal(root.get(field), instant);
            };
        };
    }

    private static Specification<Order> buildEnum(String field, String op, String value) {
        return (root, query, cb) -> {
            Class<?> type = root.get(field).getJavaType();
            Enum<?> enumValue = Enum.valueOf((Class<? extends Enum>) type, value);
            return cb.equal(root.get(field), enumValue);
        };
    }
}
```

**Usage:**

```java
@Service
@RequiredArgsConstructor
public class OrderQueryService {

    private final OrderRepository orderRepository;

    public Page<Order> findOrders(Map<String, String> params, Pageable pageable) {
        Specification<Order> spec = OrderSpecifications.dynamic(params);
        return orderRepository.findAll(spec, pageable);
    }
}
```

---

### 18.4 Event Publishing Task

```java
package org.example.oms.service.command.tasks;

import java.time.Instant;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderEventRepository;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;

/**
 * Appends immutable event to the event log (event sourcing).
 */
@Component
@RequiredArgsConstructor
public class PublishOrderEventTask implements Task<OrderTaskContext> {

    private final OrderEventRepository orderEventRepository;

    @Override
    public TaskResult execute(OrderTaskContext context) {
        OrderEvent event = OrderEvent.builder()
            .orderId(context.getOrder().getOrderId())
            .event(Event.NEW_ORDER)
            .transaction(context.getCommand()) // JSONB
            .timeStamp(Instant.now())
            .build();

        orderEventRepository.save(event);

        return TaskResult.success(getName(), "Event published");
    }

    @Override
    public int getOrder() {
        return 500; // After order persistence
    }
}
```

---

### 18.5 Transaction Management

```java
package org.example.oms.service.command;

import org.example.common.orchestration.TaskOrchestrator;
import org.example.common.orchestration.TaskPipeline;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

/**
 * Processes order creation within a single transaction.
 * All tasks (validation, persistence, event publishing) are atomic.
 */
@Service
@RequiredArgsConstructor
public class OrderCreateCommandProcessor {

    private final TaskOrchestrator orchestrator;

    @Transactional
    public ProcessingResult process(OrderCreateCommand command) {
        OrderTaskContext context = new OrderTaskContext(buildOrder(command));
        context.setCommand(command);

        TaskPipeline<OrderTaskContext> pipeline = buildPipeline();

        // Entire pipeline executes within transaction
        TaskOrchestrator.PipelineResult result = orchestrator.execute(pipeline, context);

        if (!result.isSuccess()) {
            // Transaction rolls back on failure
            throw new OrderProcessingException("Order creation failed");
        }

        return ProcessingResult.success(context.getOrder());
    }

    private TaskPipeline<OrderTaskContext> buildPipeline() {
        return TaskPipeline.<OrderTaskContext>builder("OrderCreate")
            .addTask(validateOrderTask)      // Order 100
            .addTask(assignOrderIdTask)      // Order 200
            .addTask(persistOrderTask)       // Order 400
            .addTask(publishOrderEventTask)  // Order 500
            .sortByOrder(true)
            .stopOnFailure(true)
            .build();
    }
}
```

**Transaction Behavior:**
- Entire pipeline executes atomically
- Failure rolls back order insert + event append
- Kafka events published **after** transaction commit (via Transactional Outbox)

---

### 18.6 Order Tree Navigation

```java
package org.example.oms.service;

import java.util.List;
import org.example.common.model.Order;
import org.example.oms.repository.OrderRepository;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;

/**
 * Service for navigating order tree structures.
 */
@Service
@RequiredArgsConstructor
public class OrderTreeService {

    private final OrderRepository orderRepository;

    /**
     * Find all child orders (direct children only).
     */
    public List<Order> findChildren(String parentOrderId) {
        Specification<Order> spec = (root, query, cb) ->
            cb.equal(root.get("parentOrderId"), parentOrderId);

        return orderRepository.findAll(spec);
    }

    /**
     * Find all orders in tree (root + all descendants).
     */
    public List<Order> findTree(String rootOrderId) {
        Specification<Order> spec = (root, query, cb) ->
            cb.or(
                cb.equal(root.get("orderId"), rootOrderId),
                cb.equal(root.get("rootOrderId"), rootOrderId)
            );

        return orderRepository.findAll(spec);
    }

    /**
     * Check if order has children.
     */
    public boolean hasChildren(String orderId) {
        Specification<Order> spec = (root, query, cb) ->
            cb.equal(root.get("parentOrderId"), orderId);

        return orderRepository.count(spec) > 0;
    }
}
```

---

### 18.7 Performance Optimizations

#### Query Pagination

```java
public Page<Order> findOrders(Map<String, String> params, int page, int size) {
    Specification<Order> spec = OrderSpecifications.dynamic(params);

    Pageable pageable = PageRequest.of(
        page,
        size,
        Sort.by(Sort.Direction.DESC, "creationDate")
    );

    return orderRepository.findAll(spec, pageable);
}
```

#### Hibernate Batch Configuration

**application.yml:**
```yaml
spring:
  jpa:
    properties:
      hibernate:
        jdbc.batch_size: 50
        order_inserts: true
        order_updates: true
```

---

## Related Documents

- [Domain Model](domain-model_spec.md) — Base entities (Order, Execution, Quote, QuoteRequest) persisted in the state store
- [State Machine Framework](state-machine-framework_spec.md) — Enforces valid state transitions before event persistence
- [State Query Store](state-query-store_spec.md) — Read-optimized query store synchronized with state store events via CQRS
- [Order Quantity Calculations](../oms-concepts/order-quantity-calculations.md) — Execution allocation and quantity field updates in state store
- [Order Replace](../oms-concepts/order-replace.md) — Event types for cancel/replace operations persisted to event log
- [Streaming Architecture](../oms-concepts/streaming-architecture.md) — Event emission to Kafka topics after state mutations
- [Task Orchestration Framework](task-orchestration-framework_spec.md) — Pipeline-based command processing within transactions
- [Validation Rules](validation-rules.md) — Predicate-based validation integrated into command processing pipelines
