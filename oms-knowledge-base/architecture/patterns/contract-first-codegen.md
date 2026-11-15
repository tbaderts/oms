---
aliases: [oms-framework/openapi-contracts]
type: Pattern
title: "Contract-first Code Generation"
description: "How an API or message change flows from the OpenAPI and Avro sources in oms-contracts to generated models and interfaces, and the rules that keep every consumer compatible."
tags: [pattern, openapi, avro, contracts, code-generation]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:oms-contracts/build.gradle"
  - resource: "repo:oms-core/build.gradle"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/CommandController.java"
  - resource: "repo:oms-contracts/src/test/java/org/example/common/contracts/CommandCompatibilityTest.java"
---
# Contract-first Code Generation

**Use this pattern for every change to an API or a message.** The specification is written first.
Code is generated from it, and nobody hand-writes a model the specification describes (policies
P-01 to P-04 in `specs/policies/architecture-policies.md`). Decision:
[ADR-001 One Contracts Module](../decisions/ADR-001-contracts-module.md).

## Where things live

| What | Source | Generated into | By |
|---|---|---|---|
| Command API models | `oms-contracts/src/main/openapi/oms-cmd-api.yml` | `org.example.common.model.cmd` | oms-contracts `openApiGenerateCmdModels` |
| Query API models | `oms-contracts/src/main/openapi/oms-query-api.yml` (+ `schema.yml`) | `org.example.common.model.query` | oms-contracts `openApiGenerateQueryModels` |
| Avro message classes | `oms-contracts/src/main/avro/*.avsc` | `org.example.common.model.msg` | the Avro Gradle plugin in oms-contracts |
| API interfaces (`ExecuteApi`, `SearchApi`, `OrdersApi`, `ExecutionsApi`) | the same two OpenAPI files | `oms-core/build/generated/` (`org.example.common.api`) | oms-core `openApiGenerateCmd`, `openApiGenerateQuery` |

- oms-contracts publishes the models as a jar. Every service includes it in its composite build,
  so a service still builds on its own.
- Only oms-core generates API interfaces, because it is the only module that implements them
  (`CommandController implements ExecuteApi`, `QueryController implements SearchApi`,
  `OrderEventController implements OrdersApi`, `ExecutionViewController implements ExecutionsApi`).
- A service module never has its own `src/main/openapi` or `src/main/avro`.
  `./gradlew check` in oms-contracts (`verifyContracts`) fails if one appears.

## Generator settings

Both generators use the OpenAPI `spring` generator with `interfaceOnly`, `skipDefaultInterface`,
`enumPropertyNaming: original` (enum constants keep the spelling of the spec) and
`modelNameSuffix: ""`. Models carry `@SuperBuilder` and `@Jacksonized` (Lombok), so they build
fluently and deserialize with Jackson 3. Generated code is never edited (P-03); change the
specification or the generator options instead.

## Making a change

1. Edit the OpenAPI file or the `.avsc` in `oms-contracts/src/main/`. Keep it backward compatible
   (P-04): add optional fields with defaults, never rename or remove. A breaking change needs a
   new version and a policy exception in the ticket's design.
2. Regenerate and test the contracts: `cd oms-contracts && ./gradlew build`. The contract tests
   (`CommandCompatibilityTest`, `ExecutionCompatibilityTest`, `DecimalPrecisionContractTest`, …)
   check compatibility and precision rules. After changing a schema embedded in another, do a
   clean build: incremental Avro generation can leave stale embedded schemas.
3. Regenerate the API interfaces: `cd oms-core && ./gradlew openApiGenerateCmd openApiGenerateQuery`.
4. Map between generated models and entities with MapStruct (`oms-core/.../mapper`), never by hand.
5. Before deploying a new Avro subject, register it: `./gradlew registerSchemas -PregistryUrl=…`.
   The services run with `auto.register.schemas=false`
   ([Message API](../../domain/interfaces/message-api.md#subjects-and-registration)).

## Related

- Interfaces as documented contracts: [Command API](../../domain/interfaces/command-api.md),
  [Query API](../../domain/interfaces/query-api.md), [Message API](../../domain/interfaces/message-api.md).
- The February 2026 guide this page replaces:
  [OpenAPI Contracts Guide (archived)](../../archive/openapi-contracts-guide-2026-02.md).
