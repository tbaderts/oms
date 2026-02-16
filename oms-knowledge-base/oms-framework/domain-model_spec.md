# Domain Model Organization and OMS Core Libraries

**Version:** 2.0
**Last Updated:** 2026-02-14
**Author:** OMS Team
**Status:** Active

---

## 1. Overview

The OMS core provides a foundation for building domain models for various asset classes (equity, exchange-traded derivatives, funds, structured products, FX, money market, and digital assets). This foundation is delivered as a set of reusable libraries that enable spec-driven development and support event sourcing, CQRS, and microservices architecture.

This document provides complete field-level specifications for all core domain entities, including FIX protocol mappings, validation rules, and usage patterns.

---

## 2. OMS Core Libraries

The OMS Core provides these foundational components:

### 2.1 Base Entity Model
Provides base entity definitions for core domain objects: `Order`, `Execution`, `Quote`, and `QuoteRequest`. These entities define common attributes, behaviors, and relationships.

### 2.2 State Machine Engine
A generic state machine implementation for managing entity lifecycles. Enforces state transition rules with extensibility for custom logic.

**Reference:** [State Machine Framework](state-machine-framework_spec.md)

### 2.3 Validation Engine
Generic validation engine based on Java predicates. Defines and executes validation rules against domain objects to ensure data integrity. Rules are configurable and extensible per asset class.

### 2.4 Orchestrator
Orchestration engine for managing business processes and workflows within the OMS.

**Reference:** [Task Orchestration Framework](task-orchestration-framework_spec.md)

### 2.5 Query Service & Specification Builder
CQRS query patterns with specification builder for complex queries.

**Reference:** [State Query Store](state-query-store_spec.md)

---

## 3. Order Entity Specification

### 3.1 Order Entity Overview

The `Order` entity is the central domain object representing a client or market order in the trading system.

**Package:** `org.example.common.model`
**Persistence:** JPA Entity (`orders` table)
**Inheritance:** Extensible via Java inheritance for asset-specific attributes

```java
@Entity
@Table(
    name = "orders",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_orders_session_cl_ord_id",
            columnNames = {"session_id", "cl_ord_id"})
    })
@SuperBuilder(toBuilder = true)
@NoArgsConstructor
@Getter
@Jacksonized
@JsonIgnoreProperties(ignoreUnknown = true)
public class Order implements Serializable {
    // fields defined below
}
```

### 3.2 Order Identity Fields

| Field | Type | FIX Tag | Description | Constraints |
|-------|------|---------|-------------|-------------|
| `id` | `Long` | N/A | Internal database primary key | Auto-generated, sequence-based |
| `orderId` | `String` | N/A | Business order ID (internal) | Unique per order |
| `clOrdId` | `String` | 11 | Client order ID | Unique per session + client combination |
| `origClOrdId` | `String` | 41 | Original client order ID for cancel/replace | References previous `clOrdId` |
| `sessionId` | `String` | N/A | Trading session identifier | Required, part of unique constraint |

**Unique Constraint:** `(sessionId, clOrdId)` ensures no duplicate client order IDs within a session.

```java
// Pattern: Order identification
@Id
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_sequence")
@SequenceGenerator(name = "order_sequence", sequenceName = "order_seq", allocationSize = 1)
private Long id;

private String orderId;         // Business ID
private String sessionId;        // Trading session
private String clOrdId;          // FIX Tag 11
private String origClOrdId;      // FIX Tag 41 (for replace operations)
```

### 3.3 Order Hierarchy Fields

Orders form tree structures for grouped orders and market/client relationships.

| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `parentOrderId` | `String` | Direct parent order ID | For order trees (market order → client order) |
| `rootOrderId` | `String` | Root of order tree | Top-level client order in hierarchy |

```java
// Pattern: Order tree relationships
private String parentOrderId;    // Immediate parent in tree
private String rootOrderId;      // Root ancestor
```

**Reference:** [Order Grouping](../oms-concepts/order-grouping.md) — Pro-rata allocation patterns

### 3.4 Quantity Fields

Critical quantity tracking fields following FIX protocol semantics.

| Field | Type | FIX Tag | Description | Calculation |
|-------|------|---------|-------------|-------------|
| `orderQty` | `BigDecimal` | 38 | Total ordered quantity | Immutable after order creation |
| `cashOrderQty` | `BigDecimal` | 152 | Order quantity in cash terms | For cash-denominated orders |
| `placeQty` | `BigDecimal` | N/A | Quantity placed to market | Sum of child market order quantities |
| `cumQty` | `BigDecimal` | 14 | Cumulative executed quantity | Sum of execution quantities |
| `leavesQty` | `BigDecimal` | 151 | Quantity open for execution | `orderQty - cumQty` |
| `allocQty` | `BigDecimal` | N/A | Quantity allocated to client | For market → client allocation |

```java
// Pattern: Quantity field definitions
private BigDecimal orderQty;      // FIX Tag 38 - Total ordered (immutable)
private BigDecimal cashOrderQty;   // FIX Tag 152 - Cash-denominated orders
private BigDecimal placeQty;       // Quantity placed in market
private BigDecimal cumQty;         // FIX Tag 14 - Cumulative filled
private BigDecimal leavesQty;      // FIX Tag 151 - Remaining unfilled
private BigDecimal allocQty;       // Allocated to client orders
```

**Reference:** [Order Quantity Calculations](../oms-concepts/order-quantity-calculations.md)

### 3.5 Pricing Fields

| Field | Type | FIX Tag | Description |
|-------|------|---------|-------------|
| `price` | `BigDecimal` | 44 | Limit price for LIMIT orders |
| `stopPx` | `BigDecimal` | 99 | Stop price for STOP orders |
| `priceType` | `PriceType` | 423 | Price type indicator |

```java
// Pattern: Pricing fields
private BigDecimal price;          // FIX Tag 44 - Limit price
private BigDecimal stopPx;         // FIX Tag 99 - Stop price

@Enumerated(EnumType.STRING)
private PriceType priceType;       // FIX Tag 423
```

### 3.6 Security Identification Fields

| Field | Type | FIX Tag | Description |
|-------|------|---------|-------------|
| `symbol` | `String` | 55 | Ticker symbol (e.g., "AAPL", "BTC/USD") |
| `securityId` | `String` | 48 | Security identifier (ISIN, CUSIP, etc.) |
| `securityIdSource` | `SecurityIdSource` | 22 | Source of security ID |
| `securityType` | `SecurityType` | 167 | Type of security (STOCK, OPTION, FUTURE, etc.) |
| `securityDesc` | `String` | 107 | Security description |
| `securityExchange` | `String` | 207 | Exchange where security trades |

```java
// Pattern: Security identification
private String symbol;                          // FIX Tag 55

private String securityId;                      // FIX Tag 48

@Enumerated(EnumType.STRING)
private SecurityIdSource securityIdSource;      // FIX Tag 22

@Enumerated(EnumType.STRING)
private SecurityType securityType;              // FIX Tag 167

private String securityDesc;                    // FIX Tag 107
private String securityExchange;                // FIX Tag 207
```

### 3.7 Derivatives-Specific Fields

For options and futures:

| Field | Type | FIX Tag | Description |
|-------|------|---------|-------------|
| `maturityMonthYear` | `String` | 200 | Expiry date (YYYYMM format) |
| `strikePrice` | `BigDecimal` | 202 | Strike price for options |
| `putOrCall` | `Integer` | 201 | 0=Put, 1=Call |
| `underlyingSecurityType` | `String` | 310 | Type of underlying security |

```java
// Pattern: Derivatives fields (options/futures)
private String maturityMonthYear;         // FIX Tag 200 - Expiry (YYYYMM)
private BigDecimal strikePrice;           // FIX Tag 202 - Strike price
private Integer putOrCall;                 // FIX Tag 201 - 0=Put, 1=Call
private String underlyingSecurityType;     // FIX Tag 310
```

### 3.8 Order Instructions

| Field | Type | FIX Tag | Description | Enum Values |
|-------|------|---------|-------------|-------------|
| `ordType` | `OrdType` | 40 | Order type | MARKET, LIMIT, STOP, STOP_LIMIT |
| `side` | `Side` | 54 | Buy or sell | BUY, SELL, SELL_SHORT |
| `timeInForce` | `TimeInForce` | 59 | Time-in-force | DAY, GTC, IOC, FOK, GTD |
| `execInst` | `ExecInst` | 18 | Execution instructions | ALL_OR_NONE, WORK, etc. |
| `handlInst` | `HandlInst` | 21 | Handling instructions | AUTOMATED, MANUAL |
| `leg` | `Leg` | N/A | Order leg type | CLI (Client), MKT (Market) |

```java
// Pattern: Order instructions and execution parameters
@Enumerated(EnumType.STRING)
private OrdType ordType;                   // FIX Tag 40 - MARKET, LIMIT, etc.

@Enumerated(EnumType.STRING)
private Side side;                         // FIX Tag 54 - BUY, SELL, SELL_SHORT

@Enumerated(EnumType.STRING)
private TimeInForce timeInForce;           // FIX Tag 59 - DAY, GTC, IOC, FOK

@Enumerated(EnumType.STRING)
private ExecInst execInst;                 // FIX Tag 18 - Execution instructions

@Enumerated(EnumType.STRING)
private HandlInst handlInst;               // FIX Tag 21 - AUTOMATED, MANUAL

@Enumerated(EnumType.STRING)
private Leg leg;                           // CLI (Client) or MKT (Market)
```

### 3.9 Account and Routing

| Field | Type | FIX Tag | Description |
|-------|------|---------|-------------|
| `account` | `String` | 1 | Trading account |
| `exDestination` | `String` | 100 | Execution destination (broker, exchange) |

```java
// Pattern: Account and routing
private String account;                    // FIX Tag 1 - Trading account
private String exDestination;              // FIX Tag 100 - Execution destination
```

### 3.10 Timestamps

| Field | Type | FIX Tag | Description |
|-------|------|---------|-------------|
| `sendingTime` | `Instant` | 52 | Time order was sent |
| `transactTime` | `Instant` | 60 | Transaction time |
| `expireTime` | `Instant` | 126 | Expiration time for GTD orders |
| `tifTimestamp` | `Instant` | N/A | Time-in-force timestamp |

```java
// Pattern: Timestamps
private Instant sendingTime;              // FIX Tag 52
private Instant transactTime;             // FIX Tag 60
private Instant expireTime;               // FIX Tag 126 - For GTD orders
private Instant tifTimestamp;             // TIF enforcement
```

### 3.11 State Management

| Field | Type | Description | Mutable |
|-------|------|-------------|---------|
| `state` | `State` | Current order state | Yes (via setter) |
| `cancelState` | `CancelState` | Cancel/replace state | Yes (via setter) |
| `txNr` | `long` | Transaction number | Yes (via setter) |

```java
// Pattern: State management (mutable via setters)
@Setter private State state;              // Order lifecycle state
@Setter private CancelState cancelState;  // Cancel/replace state
@Setter private long txNr;                // Transaction sequence number
```

**State Values** (from `State` enum):
- `NEW` - Order created, not yet acknowledged
- `UNACK` - Order sent but not acknowledged
- `LIVE` - Order active in market
- `PARTIALLY_FILLED` - Partial execution received
- `FILLED` - Fully executed
- `CANCELED` - Canceled
- `REJECTED` - Rejected
- `EXPIRED` - Expired (GTD/IOC)

**Reference:** [State Machine Framework](state-machine-framework_spec.md)

### 3.12 Additional Fields

| Field | Type | FIX Tag | Description |
|-------|------|---------|-------------|
| `settlCurrency` | `String` | 120 | Settlement currency |
| `text` | `String` | 58 | Free-form text/comments |
| `positionEffect` | `PositionEffect` | 77 | OPEN, CLOSE position |

```java
// Pattern: Additional fields
private String settlCurrency;              // FIX Tag 120
private String text;                       // FIX Tag 58 - Free text
@Enumerated(EnumType.STRING)
private PositionEffect positionEffect;     // FIX Tag 77 - OPEN, CLOSE
```

### 3.13 Complete Order Entity Example

```java
package org.example.common.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.SuperBuilder;
import lombok.extern.jackson.Jacksonized;

@Entity
@Table(
    name = "orders",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_orders_session_cl_ord_id",
            columnNames = {"session_id", "cl_ord_id"})
    })
@SuperBuilder(toBuilder = true)
@NoArgsConstructor
@Getter
@Jacksonized
public class Order implements Serializable {

    // Identity
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_sequence")
    @SequenceGenerator(name = "order_sequence", sequenceName = "order_seq", allocationSize = 1)
    private Long id;

    private String orderId;
    private String clOrdId;
    private String origClOrdId;
    private String sessionId;

    // Hierarchy
    private String parentOrderId;
    private String rootOrderId;

    // Quantities (FIX protocol)
    private BigDecimal orderQty;       // FIX Tag 38
    private BigDecimal cashOrderQty;   // FIX Tag 152
    private BigDecimal placeQty;
    private BigDecimal cumQty;         // FIX Tag 14
    private BigDecimal leavesQty;      // FIX Tag 151
    private BigDecimal allocQty;

    // Security identification
    private String symbol;             // FIX Tag 55
    private String securityId;         // FIX Tag 48
    @Enumerated(EnumType.STRING)
    private SecurityIdSource securityIdSource;
    @Enumerated(EnumType.STRING)
    private SecurityType securityType;
    private String securityDesc;
    private String securityExchange;

    // Pricing
    private BigDecimal price;          // FIX Tag 44
    private BigDecimal stopPx;         // FIX Tag 99
    @Enumerated(EnumType.STRING)
    private PriceType priceType;

    // Instructions
    @Enumerated(EnumType.STRING)
    private OrdType ordType;           // FIX Tag 40
    @Enumerated(EnumType.STRING)
    private Side side;                 // FIX Tag 54
    @Enumerated(EnumType.STRING)
    private TimeInForce timeInForce;   // FIX Tag 59
    @Enumerated(EnumType.STRING)
    private ExecInst execInst;
    @Enumerated(EnumType.STRING)
    private HandlInst handlInst;
    @Enumerated(EnumType.STRING)
    private Leg leg;

    // Derivatives
    private String maturityMonthYear;
    private BigDecimal strikePrice;
    private Integer putOrCall;
    private String underlyingSecurityType;

    // Account and routing
    private String account;            // FIX Tag 1
    private String exDestination;      // FIX Tag 100

    // Timestamps
    private Instant sendingTime;       // FIX Tag 52
    private Instant transactTime;      // FIX Tag 60
    private Instant expireTime;        // FIX Tag 126
    private Instant tifTimestamp;

    // State (mutable)
    @Setter private State state;
    @Setter private CancelState cancelState;
    @Setter private long txNr;

    // Additional
    private String settlCurrency;
    private String text;
    @Enumerated(EnumType.STRING)
    private PositionEffect positionEffect;
}
```

---

## 4. Execution Entity Specification

### 4.1 Execution Entity Overview

The `Execution` entity represents a fill or partial fill of an order, received from an exchange or broker.

**Package:** `org.example.common.model`
**Persistence:** JPA Entity (`executions` table)

```java
@Entity
@Table(name = "executions")
@SuperBuilder
@NoArgsConstructor
@Getter
public class Execution implements Serializable {
    // fields defined below
}
```

### 4.2 Execution Fields

| Field | Type | FIX Tag | Description |
|-------|------|---------|-------------|
| `id` | `Long` | N/A | Internal database primary key |
| `orderId` | `String` | 37 | Order ID (links to Order) |
| `executionId` | `String` | N/A | Internal execution ID |
| `execID` | `String` | 17 | Unique execution ID from exchange |
| `execType` | `String` | 150 | Execution type (NEW, FILL, CANCEL, etc.) |
| `lastQty` | `BigDecimal` | 32 | Quantity of this execution |
| `lastPx` | `BigDecimal` | 31 | Price of this execution |
| `cumQty` | `BigDecimal` | 14 | Cumulative quantity after this execution |
| `avgPx` | `BigDecimal` | 6 | Average price across all executions |
| `leavesQty` | `BigDecimal` | 151 | Remaining quantity after this execution |
| `dayOrderQty` | `BigDecimal` | 424 | Day order quantity |
| `dayCumQty` | `BigDecimal` | 425 | Day cumulative quantity |
| `dayAvgPx` | `BigDecimal` | 426 | Day average price |
| `lastMkt` | `String` | 30 | Market where execution occurred |
| `lastCapacity` | `String` | 29 | Capacity in which execution occurred |
| `secondaryExecID` | `String` | 527 | Secondary execution ID |
| `transactTime` | `Instant` | 60 | Transaction time of execution |
| `creationDate` | `Instant` | N/A | Internal creation timestamp |

### 4.3 Complete Execution Entity Example

```java
package org.example.common.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.SuperBuilder;

@Entity
@Table(name = "executions")
@SuperBuilder
@NoArgsConstructor
@Getter
public class Execution implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "execution_sequence")
    @SequenceGenerator(
            name = "execution_sequence",
            sequenceName = "execution_seq",
            allocationSize = 1)
    private Long id;

    // Linkage to order
    private String orderId;              // FIX Tag 37
    private String executionId;          // Internal ID
    private String execID;               // FIX Tag 17 - Exchange execution ID

    // Execution details
    private String execType;             // FIX Tag 150 - NEW, FILL, CANCEL, etc.
    private BigDecimal lastQty;          // FIX Tag 32 - This execution quantity
    private BigDecimal lastPx;           // FIX Tag 31 - This execution price
    private BigDecimal cumQty;           // FIX Tag 14 - Cumulative filled
    private BigDecimal avgPx;            // FIX Tag 6 - Average price
    private BigDecimal leavesQty;        // FIX Tag 151 - Remaining quantity

    // Day trading fields
    private BigDecimal dayOrderQty;      // FIX Tag 424
    private BigDecimal dayCumQty;        // FIX Tag 425
    private BigDecimal dayAvgPx;         // FIX Tag 426

    // Market information
    private String lastMkt;              // FIX Tag 30
    private String lastCapacity;         // FIX Tag 29
    private String secondaryExecID;      // FIX Tag 527

    // Timestamps
    private Instant transactTime;        // FIX Tag 60
    private Instant creationDate;        // Internal timestamp
}
```

**Reference:** [Order Quantity Calculations](../oms-concepts/order-quantity-calculations.md)

---

## 5. Sub-Domain Model Extension

Sub-domains (e.g., Equity, FX, Digital Assets) extend the base entity model through Java inheritance. This allows adding asset class-specific attributes while reusing the common core.

### 5.1 Equity Order Example

```java
package org.example.oms.equity.model;

import org.example.common.model.Order;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.*;
import lombok.experimental.SuperBuilder;

@Entity
@Table(name = "equity_orders")
@SuperBuilder
@NoArgsConstructor
@Getter
public class EquityOrder extends Order {

    // Equity-specific fields
    private String settlementDate;      // Settlement date (T+2, T+3)
    private String locateId;            // Stock locate ID for short sales
    private String marketSegment;       // Market segment/board
    private BigDecimal maxFloor;        // Iceberg order display quantity
}
```

### 5.2 FX Order Example

```java
package org.example.oms.fx.model;

import org.example.common.model.Order;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.*;
import lombok.experimental.SuperBuilder;

@Entity
@Table(name = "fx_orders")
@SuperBuilder
@NoArgsConstructor
@Getter
public class FXOrder extends Order {

    // FX-specific fields
    private String currencyPair;        // e.g., "EUR/USD"
    private BigDecimal forwardPoints;   // Forward points for FX forwards
    private String settlementType;      // SPOT, FORWARD, SWAP
    private Instant valueDate;          // Value date for settlement
}
```

---

## 6. API Contracts and Code Generation

### 6.1 OpenAPI Contracts

Command and Query APIs are defined using OpenAPI specifications:

- **Command API:** `oms-cmd-api.yml` — Order create, modify, cancel operations
- **Query API:** `oms-query-api.yml` — Order queries, search, filtering

**Code Generation:**
```bash
./gradlew openApiGenerateCmd      # Generates command API DTOs
./gradlew openApiGenerateQuery    # Generates query API DTOs
```

**Generated Locations:**
- Command DTOs: `build/generated/src/main/java/org/example/common/model/cmd`
- Query DTOs: `build/generated/src/main/java/org/example/common/model/query`

### 6.2 Avro Contracts

The Message API (for events) uses Avro schemas:

- Source schemas: `src/main/avro/*.avsc`
- Package: `org.example.common.model.msg`

**Code Generation:**
```bash
./gradlew openApiGenerateAvro     # Generates Avro Java classes
```

---

## 7. API - Decoupling from Entity Model

### 7.1 DTOs (Data Transfer Objects)

Entity objects are **not** directly exposed through APIs. Instead, they are mapped to DTOs specific to each API (Command, Query, Message).

**Benefits:**
- API evolution without impacting core domain
- Semantic versioning at API level
- Different representations for different consumers

### 7.2 Namespaces

Each API has its own namespace:

- **Entities:** `org.example.common.model` (Order.java, Execution.java)
- **Command API:** `org.example.common.model.cmd` (OrderCreateCmd, OrderAcceptCmd)
- **Query API:** `org.example.common.model.query` (OrderDto, PagedOrderDto)
- **Message API:** `org.example.common.model.msg` (OrderMessage, OrderEvent)

### 7.3 Semantic Similarity

While decoupled, DTOs are semantically similar to entities to minimize complexity.

---

## 8. Mapping Framework (MapStruct)

MapStruct automates entity-to-DTO mapping, reducing boilerplate and improving maintainability.

### 8.1 Mapping Interface Example

```java
package org.example.oms.equity.mapping;

import org.example.oms.equity.model.EquityOrder;
import org.example.common.model.cmd.CreateEquityOrderCommand;
import org.example.common.model.query.OrderDto;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface EquityOrderMapper {

    // Command DTO → Entity
    @Mapping(source = "clOrdID", target = "clOrdId")
    @Mapping(source = "orderQuantity", target = "orderQty")
    EquityOrder createCommandToEntity(CreateEquityOrderCommand command);

    // Entity → Query DTO
    @Mapping(source = "clOrdId", target = "clOrdID")
    @Mapping(source = "orderQty", target = "orderQuantity")
    OrderDto entityToDto(EquityOrder order);
}
```

**Usage in Service:**
```java
@Service
@RequiredArgsConstructor
public class EquityOrderService {

    private final EquityOrderMapper mapper;
    private final OrderRepository repository;

    public OrderDto createOrder(CreateEquityOrderCommand command) {
        EquityOrder order = mapper.createCommandToEntity(command);
        order = repository.save(order);
        return mapper.entityToDto(order);
    }
}
```

---

## 9. Sub-Domain Implementation Responsibilities

When implementing a sub-domain-specific model, developers define MapStruct mapping interfaces:

1. **Command API DTOs → Entity Model**
2. **Entity Model → Query API DTOs**
3. **Entity Model → Message API (Avro) objects**

---

## 10. Orchestration Engine

The Orchestration Engine (part of OMS Core Libraries) manages business processes and workflows, coordinating execution of multiple services and components.

**Reference:** [Task Orchestration Framework](task-orchestration-framework_spec.md)

---

## Related Documents

- [State Machine Framework](state-machine-framework_spec.md) — Manages Order, Execution, Quote, and QuoteRequest entity lifecycles through state transitions
- [Task Orchestration Framework](task-orchestration-framework_spec.md) — Orchestration pattern for entity lifecycle workflows and business processes
- [OMS State Store](oms-state-store.md) — Persistence layer for domain entities using event sourcing
- [Order Grouping](../oms-concepts/order-grouping.md) — Extended Order entity with grouping fields and parent-member relationships
- [Order Quantity Calculations](../oms-concepts/order-quantity-calculations.md) — Detailed field definitions and calculations for Order entity quantity fields
