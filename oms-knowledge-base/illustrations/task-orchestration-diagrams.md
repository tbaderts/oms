# Task Orchestration Framework - Architecture Diagrams

## System Overview

```mermaid
graph TB
    subgraph "Application Layer"
        CMD[Command Handlers]
        SVC[Business Services]
    end
    
    subgraph "Orchestration Framework"
        ORCH[TaskOrchestrator<br/>@Component]
        PIPE[TaskPipeline<br/>Builder]
        CTX[TaskContext<br/>State Container]
    end
    
    subgraph "Task Implementations"
        T1[ValidateTransactionTask<br/>@Component]
        T2[ValidateOrderTask<br/>@Component<br/>ConditionalTask]
        T3[StateTransitionTask<br/>@Component<br/>ConditionalTask]
        T4[PersistOrderTask<br/>@Component<br/>ConditionalTask]
        T5[PublishEventTask<br/>@Component<br/>ConditionalTask]
    end
    
    subgraph "Infrastructure"
        DB[(Database)]
        KAFKA[Kafka]
        METRICS[Metrics/Logs]
    end
    
    CMD --> ORCH
    SVC --> ORCH
    ORCH --> PIPE
    PIPE -.contains.-> T1
    PIPE -.contains.-> T2
    PIPE -.contains.-> T3
    PIPE -.contains.-> T4
    PIPE -.contains.-> T5
    
    T1 --> CTX
    T2 --> CTX
    T3 --> CTX
    T4 --> CTX
    T5 --> CTX
    
    T4 --> DB
    T5 --> KAFKA
    ORCH --> METRICS
    
    style ORCH fill:#4a90e2,stroke:#2d5f9e,color:#fff
    style PIPE fill:#50c878,stroke:#2d8659,color:#fff
    style CTX fill:#f39c12,stroke:#b8730a,color:#fff
    style T1 fill:#e8f4f8
    style T2 fill:#e8f4f8
    style T3 fill:#e8f4f8
    style T4 fill:#e8f4f8
    style T5 fill:#e8f4f8
```

## Class Hierarchy

```mermaid
classDiagram
    class Task {
        <<interface>>
        +execute(context) TaskResult
        +getName() String
        +getOrder() int
    }
    
    class ConditionalTask {
        <<interface>>
        +getPrecondition() Predicate
        +shouldExecute(context) boolean
        +getSkipReason(context) String
    }
    
    class TaskContext {
        -String contextId
        -Instant createdAt
        -Map attributes
        -Map metadata
        +put(key, value) TaskContext
        +get(key) Optional
        +putMetadata(key, value) TaskContext
    }
    
    class OrderTaskContext {
        -Transaction transaction
        -Order order
        -Execution execution
        -State newState
        +hasOrder() boolean
        +hasTransaction() boolean
    }
    
    class TaskResult {
        <<enumeration>> Status
        -Status status
        -String message
        -String taskName
        -List warnings
        -List errors
        +isSuccess() boolean
        +isFailed() boolean
    }
    
    class TaskPipeline {
        -String name
        -List~Task~ tasks
        -boolean stopOnFailure
        +addTask(task) TaskPipeline
        +build() TaskPipeline
    }
    
    class TaskOrchestrator {
        <<@Component>>
        +execute(pipeline, context) PipelineResult
    }
    
    class PipelineResult {
        -List~TaskResult~ taskResults
        -boolean success
        -Duration executionTime
        +getSuccessCount() long
        +getFailedCount() long
    }
    
    ConditionalTask --|> Task
    OrderTaskContext --|> TaskContext
    TaskPipeline --> Task : contains
    TaskOrchestrator --> TaskPipeline : executes
    TaskOrchestrator --> PipelineResult : returns
    Task --> TaskResult : returns
    Task --> TaskContext : uses
```

## Sequence Diagram - Order Processing

```mermaid
sequenceDiagram
    actor User
    participant Handler as Command Handler
    participant Service as OrderProcessing<br/>Service
    participant Orch as TaskOrchestrator
    participant Pipeline as TaskPipeline
    participant Validate as ValidateOrderTask
    participant State as StateTransitionTask
    participant Persist as PersistOrderTask
    participant Context as OrderTaskContext
    participant DB as Database
    
    User->>Handler: Submit Order Command
    Handler->>Service: processNewOrder(tx, order)
    
    Service->>Context: new OrderTaskContext()
    Service->>Context: setTransaction(tx)
    Service->>Context: setOrder(order)
    Service->>Context: setNewState(NEW)
    
    Service->>Pipeline: builder("NewOrder")
    Service->>Pipeline: addTask(validate, state, persist)
    Service->>Pipeline: build()
    
    Service->>Orch: execute(pipeline, context)
    
    loop For each task in pipeline
        Orch->>Validate: checkPrecondition(context)
        Validate-->>Orch: true
        Orch->>Validate: execute(context)
        Validate->>Context: get("order")
        Validate->>Validate: validate fields
        Validate-->>Orch: TaskResult.success()
        
        Orch->>State: shouldExecute(context)
        State-->>Orch: true
        Orch->>State: execute(context)
        State->>Context: getOrder()
        State->>Context: getNewState()
        State->>State: validate transition
        State->>Context: order.setState(NEW)
        State-->>Orch: TaskResult.success()
        
        Orch->>Persist: shouldExecute(context)
        Persist-->>Orch: true
        Orch->>Persist: execute(context)
        Persist->>Context: getOrder()
        Persist->>DB: save(order)
        DB-->>Persist: saved order
        Persist->>Context: put("persisted", true)
        Persist-->>Orch: TaskResult.success()
    end
    
    Orch->>Orch: aggregate results
    Orch-->>Service: PipelineResult
    Service-->>Handler: TxInfo
    Handler-->>User: Order Accepted
```

## Task Execution Flow

```mermaid
flowchart TD
    Start([Pipeline Execution]) --> Init[Initialize Result List]
    Init --> NextTask{More Tasks?}
    
    NextTask -->|Yes| CheckType{Task Type?}
    NextTask -->|No| Aggregate[Aggregate Results]
    
    CheckType -->|Conditional| CheckPrecond{Precondition<br/>Met?}
    CheckType -->|Regular| Execute[Execute Task]
    
    CheckPrecond -->|Yes| Execute
    CheckPrecond -->|No| Skip[Create SKIPPED Result]
    
    Execute --> TryCatch{Exception?}
    
    TryCatch -->|No| Success[Get TaskResult]
    TryCatch -->|Yes| Failed[Create FAILED Result]
    
    Success --> AddResult[Add to Results]
    Failed --> AddResult
    Skip --> AddResult
    
    AddResult --> CheckFailed{Task Failed<br/>AND<br/>StopOnFailure?}
    
    CheckFailed -->|Yes| Aggregate
    CheckFailed -->|No| NextTask
    
    Aggregate --> CalcStats[Calculate Statistics]
    CalcStats --> CreatePipelineResult[Create PipelineResult]
    CreatePipelineResult --> End([Return Result])
    
    style Start fill:#4a90e2,color:#fff
    style End fill:#50c878,color:#fff
    style Execute fill:#f39c12,color:#fff
    style Failed fill:#e74c3c,color:#fff
    style Success fill:#2ecc71,color:#fff
    style Skip fill:#95a5a6,color:#fff
```

## Component Dependencies

```mermaid
graph LR
    subgraph "Core Framework (common)"
        Task[Task Interface]
        CondTask[ConditionalTask Interface]
        TaskCtx[TaskContext]
        TaskRes[TaskResult]
        TaskExc[TaskExecutionException]
        Pipeline[TaskPipeline]
        Orch[TaskOrchestrator]
    end
    
    subgraph "OMS Domain (oms)"
        OrderCtx[OrderTaskContext]
        OrcSvc[OrderProcessing<br/>Service]
    end
    
    subgraph "OMS Tasks (oms.tasks)"
        ValTx[ValidateTransactionTask]
        ValOrd[ValidateOrderTask]
        StateTx[StateTransitionTask]
        Persist[PersistOrderTask]
        Publish[PublishEventTask]
    end
    
    subgraph "Spring Framework"
        Spring[@Component<br/>@Service<br/>DI]
    end
    
    subgraph "Observability"
        Micrometer[@Observed<br/>Metrics]
        SLF4J[SLF4J Logging]
    end
    
    CondTask -.implements.-> Task
    OrderCtx -.extends.-> TaskCtx
    
    ValTx -.implements.-> Task
    ValOrd -.implements.-> CondTask
    StateTx -.implements.-> CondTask
    Persist -.implements.-> CondTask
    Publish -.implements.-> CondTask
    
    Pipeline --> Task
    Orch --> Pipeline
    Orch --> TaskRes
    OrcSvc --> Orch
    OrcSvc --> Pipeline
    OrcSvc --> ValTx
    OrcSvc --> ValOrd
    
    Orch -.uses.-> Spring
    Orch -.uses.-> Micrometer
    ValTx -.uses.-> Spring
    ValOrd -.uses.-> Spring
    OrcSvc -.uses.-> Spring
    
    ValTx -.logs.-> SLF4J
    ValOrd -.logs.-> SLF4J
    Orch -.logs.-> SLF4J
    
    style Task fill:#e8f4f8
    style CondTask fill:#e8f4f8
    style Orch fill:#4a90e2,color:#fff
    style Pipeline fill:#50c878,color:#fff
    style OrderCtx fill:#f39c12,color:#fff
```

## State Transitions in Pipeline

```mermaid
stateDiagram-v2
    [*] --> PipelineCreated: Create Pipeline
    
    PipelineCreated --> TaskReady: Get Next Task
    
    TaskReady --> CheckingPrecondition: Conditional Task
    TaskReady --> Executing: Regular Task
    
    CheckingPrecondition --> Executing: Condition True
    CheckingPrecondition --> Skipped: Condition False
    
    Executing --> Success: No Exception
    Executing --> Failed: Exception Thrown
    
    Success --> AddingResult
    Failed --> AddingResult
    Skipped --> AddingResult
    
    AddingResult --> CheckStopOnFailure: Result Added
    
    CheckStopOnFailure --> TaskReady: Continue
    CheckStopOnFailure --> PipelineComplete: Stop on Failure
    
    TaskReady --> PipelineComplete: No More Tasks
    
    PipelineComplete --> [*]: Return Result
    
    note right of CheckingPrecondition
        Predicate evaluated
        against context
    end note
    
    note right of Executing
        Task.execute()
        called with context
    end note
    
    note right of CheckStopOnFailure
        If task failed AND
        stopOnFailure=true
    end note
```

## Data Flow

```mermaid
graph LR
    subgraph "Input"
        CMD[Command/Transaction]
        ORD[Order]
    end
    
    subgraph "Context Creation"
        CTX[OrderTaskContext]
        ATTRS[Attributes Map]
        META[Metadata Map]
    end
    
    subgraph "Pipeline Execution"
        T1[Task 1]
        T2[Task 2]
        T3[Task 3]
    end
    
    subgraph "Result Aggregation"
        R1[TaskResult 1]
        R2[TaskResult 2]
        R3[TaskResult 3]
        PIPE_RES[PipelineResult]
    end
    
    subgraph "Output"
        STATS[Statistics]
        LOGS[Logs]
        METRICS[Metrics]
    end
    
    CMD --> CTX
    ORD --> CTX
    CTX --> ATTRS
    CTX --> META
    
    CTX --> T1
    T1 --> CTX
    CTX --> T2
    T2 --> CTX
    CTX --> T3
    T3 --> CTX
    
    T1 --> R1
    T2 --> R2
    T3 --> R3
    
    R1 --> PIPE_RES
    R2 --> PIPE_RES
    R3 --> PIPE_RES
    
    PIPE_RES --> STATS
    PIPE_RES --> LOGS
    PIPE_RES --> METRICS
    
    style CTX fill:#f39c12,color:#fff
    style PIPE_RES fill:#50c878,color:#fff
    style T1 fill:#e8f4f8
    style T2 fill:#e8f4f8
    style T3 fill:#e8f4f8
```

## Extension Points

```mermaid
mindmap
    root((Task Orchestration<br/>Framework))
        Custom Tasks
            Domain Tasks
            Infrastructure Tasks
            Integration Tasks
        Custom Contexts
            Domain Contexts
            Multi-Entity Contexts
            Event Contexts
        Custom Results
            Detailed Results
            Metric Results
            Audit Results
        Pipeline Patterns
            Sequential
            Conditional
            Dynamic
            Templated
        Error Handling
            Stop on Failure
            Continue on Failure
            Retry Policies
            Compensation
        Observability
            Custom Metrics
            Distributed Tracing
            Audit Logging
            Performance Monitoring
```

---

**Legend:**
- 🔵 Blue: Orchestration components
- 🟢 Green: Pipeline/Results
- 🟡 Yellow: Context/State
- ⚪ Light Blue: Tasks
- ◆ Diamond: Decision points
- ⬜ Rectangle: Processes
- 🗄️ Cylinder: Data stores

---

## Related Documents

- [Task Orchestration Framework](../oms-framework/task-orchestration-framework_spec.md) — Complete framework specification that these diagrams visualize
- [Domain Model](../oms-framework/domain-model_spec.md) — OrderTaskContext class hierarchy and entity definitions
- [State Machine Framework](../oms-framework/state-machine-framework_spec.md) — StateTransitionTask usage within pipelines
