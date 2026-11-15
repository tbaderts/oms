# Core OMS Framework

The technical framework every order flow is built on: state machine, validation engine, task orchestrator, query engine and exception handling.

Back to the [knowledge base index](../index.md).

## Documents

- [Error Handling Specification](exception-handling.md) — Error handling strategy: RFC 7807 problem responses, exception mapping, stream errors and resilience.
- [Query Engine](query-engine.md) — How oms-core answers queries: dynamic filters translated into JPA Specifications on the orders table, paging and sorting, the read services behind the Query API, and the rules a new query follows.
- [State Machine Framework Specification](state-machine.md) — Generic, type-safe framework for declaring and validating domain state transitions.
- [Task Orchestration Framework Specification](task-orchestrator.md) — Spring-based framework for composing business logic from ordered, reusable task components.
- [Validation Rules Framework Specification](validation-engine.md) — Predicate-based, composable validation framework for orders, executions and quotes.
