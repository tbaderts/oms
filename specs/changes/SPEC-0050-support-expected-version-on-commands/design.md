# Design — SPEC-0050: Support expected version on commands

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**Command path.**
- REST (`CommandController.executeCommand`) and Kafka (`CommandListener.handle`) both call
  `CommandDispatcher.dispatch(command, origin)`. The dispatcher routes to one of three processors,
  each running a task pipeline on an `OrderTaskContext` that holds the command and the order:
  - **`OrderCreateCommandProcessor`.** Its context order is mapped from the command, a new order
    with `txNr` 0. Tasks: `ValidateOrderTask` (100), `AssignOrderIdTask` (200), `SetOrderStateTask`
    (300), `PersistOrderTask` (400), `PublishOrderEventTask` (500).
  - **`OrderLifecycleCommandProcessor`.** Tasks: `LoadOrderTask` (50, under the row lock),
    `DeduplicateCommandTask` (75), `ValidateLifecycleActionTask` (100), `ApplyLifecycleActionTask`
    (300), `SaveOrderTask` (400), `PublishOrderEventTask`.
  - **`ExecutionCommandProcessor`.** It loads the order under the row lock before its pipeline:
    `DeduplicateCommandTask` (75), `ValidateExecutionTask` (100), then quantities, state, persist,
    update, publish and project.
- **How a failure becomes a refusal.** A failed task makes the pipeline fail. The processor rolls
  back, and the dispatcher returns `CommandDispatch.Refused` with the failing task's message
  (`PipelineResults.refusalReason`). REST answers it 400 with a FAILED `CommandResult`, or 409
  Problem+JSON when the refusal is a duplicate (`context.markDuplicate`). Kafka acknowledges it,
  counted `outcome=refused`. The command log records REFUSED with the reason (SPEC-0046).
- **Applied commands.** `CommandDispatch.Applied` already carries `eventVersion`, the version of
  the event the command wrote. The controller does not return it.
- **Headers.** `CommandHeaderMapper.apply(header, command)` copies the Avro `CommandHeader` ids
  onto the command model (`correlationId`, `causationId`, `commandId`).
- **Contract tests.** `CommandCompatibilityTest` (oms-contracts) checks every command record,
  `CommandHeader` included, against its released baseline for backward compatibility.

**The order's version.** Since SPEC-0027 the order's `txNr` equals its latest event version, and
search returns it as `OrderDto.eventVersion`.

**Closest examples followed.**
- `DeduplicateCommandTask`: a shared precondition task in two pipelines, refusing through the
  pipeline.
- `CommandHeaderMapper`: header to command.
- `CommandControllerWebMvcTest` and `CommandHeaderIntegrationTest`: REST and Kafka behaviour.

**Specs read.** `interfaces/command-api.md`, `interfaces/query-api.md`, `interfaces/avro-messages.md`,
`oms-framework/task-orchestration-framework_spec.md`, `oms-framework/error-handling.md`,
`oms-framework/openapi-contracts.md`, and `specs/policies/architecture-policies.md`.

## Approach

1. **Contracts** (oms-contracts, regenerated):
   - `Command.expectedVersion`, optional int64 ≥ 0;
   - `CommandResult.eventVersion`, optional int64;
   - `CommandHeader.expectedVersion`, `["null", "long"]` with default null;
   - the `OrderDto.eventVersion` description states the read-your-writes rule.
2. **Header mapping.** `CommandHeaderMapper.apply` also copies `expectedVersion`.
3. **New `CheckExpectedVersionTask`** in `org.example.oms.service.command.tasks`, order 80.
   - **Placement.** It runs after `DeduplicateCommandTask` (75), so a duplicate is reported as one
     (AC-5). It runs before any task that changes the order.
   - **Check.** It reads `context.getCommand().getExpectedVersion()`:
     - null: success, so a command behaves as today (AC-4);
     - equal to `context.getOrder().getTxNr()`: success;
     - otherwise it fails with `Expected version <e> but order <id> is at version <txNr>`, or
       `but the order is new (version 0)` for a create.
   - **Pipelines.** It is added to all three:
     - in the create pipeline, the new order has `txNr` 0, so 0 or absent applies and anything
       else is refused (AC-6);
     - in the lifecycle and fill pipelines it runs after the order was loaded under the row lock,
       so it compares against the version the command would change (AC-1, AC-2, AC-3).
4. **Controller.** The `Applied` case returns `CommandResult.eventVersion = applied.eventVersion()`.
   Refusals keep it absent.

```mermaid
sequenceDiagram
    participant C as Client
    participant D as CommandDispatcher
    participant P as Pipeline (lock, dedup 75, version 80, …)
    C->>D: command (expectedVersion e)
    D->>P: run
    alt e set and e != txNr
        P-->>D: failed: "Expected version e but order … is at version txNr"
        D-->>C: 400 FAILED (REST) / acknowledged, refused (Kafka); command log REFUSED
    else
        P-->>D: applied, event v = txNr + 1
        D-->>C: 200/201 CommandResult{eventVersion: v}
    end
```

## Contract Changes

`oms-contracts/src/main/openapi/oms-cmd-api.yml`:

```yaml
    Command:
      properties:
        # … existing properties …
        expectedVersion:
          type: integer
          format: int64
          minimum: 0
          description: >-
            The order version the sender acted on: the order's eventVersion as it saw it (0 for a
            create). When set and the order is at a different version, the command is refused
            (400; on Kafka acknowledged, not retried) and nothing is applied. Absent: no check.
            SPEC-0050.
    CommandResult:
      properties:
        # … existing properties …
        eventVersion:
          type: integer
          format: int64
          description: >-
            The event version the applied command produced: the order's eventVersion once the
            change is visible to search. Absent on a refusal. SPEC-0050.
```

`oms-contracts/src/main/openapi/oms-query-api.yml`, the description of `OrderDto.eventVersion` gains:
"Read-your-writes: a client that needs to see its own change waits until search returns the order
with eventVersion at least the CommandResult.eventVersion its command got (SPEC-0050)."

`oms-contracts/src/main/avro/CommandHeader.avsc` gains a last field:

```json
{
  "name": "expectedVersion",
  "type": ["null", "long"],
  "default": null,
  "doc": "The order version the sender acted on (0 for a create); the command is refused if the order is at another version. Null: no check. SPEC-0050."
}
```

- **Compatibility (P-04).** All three changes are additive. The Avro field is optional with a null
  default, so it is backward and forward compatible. `CommandCompatibilityTest` checks it against
  the released baselines. The OpenAPI versions rise one minor each: oms-cmd-api, and oms-query-api
  for the description change.
- **Generated code.** `Command`, `CommandResult` (`org.example.common.model.cmd`), `OrderDto`
  (query, doc only) and `CommandHeader` (`msg`). The exchange simulator recompiles against the new
  `CommandHeader` without code change.

## Data & Persistence

None. No table or column changes. The command log already stores refusal reasons.

## Events & Messaging

- **`order_events` (P-05).** A refused command writes no event, as today.
- **Outbox (P-06).** Unchanged.
- **Kafka.** Command records may carry `expectedVersion` in their header. A refused command is
  acknowledged, so it is not retried and not dead-lettered, like any other refusal. A redelivered
  duplicate is still refused as a duplicate.

## Domain, State & Orchestration

- **One new precondition task** (P-10), in all three pipelines. It sits after deduplication and
  before validation and every state-changing task. No state-machine change.
- **Error responses (P-13).**
  - A version mismatch is an ordinary refusal: 400 with a FAILED `CommandResult` and the message
    above. It is not Problem+JSON 409, because a retry of the same command cannot succeed.
  - Validation of `expectedVersion < 0` comes from the contract's `minimum: 0` (400 by bean
    validation).

## Alternatives & Decisions

- **Decision: a pipeline task after deduplication.**
  - Rejected: a check in `CommandDispatcher` before routing. It would need its own order read
    outside the row lock (racy), and it would run before deduplication, breaking AC-5.
- **Decision: refuse with 400, not 409.**
  - Rejected: 409 `concurrent-modification`. That type tells clients to retry, which cannot help
    when they acted on an old view. The goal asks for a refusal.
- **Decision: one task for creates too, using the new order's `txNr` 0.**
  - Rejected: a separate create check. The same rule ("expected equals current") gives "0 or
    absent" for free.
- **Decision: the Avro `CommandResult` is left unchanged.** Nothing produces it (proposal).
- **No new dependency (P-17).**

## Risks & Mitigations

- **A client sends the order's version from a stale search result on purpose, to fence.** That is
  the intended use: it gets a clear refusal naming the current version and can re-read.
- **Fills from the venue carry no expected version.** The exchange simulator and real venues do not
  set it, so fills apply as before (AC-4). The scope excludes setting it there.
- **Ordering with deduplication.** Covered by AC-5's test. The task order (75, then 80) is asserted
  by a unit test of the pipelines' task lists.

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | integration | `ExpectedVersionIntegrationTest#matchingVersionApplies` | REST cancel request and REST fill with `expectedVersion` = txNr apply; `CommandResult.eventVersion` = txNr + 1 = the event written |
| AC-2 | integration | `ExpectedVersionIntegrationTest#staleVersionIsRefusedOverRest` | 400 FAILED with a message naming both versions; order and its events unchanged; one REFUSED command-log row naming both |
| AC-3 | integration | `ExpectedVersionIntegrationTest#staleVersionIsRefusedOverKafka` | A Kafka command with a stale header version is not applied, is counted `refused`, sends nothing to the DLT, and logs REFUSED; the same command with the current version applies |
| AC-4 | integration + suite | `ExpectedVersionIntegrationTest#noExpectedVersionAppliesAsBefore`, the existing command-path suites | A command without the field applies to an order at version 5; the existing tests pass unchanged |
| AC-5 | integration | `ExpectedVersionIntegrationTest#aDuplicateIsReportedAsADuplicate` | A lifecycle command with commandId C and the right version applies; sending it again gives 409 `urn:oms:error:duplicate-command`, not a version refusal |
| AC-6 | integration | `ExpectedVersionIntegrationTest#createExpectsNoVersion` | A create with no version or with 0 is created with `eventVersion` 1; with 3 it is refused 400 naming 3 and 0, and no order exists |
| AC-7 | contract + build | `CommandCompatibilityTest` (oms-contracts), `CommandBaseContractTest#expectedVersionAndEventVersionAreOptionalInt64` (oms-contracts), oms-exchange-simulator `check` | Generated fields are optional `Long`; `CommandHeader.expectedVersion` is `["null", "long"]` with a null default and compatible with the baselines; the simulator builds and passes; the query spec's `eventVersion` description contains the read-your-writes rule |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | comply | All three contract changes are in oms-contracts |
| P-02 | Specification before code, generated models only | comply | Specs first (T-1), models regenerated |
| P-03 | Never edit generated code | comply | Regenerated only |
| P-04 | Contracts evolve compatibly | comply | Optional fields only; Avro default null; compatibility test; minor version bumps |
| P-05 | Every state change is recorded in the event log | comply | A refused command changes nothing and writes nothing |
| P-06 | Kafka only through the transactional outbox | comply | No publishing change |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema change |
| P-08 | Concurrency and idempotency are explicit | comply | The check runs under the order's row lock, after deduplication; it adds optimistic concurrency the client controls |
| P-09 | Commands and queries stay separate | comply | The query side only gains documentation |
| P-10 | State transitions go through the state machine and task pipeline | comply | A pipeline task, before any state-changing task |
| P-11 | Layering and conventions | comply | A task in `service.command.tasks`, as `PublishOrderEventTask`; constructor injection |
| P-12 | Jackson 3 only | n/a | No JSON code |
| P-13 | Errors and validation follow the framework specs | comply | Refusal = 400 FAILED `CommandResult`; duplicate stays 409 Problem+JSON; negative values are rejected by bean validation |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Table above |
| P-15 | Observability | comply | Refusals are counted (`oms.commands.consumed{outcome=refused}`), logged and in the command log with both versions |
| P-16 | Security | comply | No secrets; no new data exposed |
| P-17 | Simplicity and dependencies | comply | One task, two mapper lines, no library |
| P-18 | Modules build standalone | comply | `spec verify` builds oms-contracts and every consumer |
| P-19 | Documentation follows behaviour | comply | Pages below |

## Knowledge Base Updates

- `interfaces/command-api.md`: `expectedVersion`, the refusal, `CommandResult.eventVersion`.
- `interfaces/query-api.md`: the read-your-writes rule on `eventVersion`.
- `interfaces/avro-messages.md`: `CommandHeader.expectedVersion`.
