# OMS Core Architecture Specification

**Version:** 1.0  
**Last Updated:** November 29, 2025  
**Status:** Final  
**Author:** OMS Architecture Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture Principles](#3-architecture-principles)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Core Components](#5-core-components)
6. [CQRS and Event Sourcing](#6-cqrs-and-event-sourcing)
7. [Domain Model](#7-domain-model)
8. [State Management](#8-state-management)
9. [Task Orchestration](#9-task-orchestration)
10. [Real-Time Streaming](#10-real-time-streaming)
11. [API Architecture](#11-api-architecture)
12. [Data Flow Patterns](#12-data-flow-patterns)
13. [Technology Stack](#13-technology-stack)
14. [Development Methodology](#14-development-methodology)
15. [Improvement Recommendations](#15-improvement-recommendations)

---

## 1. Executive Summary

The Order Management System (OMS) is a securities trading platform built using modern architectural patterns including **Event Sourcing**, **CQRS (Command Query Responsibility Segregation)**, and **Event-Driven Architecture**. The system is designed for high throughput, low latency, and horizontal scalability.

### Key Characteristics

- **Event-Driven**: All state changes captured as immutable events
- **CQRS**: Separate read and write models for optimal performance
- **Spec-Driven**: OpenAPI and Avro schemas define all contracts
- **AI-Assisted Development**: GitHub Copilot integration for rapid development
- **Reactive**: Spring WebFlux and RSocket for real-time streaming
- **Cloud-Native**: Azure deployment with managed services

```mermaid
graph TB
    subgraph "OMS Core Platform"
        direction TB
        CMD[Command API]
        QRY[Query API]
        EVT[Event Streaming]
        UI[Trade Blotter UI]
    end
    
    subgraph "Core Patterns"
        ES[Event Sourcing]
        CQ[CQRS]
        SM[State Machine]
        TO[Task Orchestration]
    end
    
    subgraph "Technology"
        SB[Spring Boot]
        KF[Kafka]
        PG[PostgreSQL]
        RS[RSocket]
    end
    
    CMD --> ES
    ES --> CQ
    CQ --> QRY
    ES --> EVT
    SM --> CMD
    TO --> CMD
    
    SB --> CMD
    SB --> QRY
    KF --> EVT
    PG --> CQ
    RS --> UI
    
    style CMD fill:#4169E1,color:#FFF
    style QRY fill:#32CD32,color:#FFF
    style EVT fill:#FF6347,color:#FFF
    style ES fill:#FFD700
    style CQ fill:#FFD700
```

---

## 2. System Overview

### 2.1 Business Context

The OMS manages the complete lifecycle of securities trading orders across multiple asset classes:

- **Equity** orders
- **Exchange-traded derivatives**
- **Funds** (subscribe/redeem)
- **Structured products**
- **FX and Money Market**
- **Digital Assets**

### 2.2 Core Domain Objects

```mermaid
erDiagram
    ORDER ||--o{ EXECUTION : has
    ORDER ||--o{ ORDER : "parent-child"
    QUOTE_REQUEST ||--o{ QUOTE : generates
    ORDER {
        string orderId PK
        string parentOrderId FK
        string rootOrderId FK
        string clOrdId
        string symbol
        enum side
        enum state
        decimal orderQty
        decimal cumQty
        decimal leavesQty
        decimal avgPx
    }
    EXECUTION {
        string execId PK
        string orderId FK
        decimal lastQty
        decimal lastPx
        timestamp transactTime
    }
    QUOTE_REQUEST {
        string quoteReqId PK
        string symbol
        decimal quantity
    }
    QUOTE {
        string quoteId PK
        string quoteReqId FK
        decimal price
    }
```

---

## 3. Architecture Principles

### 3.1 Core Values

The OMS architecture follows these guiding principles from the team manifesto:

| Principle | Description |
|-----------|-------------|
| **Specification-Driven** | OpenAPI/Avro schemas are the source of truth |
| **Event Sourcing** | All state changes persisted as events |
| **CQRS** | Separate command and query models |
| **Test-Driven** | TDD/BDD for quality assurance |
| **Simplicity** | Clear, maintainable code |
| **Data-Driven** | Metrics inform decisions |

### 3.2 Design Principles

```mermaid
mindmap
  root((OMS Design))
    Immutability
      Thread Safety
      Auditability
      Event Replay
    Type Safety
      OpenAPI Generation
      Avro Schemas
      Generic State Machine
    Separation of Concerns
      Commands vs Queries
      Domain vs API DTOs
      Task Pipelines
    Resilience
      Circuit Breakers
      Retry Policies
      Error Handling
```

---

## 4. High-Level Architecture

### 4.1 System Architecture

```mermaid
graph TB
    subgraph "External Systems"
        AM[Asset Managers]
        MKT[Market Venues]
        RISK[Risk Systems]
    end
    
    subgraph "Presentation Layer"
        TB[Trade Blotter UI<br/>React + AG Grid]
        API_GW[API Gateway]
    end
    
    subgraph "OMS Core Services"
        direction TB
        
        subgraph "Command Side"
            CMD_API[Command API<br/>POST /commands/*]
            CMD_HANDLER[Command Handlers]
            VALIDATOR[Validation Engine]
            SM[State Machine]
            ORCH[Task Orchestrator]
        end
        
        subgraph "Query Side"
            QRY_API[Query API<br/>GET /queries/*]
            SPEC_BUILDER[Specification Builder]
            QRY_SVC[Query Service]
        end
        
        subgraph "Event Processing"
            EVT_PUB[Event Publisher]
            EVT_PROC[Stream Processor]
            PROJ[Projections]
        end
    end
    
    subgraph "Data Layer"
        direction LR
        EVT_STORE[(Event Store<br/>PostgreSQL)]
        READ_DB[(Query Store<br/>PostgreSQL)]
        KAFKA[Kafka<br/>Event Topics]
    end
    
    subgraph "Infrastructure"
        PROM[Prometheus]
        LOKI[Loki]
        TRACE[Distributed Tracing]
    end
    
    AM -->|Orders| API_GW
    API_GW --> CMD_API
    API_GW --> QRY_API
    
    CMD_API --> CMD_HANDLER
    CMD_HANDLER --> VALIDATOR
    CMD_HANDLER --> SM
    CMD_HANDLER --> ORCH
    ORCH --> EVT_PUB
    
    EVT_PUB --> EVT_STORE
    EVT_PUB --> KAFKA
    
    KAFKA --> EVT_PROC
    EVT_PROC --> PROJ
    PROJ --> READ_DB
    
    QRY_API --> SPEC_BUILDER
    SPEC_BUILDER --> QRY_SVC
    QRY_SVC --> READ_DB
    
    KAFKA --> TB
    TB --> RS[RSocket/WebSocket]
    
    EVT_PROC --> MKT
    KAFKA --> RISK
    
    style CMD_API fill:#4169E1,color:#FFF
    style QRY_API fill:#32CD32,color:#FFF
    style KAFKA fill:#FF6347,color:#FFF
    style EVT_STORE fill:#9370DB,color:#FFF
    style READ_DB fill:#9370DB,color:#FFF
```

### 4.2 Module Structure

```
oms/
├── oms-core/                 # Core OMS functionality
│   ├── src/main/java/
│   │   ├── org.example.common/    # Shared libraries
│   │   │   ├── model/             # Base entities
│   │   │   ├── orchestration/     # Task framework
│   │   │   ├── state/             # State machine
│   │   │   └── util/              # Utilities
│   │   └── org.example.oms/       # OMS application
│   │       ├── api/               # Controllers
│   │       ├── config/            # Configuration
│   │       ├── model/             # Domain entities
│   │       └── service/           # Business services
│   └── src/main/openapi/          # API specifications
│
├── oms-mcp-server/           # Model Context Protocol server
│   └── AI-assisted documentation & tools
│
├── oms-ui/                   # Trade Blotter UI
│   └── frontend/             # React application
│
└── oms-knowledge-base/       # Domain documentation
    ├── oms-concepts/         # Business concepts
    ├── oms-framework/        # Technical specs
    └── illustrations/        # Diagrams
```

---

## 5. Core Components

### 5.1 Component Overview

```mermaid
graph LR
    subgraph "OMS Core Libraries"
        BEM[Base Entity Model]
        SME[State Machine Engine]
        VE[Validation Engine]
        ORCH[Orchestrator]
        QSS[Query Service & Spec Builder]
    end
    
    subgraph "Domain-Specific"
        EQ[Equity Module]
        DER[Derivatives Module]
        FX[FX Module]
    end
    
    BEM --> EQ
    BEM --> DER
    BEM --> FX
    SME --> EQ
    VE --> EQ
    ORCH --> EQ
    QSS --> EQ
    
    style BEM fill:#4169E1,color:#FFF
    style SME fill:#4169E1,color:#FFF
    style VE fill:#4169E1,color:#FFF
    style ORCH fill:#4169E1,color:#FFF
    style QSS fill:#4169E1,color:#FFF
```

### 5.2 Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **Base Entity Model** | Core domain objects: Order, Execution, Quote, QuoteRequest |
| **State Machine Engine** | Generic, type-safe state transition validation |
| **Validation Engine** | Predicate-based business rule enforcement |
| **Orchestrator** | Task pipeline execution and workflow management |
| **Query Service** | Specification-based dynamic queries |

---

## 6. CQRS and Event Sourcing

### 6.1 Write Path (Command Side)

```mermaid
sequenceDiagram
    participant Client
    participant CmdAPI as Command API
    participant Handler as Command Handler
    participant Val as Validator
    participant SM as State Machine
    participant Store as Event Store
    participant Kafka
    
    Client->>CmdAPI: POST /commands/orders
    CmdAPI->>Handler: OrderCreateCmd
    Handler->>Val: validate(order)
    Val-->>Handler: ValidationResult
    
    alt Validation Failed
        Handler-->>CmdAPI: 400 Bad Request
    else Validation Passed
        Handler->>SM: validateTransition(NEW)
        SM-->>Handler: Valid
        Handler->>Store: append(OrderCreatedEvent)
        Store-->>Handler: EventId
        Handler->>Kafka: publish(order-events)
        Handler-->>CmdAPI: 200 OK {id, status}
    end
    
    CmdAPI-->>Client: CommandResult
```

### 6.2 Read Path (Query Side)

```mermaid
sequenceDiagram
    participant Client
    participant QryAPI as Query API
    participant SpecBuilder as Specification Builder
    participant QrySvc as Query Service
    participant ReadDB as Query Store
    
    Client->>QryAPI: GET /search?symbol=AAPL&state=LIVE
    QryAPI->>SpecBuilder: buildSpec(params)
    SpecBuilder->>SpecBuilder: parseFilters()
    SpecBuilder->>SpecBuilder: buildPredicate()
    SpecBuilder-->>QryAPI: Specification
    QryAPI->>QrySvc: findOrders(spec, pageable)
    QrySvc->>ReadDB: SELECT with predicates
    ReadDB-->>QrySvc: ResultSet
    QrySvc-->>QryAPI: Page<OrderDto>
    QryAPI-->>Client: PagedOrderDto
```

### 6.3 State-Query Store Synchronization

```mermaid
graph TD
    subgraph "Write Path"
        App_W[Application] -->|Commands| EventStore[(Event Store<br/>PostgreSQL)]
    end
    
    subgraph "Projection"
        EventStore -->|Events| Kafka[Kafka Topics]
        Kafka -->|Consume| Projector[Projector Service]
        Projector -->|Materialize| QueryStore[(Query Store<br/>Read Replica)]
    end
    
    subgraph "Read Path"
        App_R[Application] -->|Queries| QueryStore
    end
    
    style EventStore fill:#9370DB,color:#FFF
    style QueryStore fill:#32CD32,color:#FFF
    style Kafka fill:#FF6347,color:#FFF
```

---

## 7. Domain Model

### 7.1 Order Hierarchy

The OMS supports hierarchical order trees to represent parent-child relationships:

```mermaid
graph TB
    subgraph "Order Tree Structure"
        CO[Client Order<br/>ROOT]
        GO[Grouped Order<br/>PARENT]
        MO1[Market Order 1]
        MO2[Market Order 2]
        SL1[Slice Order 1]
        SL2[Slice Order 2]
    end
    
    CO --> GO
    GO --> MO1
    GO --> MO2
    MO1 --> SL1
    MO1 --> SL2
    
    style CO fill:#e1f5ff,stroke:#0366d6,stroke-width:3px
    style GO fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style MO1 fill:#d4edda,stroke:#28a745,stroke-width:2px
    style MO2 fill:#d4edda,stroke:#28a745,stroke-width:2px
```

### 7.2 Order Entity Fields

```java
Order {
    // Identity
    String orderId;        // Primary identifier
    String parentOrderId;  // Parent in hierarchy
    String rootOrderId;    // Root of order tree
    String clOrdId;        // Client order ID (FIX Tag 11)
    
    // Core Attributes
    String symbol;
    Side side;            // BUY, SELL, SELL_SHORT
    OrdType ordType;      // MARKET, LIMIT, STOP
    BigDecimal price;
    BigDecimal orderQty;
    
    // Execution Tracking
    BigDecimal cumQty;     // Cumulative executed
    BigDecimal leavesQty;  // Remaining open
    BigDecimal avgPx;      // Average price
    BigDecimal placeQty;   // Placed in market
    BigDecimal allocQty;   // Allocated to client
    
    // State
    State state;          // NEW, UNACK, LIVE, FILLED, CXL, REJ
    CancelState cancelState;
    
    // Grouping
    String groupOrderId;
    Boolean isGroupedOrder;
    Integer memberCount;
}
```

### 7.3 Quantity Calculation Flow

```mermaid
graph LR
    subgraph "Client Order"
        CO_OQ[orderQty: 1000]
        CO_PQ[placeQty: 800]
        CO_CQ[cumQty: 600]
        CO_LQ[leavesQty: 400]
    end
    
    subgraph "Market Order"
        MO_OQ[orderQty: 800]
        MO_CQ[cumQty: 600]
        MO_AQ[allocQty: 600]
    end
    
    subgraph "Execution"
        EX[lastQty: 600<br/>lastPx: 150.00]
    end
    
    EX -->|update| MO_CQ
    MO_AQ -->|propagate| CO_CQ
    MO_OQ -->|sum| CO_PQ
    
    style CO_OQ fill:#e1f5ff
    style MO_CQ fill:#d4edda
    style EX fill:#fff3cd
```

---

## 8. State Management

### 8.1 Order State Machine

```mermaid
stateDiagram-v2
    [*] --> NEW: Order Created
    
    NEW --> UNACK: Submit to Market
    UNACK --> LIVE: Market Accepts
    UNACK --> REJ: Market Rejects
    
    LIVE --> FILLED: Full Execution
    LIVE --> CXL: Cancelled
    LIVE --> REJ: Late Rejection
    LIVE --> EXP: Expired
    
    FILLED --> CLOSED: Settlement
    CXL --> CLOSED: Cleanup
    REJ --> CLOSED: Cleanup
    EXP --> CLOSED: Cleanup
    
    CLOSED --> [*]
    
    note right of NEW
        Initial State
        Order created locally
    end note
    
    note right of UNACK
        Sent to market
        Awaiting ACK/NAK
    end note
    
    note right of LIVE
        Active in market
        Eligible for execution
    end note
    
    note right of FILLED
        Fully executed
        All quantity filled
    end note
    
    note right of CLOSED
        Terminal state
        No further changes
    end note
```

### 8.2 State Machine Implementation

The framework provides a generic, type-safe state machine:

```mermaid
classDiagram
    class StateMachineConfig~S~ {
        -Class~S~ stateClass
        -Map~S, Set~S~~ validTransitions
        -Set~S~ terminalStates
        -Set~S~ initialStates
        +builder(Class) Builder
        +isValidTransition(S, S) boolean
        +getValidTransitions(S) Set~S~
    }
    
    class StateMachine~S~ {
        -StateMachineConfig~S~ config
        +transition(S, S) Optional~S~
        +validateSequence(S, S...) TransitionResult
        +isTerminalState(S) boolean
    }
    
    class TransitionResult~S~ {
        -boolean valid
        -List~S~ path
        -S failedFrom
        -S failedTo
        +isValid() boolean
        +getErrorMessage() String
    }
    
    StateMachineConfig --> StateMachine
    StateMachine --> TransitionResult
```

### 8.3 State Transition Matrix

| From State | → NEW | → UNACK | → LIVE | → FILLED | → CXL | → REJ | → CLOSED | → EXP |
|------------|-------|---------|--------|----------|-------|-------|----------|-------|
| **NEW**    | -     | ✓       | -      | -        | -     | -     | -        | -     |
| **UNACK**  | -     | -       | ✓      | -        | -     | ✓     | -        | -     |
| **LIVE**   | -     | -       | -      | ✓        | ✓     | ✓     | -        | ✓     |
| **FILLED** | -     | -       | -      | -        | -     | -     | ✓        | -     |
| **CXL**    | -     | -       | -      | -        | -     | -     | ✓        | -     |
| **REJ**    | -     | -       | -      | -        | -     | -     | ✓        | -     |
| **CLOSED** | -     | -       | -      | -        | -     | -     | -        | -     |
| **EXP**    | -     | -       | -      | -        | -     | -     | -        | -     |

---

## 9. Task Orchestration

### 9.1 Task Pipeline Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        CMD[Command Handler]
        SVC[Business Service]
    end
    
    subgraph "Orchestration Layer"
        ORCH[TaskOrchestrator]
        PIPE[TaskPipeline]
    end
    
    subgraph "Task Layer"
        T1[ValidateTransactionTask]
        T2[ValidateOrderTask]
        T3[StateTransitionTask]
        T4[PersistOrderTask]
        T5[PublishEventTask]
    end
    
    subgraph "Context"
        CTX[OrderTaskContext]
    end
    
    CMD --> ORCH
    SVC --> ORCH
    ORCH --> PIPE
    PIPE --> T1
    T1 --> T2
    T2 --> T3
    T3 --> T4
    T4 --> T5
    T1 -.-> CTX
    T2 -.-> CTX
    T3 -.-> CTX
    T4 -.-> CTX
    T5 -.-> CTX
    
    style ORCH fill:#4169E1,color:#FFF
    style PIPE fill:#32CD32,color:#FFF
    style CTX fill:#FFD700
```

### 9.2 Task Execution Flow

```mermaid
sequenceDiagram
    participant Client
    participant Orchestrator
    participant Pipeline
    participant Task1 as Validate
    participant Task2 as Persist
    participant Context
    
    Client->>Orchestrator: execute(pipeline, context)
    Orchestrator->>Pipeline: getTasks()
    Pipeline-->>Orchestrator: [Task1, Task2, ...]
    
    loop For each task
        Orchestrator->>Task1: checkPrecondition()
        alt Precondition met
            Orchestrator->>Task1: execute(context)
            Task1->>Context: put("validated", true)
            Task1-->>Orchestrator: SUCCESS
        else Precondition not met
            Orchestrator-->>Orchestrator: SKIPPED
        end
        
        alt Task failed AND stopOnFailure
            Orchestrator-->>Client: PipelineResult(FAILED)
        end
    end
    
    Orchestrator-->>Client: PipelineResult(SUCCESS)
```

### 9.3 OMS Order Processing Pipeline

```mermaid
graph LR
    A[Validate Transaction] --> B[Validate Order]
    B --> C[State Transition]
    C --> D[Business Rules]
    D --> E[Risk Check]
    E --> F[Persist Order]
    F --> G[Publish Event]
    
    style A fill:#e1f5ff
    style B fill:#e1f5ff
    style C fill:#fff4e1
    style D fill:#fff4e1
    style E fill:#ffe1e1
    style F fill:#e1ffe1
    style G fill:#e1ffe1
```

---

## 10. Real-Time Streaming

### 10.1 Trade Blotter Architecture

```mermaid
graph BT
    subgraph "Frontend"
        TB[Trade Blotter UI<br/>React + AG Grid]
    end
    
    subgraph "Real-Time Layer"
        RS[RSocket/WebSocket<br/>Bidirectional Stream]
    end
    
    subgraph "Backend Services"
        SP[Stream Processor<br/>Spring WebFlux]
        QS[Query Service<br/>Initial Snapshot]
    end
    
    subgraph "Event Sources"
        KAFKA[Kafka Topics<br/>order-events<br/>execution-events]
    end
    
    subgraph "Data Store"
        DB[(PostgreSQL)]
    end
    
    TB <-->|Filter & Subscribe| RS
    RS <-->|Reactive Stream| SP
    SP <-->|Initial Load| QS
    QS --> DB
    KAFKA --> SP
    
    style TB fill:#c2185b,color:#FFF
    style RS fill:#fbc02d
    style SP fill:#388e3c,color:#FFF
    style KAFKA fill:#f57c00,color:#FFF
```

### 10.2 Streaming Data Flow

```mermaid
sequenceDiagram
    participant UI as Trade Blotter
    participant WS as RSocket Server
    participant SP as Stream Processor
    participant QS as Query Service
    participant Kafka
    participant DB
    
    UI->>WS: Subscribe(filter: symbol=AAPL)
    WS->>SP: Create filtered stream
    
    par Initial Snapshot
        SP->>QS: loadSnapshot(filter)
        QS->>DB: SELECT WHERE symbol='AAPL'
        DB-->>QS: Result Set
        QS-->>SP: Initial Orders
        SP-->>WS: Batch(orders)
        WS-->>UI: Initial Data
    and Real-Time Updates
        Kafka->>SP: OrderUpdatedEvent
        SP->>SP: Apply filter
        alt Matches filter
            SP-->>WS: Update(order)
            WS-->>UI: Real-time update
        end
    end
```

---

## 11. API Architecture

### 11.1 OpenAPI Specification Structure

```mermaid
graph TD
    subgraph "Command API (oms-cmd-api.yml)"
        C1[POST /execute]
        C2[OrderCreateCmd]
        C3[ExecutionCreateCmd]
        C4[OrderAcceptCmd]
    end
    
    subgraph "Query API (oms-query-api.yml)"
        Q1[GET /search]
        Q2[Dynamic Filters]
        Q3[Pagination]
        Q4[Sorting]
    end
    
    subgraph "Generated Code"
        DTO[DTOs]
        CTRL[Controllers]
        CLIENT[API Clients]
    end
    
    C1 --> DTO
    Q1 --> DTO
    DTO --> CTRL
    DTO --> CLIENT
    
    style C1 fill:#4169E1,color:#FFF
    style Q1 fill:#32CD32,color:#FFF
```

### 11.2 Command Types

| Command | Description | Payload |
|---------|-------------|---------|
| `OrderCreateCmd` | Create new order | Order object |
| `OrderAcceptCmd` | Accept/acknowledge order | orderId |
| `ExecutionCreateCmd` | Report execution | Execution object |
| `ExecutionWhackCmd` | Cancel execution | executionId |
| `ExecutionBustCmd` | Bust/reverse execution | executionId |

### 11.3 Query Filters

| Filter Type | Syntax | Example |
|-------------|--------|---------|
| Equality | `field=value` | `symbol=AAPL` |
| Like | `field__like=text` | `symbol__like=AA` |
| Greater Than | `field__gt=value` | `price__gt=100` |
| Between | `field__between=a,b` | `price__between=100,200` |

---

## 12. Data Flow Patterns

### 12.1 Order Lifecycle

```mermaid
sequenceDiagram
    participant Client
    participant OMS
    participant SM as State Machine
    participant Store as Event Store
    participant Market
    participant Kafka
    
    Client->>OMS: OrderCreateCmd
    OMS->>SM: validate(null → NEW)
    SM-->>OMS: Valid
    OMS->>Store: OrderCreatedEvent
    OMS->>Kafka: publish(order-events)
    OMS-->>Client: CommandResult(OK)
    
    OMS->>Market: PlaceOrder
    OMS->>SM: validate(NEW → UNACK)
    SM-->>OMS: Valid
    OMS->>Store: OrderUnackEvent
    OMS->>Kafka: publish(order-events)
    
    Market-->>OMS: Accepted
    OMS->>SM: validate(UNACK → LIVE)
    OMS->>Store: OrderLiveEvent
    OMS->>Kafka: publish(order-events)
    
    Market-->>OMS: Execution(qty=500)
    OMS->>Store: ExecutionEvent
    OMS->>OMS: updateQuantities()
    OMS->>SM: validate(LIVE → FILLED)
    OMS->>Store: OrderFilledEvent
    OMS->>Kafka: publish(order-events)
```

### 12.2 Execution Allocation Flow

```mermaid
graph TD
    subgraph "Market Order Executed"
        MKT[Market Order<br/>CumQty: 500]
        EX[Execution<br/>LastQty: 500]
    end
    
    subgraph "Allocation Decision"
        AUTO{Auto Allocation?}
        STP[STP: Immediate]
        MAN[Manual: Pending]
    end
    
    subgraph "Client Order Update"
        CLI[Client Order<br/>AllocatedQty updated]
    end
    
    EX --> MKT
    MKT --> AUTO
    AUTO -->|Yes| STP
    AUTO -->|No| MAN
    STP --> CLI
    MAN -->|After Approval| CLI
    
    style MKT fill:#d4edda
    style EX fill:#fff3cd
    style CLI fill:#e1f5ff
```

---

## 13. Technology Stack

### 13.1 Core Technologies

```mermaid
graph TD
    subgraph "Application Layer"
        JAVA[Java 21]
        SB[Spring Boot 3.x]
        WF[Spring WebFlux]
        DATA[Spring Data JPA]
    end
    
    subgraph "Messaging"
        KAFKA[Confluent Kafka]
        AVRO[Avro Schemas]
        SR[Schema Registry]
    end
    
    subgraph "Data Storage"
        PG[PostgreSQL<br/>Azure Database]
        EVT_TBL[Event Tables]
        STATE_TBL[State Tables]
    end
    
    subgraph "Real-Time"
        RSOCKET[RSocket]
        WS[WebSocket]
        REACTOR[Project Reactor]
    end
    
    subgraph "Observability"
        PROM[Prometheus]
        LOKI[Loki]
        GRAFANA[Grafana]
        TRACE[OpenTelemetry]
    end
    
    subgraph "Build & Deploy"
        GRADLE[Gradle]
        DOCKER[Docker]
        AZURE[Azure Cloud]
    end
    
    JAVA --> SB
    SB --> WF
    SB --> DATA
    WF --> RSOCKET
    RSOCKET --> WS
    WF --> REACTOR
    DATA --> PG
    
    style JAVA fill:#007396,color:#FFF
    style KAFKA fill:#231F20,color:#FFF
    style PG fill:#336791,color:#FFF
```

### 13.2 Technology Matrix

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Language** | Java 21 | Core development |
| **Framework** | Spring Boot 3.x | Application framework |
| **Reactive** | Spring WebFlux, Reactor | Async processing |
| **Database** | PostgreSQL | Event & query stores |
| **Messaging** | Confluent Kafka | Event streaming |
| **Serialization** | Avro, JSON | Event & API payloads |
| **Real-Time** | RSocket over WebSocket | UI streaming |
| **API Spec** | OpenAPI 3.0 | Contract definition |
| **Mapping** | MapStruct | DTO transformation |
| **Testing** | JUnit 5, Testcontainers | Testing framework |

---

## 14. Development Methodology

### 14.1 Spec-Driven Development

```mermaid
flowchart LR
    subgraph "Specification Phase"
        SPEC[OpenAPI YAML]
        AVRO_S[Avro Schema]
    end
    
    subgraph "Code Generation"
        GEN[Gradle openApiGenerate]
        DTO_G[Generated DTOs]
        CTRL_G[Generated Controllers]
    end
    
    subgraph "Implementation"
        IMPL[Business Logic]
        TEST[Tests]
    end
    
    subgraph "AI Assistance"
        COPILOT[GitHub Copilot]
        MCP[MCP Server]
        KB[Knowledge Base]
    end
    
    SPEC --> GEN
    AVRO_S --> GEN
    GEN --> DTO_G
    GEN --> CTRL_G
    DTO_G --> IMPL
    CTRL_G --> IMPL
    IMPL --> TEST
    
    KB --> COPILOT
    MCP --> COPILOT
    COPILOT --> IMPL
    COPILOT --> TEST
    
    style SPEC fill:#FFD700
    style COPILOT fill:#24292E,color:#FFF
```

### 14.2 AI-Assisted Workflow

The OMS leverages GitHub Copilot with a specialized MCP (Model Context Protocol) server that provides:

- **Domain Documentation**: Semantic search across OMS specifications
- **Order Query Tools**: Direct access to order data
- **Code Generation**: Context-aware code suggestions
- **Knowledge Base**: Indexed specifications and patterns

### 14.3 Development Commands

```powershell
# Full build
.\gradlew.bat clean build

# Fast build (skip tests)
.\gradlew.bat bootJar -x test

# Run MCP server
.\run-mcp.ps1

# Development mode
.\gradlew.bat bootRun --args='--spring.main.web-application-type=servlet --server.port=8091'
```

---

## 15. Improvement Recommendations

### 15.1 Architecture Improvements

```mermaid
graph TD
    subgraph "Current State"
        C1[Synchronous Validation]
        C2[Single DB Replica]
        C3[Basic Error Handling]
        C4[Manual Scaling]
    end
    
    subgraph "Recommended Improvements"
        R1[Async Validation Pipeline]
        R2[Read Replica Strategy]
        R3[Circuit Breaker Pattern]
        R4[Auto-Scaling with Metrics]
    end
    
    C1 -->|Upgrade| R1
    C2 -->|Upgrade| R2
    C3 -->|Upgrade| R3
    C4 -->|Upgrade| R4
    
    style R1 fill:#32CD32,color:#FFF
    style R2 fill:#32CD32,color:#FFF
    style R3 fill:#32CD32,color:#FFF
    style R4 fill:#32CD32,color:#FFF
```

### 15.2 Detailed Recommendations

#### 1. **Parallel Task Execution**
- **Current**: Sequential task pipeline execution
- **Recommendation**: Implement parallel execution for independent tasks
- **Benefit**: Reduced latency for multi-step workflows

```java
// Future: Parallel task execution
TaskPipeline.builder("OrderProcess")
    .addParallelTasks(validateTask, enrichTask, riskTask)
    .addTask(persistTask)
    .build();
```

#### 2. **Event Store Optimization**
- **Current**: PostgreSQL as event store
- **Recommendation**: Consider specialized event store (EventStoreDB) or Kafka as primary store
- **Benefit**: Better append-only performance, native streaming support

#### 3. **Saga Pattern for Long Transactions**
- **Current**: Synchronous command handling
- **Recommendation**: Implement Saga orchestration for multi-step processes
- **Benefit**: Better failure handling, compensation logic

```mermaid
graph LR
    A[Create Order] --> B[Validate]
    B --> C[Place in Market]
    C --> D[Confirm]
    
    B -->|Fail| B_C[Cancel Order]
    C -->|Fail| C_C[Retry/Cancel]
    
    style B_C fill:#FF6347,color:#FFF
    style C_C fill:#FF6347,color:#FFF
```

#### 4. **Enhanced Observability**
- **Current**: Basic metrics and logging
- **Recommendation**: 
  - Distributed tracing with OpenTelemetry
  - Business metrics dashboards
  - Anomaly detection

#### 5. **API Gateway & Rate Limiting**
- **Current**: Direct API access
- **Recommendation**: API Gateway with rate limiting, caching, and circuit breaking
- **Benefit**: Better resilience, security, and performance

#### 6. **Event Schema Evolution**
- **Current**: Avro schemas
- **Recommendation**: Implement schema registry with compatibility checks
- **Benefit**: Safe schema evolution without breaking consumers

#### 7. **Snapshot Store for Event Sourcing**
- **Current**: Full event replay
- **Recommendation**: Periodic snapshots to reduce replay time
- **Benefit**: Faster order reconstruction, reduced DB load

```mermaid
graph LR
    E1[Event 1] --> E2[Event 2] --> E3[...]
    E3 --> SNAP[Snapshot @100]
    SNAP --> E101[Event 101]
    E101 --> E102[Event 102]
    
    style SNAP fill:#FFD700
```

#### 8. **Caching Layer**
- **Current**: Direct database queries
- **Recommendation**: Redis/ReadySet for frequently accessed data
- **Benefit**: Reduced latency, database load offloading

#### 9. **Dead Letter Queue (DLQ)**
- **Current**: Basic error handling
- **Recommendation**: DLQ for failed events with retry policies
- **Benefit**: No message loss, automatic retry with backoff

#### 10. **Multi-Region Deployment**
- **Current**: Single region
- **Recommendation**: Active-passive or active-active multi-region
- **Benefit**: Disaster recovery, reduced latency for global users

### 15.3 Priority Matrix

| Improvement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Parallel Task Execution | High | Medium | P1 |
| Snapshot Store | High | Medium | P1 |
| Circuit Breaker | High | Low | P1 |
| Distributed Tracing | Medium | Low | P2 |
| Read Replicas | High | Medium | P2 |
| Saga Pattern | High | High | P2 |
| API Gateway | Medium | Medium | P3 |
| Event Store Migration | High | High | P3 |
| Multi-Region | High | Very High | P4 |

---

## Appendix A: Reference Architecture

### Complete System Diagram

```mermaid
graph TB
    subgraph "External"
        AM[Asset Managers]
        MKT[Market Venues]
        RISK[Risk Systems]
    end
    
    subgraph "Edge Layer"
        LB[Load Balancer]
        GW[API Gateway]
        AUTH[Auth Service]
    end
    
    subgraph "Application Layer"
        CMD[Command Service]
        QRY[Query Service]
        STREAM[Streaming Service]
        ALLOC[Allocation Service]
    end
    
    subgraph "Domain Layer"
        SM[State Machine]
        ORCH[Orchestrator]
        VAL[Validator]
        RULES[Rules Engine]
    end
    
    subgraph "Integration Layer"
        FIX[FIX Gateway]
        MSG[Message Gateway]
        NOTIFY[Notification Service]
    end
    
    subgraph "Data Layer"
        EVT[(Event Store)]
        READ[(Query Store)]
        CACHE[(Redis Cache)]
        KAFKA[Kafka Cluster]
    end
    
    subgraph "Observability"
        PROM[Prometheus]
        LOKI[Loki]
        TRACE[Jaeger]
        ALERT[Alertmanager]
    end
    
    AM --> LB
    LB --> GW
    GW --> AUTH
    AUTH --> CMD
    AUTH --> QRY
    
    CMD --> SM
    CMD --> ORCH
    CMD --> VAL
    CMD --> RULES
    
    ORCH --> EVT
    ORCH --> KAFKA
    
    KAFKA --> STREAM
    KAFKA --> ALLOC
    KAFKA --> FIX
    KAFKA --> NOTIFY
    
    FIX --> MKT
    NOTIFY --> RISK
    
    QRY --> READ
    QRY --> CACHE
    
    STREAM --> READ
    STREAM --> KAFKA
    
    CMD --> PROM
    QRY --> PROM
    STREAM --> PROM
    
    style CMD fill:#4169E1,color:#FFF
    style QRY fill:#32CD32,color:#FFF
    style KAFKA fill:#FF6347,color:#FFF
    style EVT fill:#9370DB,color:#FFF
    style READ fill:#9370DB,color:#FFF
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **CQRS** | Command Query Responsibility Segregation - separate read/write models |
| **Event Sourcing** | Persist state as sequence of immutable events |
| **FIX Protocol** | Financial Information eXchange - industry standard messaging |
| **MCP** | Model Context Protocol - AI tool integration standard |
| **OpenAPI** | Specification for defining REST APIs |
| **Avro** | Data serialization system for events |
| **RSocket** | Application protocol for reactive streams |
| **STP** | Straight-Through Processing - automatic execution allocation |

---

**Document History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-29 | OMS Team | Initial specification |

---

*This document was created with AI assistance using GitHub Copilot and the OMS MCP Server.*
