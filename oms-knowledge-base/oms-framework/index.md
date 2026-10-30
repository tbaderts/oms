# OMS Framework

Technical frameworks and cross-cutting specifications that every OMS capability builds on.

Back to the [knowledge base index](../index.md).

## Specifications

- [Domain Model Organization and OMS Core Libraries](domain-model_spec.md) — Core domain entities and libraries that asset-class models extend, with field-level definitions and FIX mappings.
- [Error Handling Specification](error-handling.md) — Error handling strategy: RFC 7807 problem responses, exception mapping, stream errors and resilience.
- [OpenAPI Contracts and Code Generation Guide](openapi-contracts.md) — OpenAPI command and query contracts and the code generation workflow built on them.
- [Order Management System (OMS) State Store Specification](oms-state-store.md) — State store for domain objects under event sourcing and CQRS, with JPA and PostgreSQL implementation guidance.
- [State Machine Framework Specification](state-machine-framework_spec.md) — Generic, type-safe framework for declaring and validating domain state transitions.
- [State-Query Store CQRS Specification](state-query-store_spec.md) — Options for a read-optimised query store kept in sync with the transactional store (CQRS at the database level).
- [Task Orchestration Framework Specification](task-orchestration-framework_spec.md) — Spring-based framework for composing business logic from ordered, reusable task components. *(draft)*
- [Testing Patterns Specification](testing-patterns.md) — Testing conventions for the OMS: unit, integration and end-to-end tiers, fixtures and Testcontainers.
- [Validation Rules Framework Specification](validation-rules.md) — Predicate-based, composable validation framework for orders, executions and quotes.
