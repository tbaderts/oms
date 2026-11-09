# Tasks — SPEC-0050: Support expected version on commands

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Contracts: `Command.expectedVersion` and `CommandResult.eventVersion` in oms-cmd-api.yml, `CommandHeader.expectedVersion` in the Avro header, the read-your-writes sentence on `OrderDto.eventVersion`, minor version bumps; contract test `CommandContractTest#expectedVersionAndEventVersionAreOptionalInt64` first; regenerate (AC-7)
  - files: oms-contracts/src/main/openapi/oms-cmd-api.yml, oms-contracts/src/main/openapi/oms-query-api.yml, oms-contracts/src/main/avro/CommandHeader.avsc, oms-contracts/src/test/java/org/example/common/contracts/CommandContractTest.java
  - verify: `cd oms-contracts && ./gradlew build` passes (CommandCompatibilityTest and the new contract test included)
- [x] **T-2** Copy `expectedVersion` from the Avro header to the command, test first in `CommandHeaderMapperTest` (AC-3)
  - files: oms-core/src/main/java/org/example/oms/mapper/CommandHeaderMapper.java, oms-core/src/test/java/org/example/oms/mapper/CommandHeaderMapperTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.mapper.CommandHeaderMapperTest'` passes
- [x] **T-3** Write `ExpectedVersionIntegrationTest` (AC-1 to AC-6, red), then `CheckExpectedVersionTask` (order 80) in the create, lifecycle and fill pipelines, and `CommandResult.eventVersion` in `CommandController` (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
  - files: oms-core/src/main/java/org/example/oms/service/command/tasks/CheckExpectedVersionTask.java, oms-core/src/main/java/org/example/oms/service/command/OrderCreateCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java, oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java, oms-core/src/main/java/org/example/oms/api/CommandController.java, oms-core/src/test/java/org/example/oms/integration/ExpectedVersionIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExpectedVersionIntegrationTest' --tests 'org.example.oms.api.CommandControllerWebMvcTest' --tests 'org.example.oms.service.lifecycle.OrderLifecycleCommandProcessorTest'` passes
- [x] **T-4** Update the knowledge base: command-api, query-api, avro-messages (AC-7)
  - files: oms-knowledge-base/interfaces/command-api.md, oms-knowledge-base/interfaces/query-api.md, oms-knowledge-base/interfaces/avro-messages.md
  - verify: grep finds `expectedVersion` in command-api.md and avro-messages.md and `read-your-writes` (case-insensitive) in query-api.md
- [x] **T-5** Run spec verify (agree a quiet window with other sessions in the tree first)
  - verify: `node specs/tools/spec.mjs verify SPEC-0050` exits 0

- [x] **T-6** From the independent review: refuse a stale lifecycle command in `staleVersionIsRefusedOverRest` and assert exactly one REFUSED row; unit-test `CheckExpectedVersionTask` (null, equal, unequal, create); no doubled fill message; "order is new" only for a create (AC-2, AC-6)
  - files: oms-core/src/test/java/org/example/oms/integration/ExpectedVersionIntegrationTest.java, oms-core/src/test/java/org/example/oms/service/command/tasks/CheckExpectedVersionTaskTest.java, oms-core/src/main/java/org/example/oms/service/command/tasks/CheckExpectedVersionTask.java, oms-core/src/main/java/org/example/oms/service/command/CommandDispatcher.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ExpectedVersionIntegrationTest' --tests 'org.example.oms.service.command.tasks.CheckExpectedVersionTaskTest'` passes
- [x] **T-7** Rerun spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0050` exits 0

## Notes

- Do not start T-1 before SPEC-0049 is done: it changes oms-contracts and oms-core files that SPEC-0049's verification fingerprints.
- T-1 comes first: oms-core and the simulator compile against the regenerated models.
- T-1: the contract checks went into the existing `CommandBaseContractTest` (`expectedVersionAndEventVersionAreOptionalInt64`, and `versionIs340` replacing `versionIs330`) instead of a new `CommandContractTest`. `CommandSchemaTest#headerFieldsAsSpecified` pins the header field list and gained `expectedVersion`. oms-query-api is 2.5.0.
- T-3: the REST refusal of a fill said only "Execution processing failed"; it now appends the reason ("Execution processing failed: Expected version …"), as lifecycle refusals already carry theirs. No test pinned the old wording.
- T-3: an incremental `oms-contracts` build regenerated `CommandHeader` but not the command records that embed it, so Kafka commands were serialized without `expectedVersion`. A clean build fixed it. Follow-up: make the Avro generation rebuild every schema when one changes (or always clean-build oms-contracts after a schema change).
