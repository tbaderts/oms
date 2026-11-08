# Tasks — SPEC-0045: Rename order_execution_view to order_execution_projection

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

- [x] **T-1** Write `OrderExecutionProjectionRenameMigrationTest` (rename keeps rows and renames every object; rollback restores the names), red. Then add `012-rename-order-execution-projection.yaml` (026 tag, 027 renames with rollback) to the master changelog (AC-1, AC-2)
  - files: oms-core/src/main/resources/db/changelog/012-rename-order-execution-projection.yaml, oms-core/src/main/resources/db/changelog/db.changelog-master.yaml, oms-core/src/test/java/org/example/oms/integration/OrderExecutionProjectionRenameMigrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OrderExecutionProjectionRenameMigrationTest'` passes
- [x] **T-2** Rename the entity to `OrderExecutionProjectionRow` (new table and sequence), the repository to `OrderExecutionProjectionRepository` and the query service to `OrderExecutionProjectionQueryService`, updating all callers and tests. Update `LiquibaseMigrationIntegrationTest#projectionSchemaIsApplied` to the new names (AC-3)
  - files: oms-core/src/main/java/org/example/oms/model/OrderExecutionView.java → OrderExecutionProjectionRow.java, oms-core/src/main/java/org/example/oms/repository/OrderExecutionViewRepository.java → OrderExecutionProjectionRepository.java, oms-core/src/main/java/org/example/oms/service/OrderExecutionViewQueryService.java → OrderExecutionProjectionQueryService.java, oms-core/src/main/java/org/example/oms/projection/OrderExecutionProjection.java, oms-core/src/main/java/org/example/oms/api/ExecutionViewController.java, oms-core/src/main/java/org/example/oms/mapper/ExecutionViewDtoMapper.java, oms-core/src/test/java/org/example/oms/integration/*.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ProjectionIntegrationTest' --tests 'org.example.oms.integration.ExecutionViewQueryIntegrationTest' --tests 'org.example.oms.integration.LiquibaseMigrationIntegrationTest' --tests 'org.example.oms.integration.EventSourcingIntegrationTest' --tests 'org.example.oms.integration.DecimalPrecisionIntegrationTest'` passes
- [x] **T-3** Write `ProjectionIntegrationTest#everyProjectionTableIsItsNameWithProjectionSuffix` and update the rebuild tests to the name `order_execution` (timer tag asserted, `#oldProjectionName_is404` added), red. Then add `Projection.table()`, name the projection `order_execution`, and lock `table()` in the rebuilder (AC-4, AC-5, AC-6)
  - files: oms-core/src/main/java/org/example/oms/projection/Projection.java, oms-core/src/main/java/org/example/oms/projection/OrderExecutionProjection.java, oms-core/src/main/java/org/example/oms/projection/ProjectionRebuilder.java, oms-core/src/test/java/org/example/oms/integration/ProjectionIntegrationTest.java, oms-core/src/test/java/org/example/oms/integration/ProjectionRebuildIntegrationTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.ProjectionIntegrationTest' --tests 'org.example.oms.integration.ProjectionRebuildIntegrationTest' --tests 'org.example.oms.service.execution.tasks.ProjectTaskTest'` passes
- [x] **T-4** Confirm that no main source outside the applied changesets 007, 008 and 011 names `order_execution_view`, and that the contracts are untouched (AC-7)
  - verify: grep over `oms-core/src/main` for `order_execution_view|OrderExecutionView` lists only `007-projections.yaml`, `008-decimal-precision.yaml`, `011-execution-lifecycle.yaml` and the rename changeset `012`; `git diff --stat main -- oms-contracts` lists no file changed by this ticket
- [x] **T-5** Update the knowledge base and the target architecture: projections.md (name, table, URL, naming rule), query-api.md, booking-integration.md, any other page naming the table, and the target-architecture roadmap row (AC-4, AC-6)
  - files: oms-knowledge-base/oms-concepts/projections.md, oms-knowledge-base/interfaces/query-api.md, oms-knowledge-base/oms-concepts/booking-integration.md, oms-core/docs/target-architecture.md
  - verify: grep for `order_execution_view` in `oms-knowledge-base` finds only history notes, and `projections.md` states the naming rule and `/actuator/projections/order_execution/rebuild`
- [x] **T-6** Run the full oms-core suite
  - verify: `cd oms-core && ./gradlew check` passes
- [x] **T-7** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0045` exits 0

- [x] **T-8** Strengthen the tests the review found weak: the rename migration test seeds and compares every column of the rows; ProjectTaskTest asserts the exact failure message (AC-1)
  - files: oms-core/src/test/java/org/example/oms/integration/OrderExecutionProjectionRenameMigrationTest.java, oms-core/src/test/java/org/example/oms/service/execution/tasks/ProjectTaskTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OrderExecutionProjectionRenameMigrationTest' --tests 'org.example.oms.service.execution.tasks.ProjectTaskTest'` passes, then `node specs/tools/spec.mjs verify SPEC-0045` exits 0

## Notes

- SPEC-0044's working-tree changes are not committed yet, so `git diff main -- oms-contracts` also shows SPEC-0044's query-contract change. T-4 checks that this ticket adds nothing to it: the file is identical to its state at the end of SPEC-0044.
- T-2 and T-3 are separate on purpose. T-2 is a pure rename, proven by the existing tests unchanged. T-3 changes behaviour (name, URL, lock) test-first.
- T-8 was added after the independent review in the verify stage (findings 1 and 2). The implement stage was reopened for it.
