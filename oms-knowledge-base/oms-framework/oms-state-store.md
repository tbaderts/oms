# Order Management System (OMS) State Store Specification

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
