# Domain Model Organization and OMS Core Libraries

The OMS core provides a foundation for building domain models for various asset classes (equity, exchange-traded derivatives, funds, structured products, FX, money market, and digital assets). This foundation is delivered as a set of reusable libraries.

*   **OMS Core Libraries:**

    *   **Base Entity Model:** Provides the base entity definitions for core domain objects: `Order`, `Execution`, `Quote`, and `QuoteRequest`. These entities define common attributes and behaviors.
    *   **State Machine Engine:** A generic state machine implementation for managing the lifecycle of domain objects.  It enforces state transition rules and provides extensibility for custom state logic.
    *   **Validation Engine:** A generic validation engine based on Java predicates. It allows defining and executing validation rules against domain objects to ensure data integrity. Rules are configurable and extensible on a per-asset class basis.
    *   **Orchestrator:** An orchestration engine for managing business processes and workflows within the OMS.
    *   **Query Service & Specification Builder:**  See Section 10 of OMS spec.

*   **Base Entity Model Structure:**

    ```java
    // Example (Illustrative) - Base Order Entity (OMS Core Library)
    package com.example.oms.core.model;

    public abstract class Order {
        private String orderId;
        private String clOrdID; // FIX Tag 11
        private OrderState state;
        // ... other common attributes and methods
    }

    ```

*   **Sub-Domain Model Extension:**

    *   Sub-domains (e.g., Equity, FX) extend the base entity model through Java inheritance.  This allows adding asset class-specific attributes and behaviors while reusing the common core.

    ```java
    // Example (Illustrative) - Equity Order (Sub-Domain)
    package com.example.oms.equity.model;

    import com.example.oms.core.model.Order;

    public class EquityOrder extends Order {
        private String symbol;
        // ... equity-specific attributes and methods
    }
    ```

*   **API Contracts:**

    *   **OpenAPI (Swagger):** Command and Query APIs are defined using OpenAPI contracts.  This ensures consistency and facilitates API documentation and code generation.
    *   **Avro:** The Message API (for events) uses Avro contracts to define the structure of events.

*   **API - Decoupling from Entity Model:**

    *   **DTOs (Data Transfer Objects):** Entity objects are *not* directly exposed through the APIs. Instead, they are mapped to DTOs specific to each API (Command, Query, and Message).
    *   **Namespaces:** Each API has its own namespace for DTOs and types, decoupling them from the internal entity model. This allows for API evolution without impacting the core domain.
    *   **Semantic Similarity:** While decoupled, the DTOs are semantically similar to the entity model to minimize complexity.

*   **Code Generation:**

    *   Avro contracts are used to generate message API stubs (using Gradle). This ensures type safety and reduces boilerplate.

*   **Mapping Framework (MapStruct):**

    *   MapStruct is used to automate the mapping between entity objects and DTOs. This reduces boilerplate code and improves maintainability.

*   **Sub-Domain Implementation Responsibilities:**

    *   When implementing a sub-domain-specific model, developers are responsible for defining the MapStruct mapping interfaces:
        *   Command API DTOs to Entity Model
        *   Entity Model to Query API DTOs
        *   Entity Model to Message API (Avro) objects

    ```java
    // Example (Illustrative) - MapStruct Mapping
    package com.example.oms.equity.mapping;

    import com.example.oms.equity.model.EquityOrder;
    import com.example.oms.command.api.dto.CreateEquityOrderCommand;

    import org.mapstruct.Mapper;
    import org.mapstruct.Mapping;

    @Mapper(componentModel = "spring")
    public interface EquityOrderMapper {

        @Mapping(source = "clOrdID", target = "clOrdID") //Example of explicit mapping, others can be implicit
        EquityOrder createEquityOrderCommandToEquityOrder(CreateEquityOrderCommand command);
    }
    ```

**15. Orchestration Engine**

*   The Orchestration Engine (part of the OMS Core Libraries) manages business processes and workflows.
*   It provides a mechanism for coordinating the execution of multiple services and components within the OMS.
