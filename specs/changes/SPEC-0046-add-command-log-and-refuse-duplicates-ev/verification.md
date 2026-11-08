# Verification — SPEC-0046: Add command log and refuse duplicates everywhere

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The last full oms-core run passed 561 tests, with 0 skipped and 0 failures. It ran on the same
sources as the final `spec verify` (`oms-core/build/test-results/test`, `evidence/oms-core-1.log`).
Each assertion was read against its AC. Tests that passed on their first run were checked by
disabling the code they cover (tasks.md Notes).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | An applied REST command is logged: REST, APPLIED, the event's version | `CommandLogIntegrationTest#appliedRestCommandIsLogged`; `CommandDispatcherTest#appliedLifecycleCommandIsLoggedWithItsEventVersion` | PASS |
| AC-2 | A refused REST command answers 400, writes nothing, and its REFUSED row survives the rollback | `CommandLogIntegrationTest#refusedRestCommandIsLoggedAndSurvivesRollback`; `#refusedCreateNamesNoOrder` (a refused create has no order id) | PASS |
| AC-3 | A Kafka accept is logged with KAFKA, the header's commandId and producer, and the ACK version; a refused Kafka command is acknowledged and logged REFUSED | `CommandLogKafkaIntegrationTest#kafkaAcceptIsLoggedWithProducer`, `#refusedKafkaCommandIsAcknowledgedAndLogged` (one attempt only, and a later command processed); `CommandListenerTest#orderAccept_isDelegatedWithItsHeader` | PASS |
| AC-4 | A Kafka fill for an unknown order is dead-lettered and logged FAILED with its orderId and reason | `CommandLogKafkaIntegrationTest#fillForUnknownOrderIsDeadLetteredAndLoggedFailed` (one record on `commands.DLT`) | PASS |
| AC-5 | Scheduled close and expiry are logged as SCHEDULER, by `oms-core:end-of-day` and `oms-core:expiry`, with the CLOSE and EXP versions | `EndOfDayIntegrationTest#scheduledCommandsAreLoggedAsScheduler` | PASS |
| AC-6 | A fill reusing a commandId: 409 on REST, acknowledged on Kafka, nothing written, REFUSED "Duplicate" | `DuplicateCommandIntegrationTest#duplicateFillCommandIdOverRestIs409` (no execution, event or outbox row); `CommandLogKafkaIntegrationTest#duplicateFillCommandIdOnKafkaIsAcknowledged` (refused counter + 1, only E1 and E3 have fill events, nothing on the DLT); `EventSourcingIntegrationTest#fillWithRepeatedCommandId_isRefusedAsDuplicate`; the race against the real constraint: `DuplicateCommandIntegrationTest#commandIdConstraintRaceIsTheSame409` | PASS |
| AC-7 | A repeated lifecycle command: 409, order unchanged, REFUSED | `DuplicateCommandIntegrationTest#repeatedLifecycleCommandIs409`; `OrderLifecycleIntegrationTest#duplicateCommandId_isRefusedOverRestAndLeavesOrderUnchanged`; `CommandControllerWebMvcTest#lifecycleCommand_duplicate_returns409DuplicateCommand` | PASS |
| AC-8 | Accept: 200, LIVE, market ack stamped, one ACK; a repeat is 409; a new id on LIVE is 400; FILLED is 400 | `DuplicateCommandIntegrationTest#acceptAppliesOnceAndRefusesRepeatAndNonUnack`; `OrderLifecycleCommandProcessorTest` accept cases (UNACK → LIVE with the stamp, every other state refused, duplicate) | PASS |
| AC-9 | Every fill event stores its `ExecutionCreateCmd`, over REST and Kafka | `CommandLogKafkaIntegrationTest#everyFillEventStoresItsCommand`; the processor now requires the command (`Objects.requireNonNull`) | PASS |
| AC-10 | `getOrderCommands`: `[]` for no entries; contracted properties; oldest first; declared in api-docs | `OrderCommandQueryIntegrationTest` (3 tests); `CommandLogContractTest` (oms-contracts) | PASS |
| AC-11 | A failed REFUSED write leaves the answer unchanged and counts `oms.command_log.write_failures` | `CommandLogIntegrationTest#logWriteFailureLeavesTheResultUnchanged` | PASS |

## Goal Assessment

The goal is met. The parts of the ticket, and how each was delivered:

- **Command log.** Every command now leaves a durable trace with its outcome. `command_log` holds
  command id, type, order id, received time, source, principal, outcome, reason and event version.
  The REST command API, the Kafka listener and both scheduler jobs all write it, through one
  `CommandDispatcher`.
  - **Refusals and failures** are written in `REQUIRES_NEW` and survive the rollback.
  - **Applied commands** are written in the command's own transaction, as approved in the
    proposal, and flushed so that a late failure is still logged.
- **Query operation.** The log is exposed as `GET /api/query/orders/{orderId}/commands`, query
  contract 2.3.0.
- **Typed duplicate refusal.** A violation of `uq_order_events_order_id_command_id` maps to
  `DuplicateCommandException`. It is the same refusal the dedup lookup gives, on lifecycle, accept
  and fill: 409 on REST (command contract 3.3.0 declares it) and acknowledged on Kafka. A
  Postgres-level race test proves the constraint path.
- **Accept** is `LifecycleAction.ACCEPT` in the lifecycle pipeline. It takes the same lock, dedup
  and state-machine validation (UNACK only), and keeps its SLA stamp and its REST and Kafka answers.
- **The command-less overload `process(Execution)` is removed.**

These holes in "every command" are deliberate, documented and narrow:
- **Not logged at all.** Kafka records that cannot be decoded, or whose type has no command model
  (a quote, a bust until SPEC-0030), are not logged; their trace is the dead-letter topic.
- **Logged without an order.** A refused create has no order id, so the per-order query cannot show
  it.
- **The commit itself.** A failure of the database commit after a successful flush can leave no row.

`domain/command-log.md` states all three.

## Policy Review

The review covers SPEC-0046's part of the working-tree diff. SPEC-0044 and SPEC-0045 are
uncommitted in the same tree and are excluded.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | `oms-query-api.yml` and `oms-cmd-api.yml` only |
| P-02 | Specification before code, generated models only | PASS | T-1 changed and regenerated the contracts first. `CommandLogEntryDto`, `CommandSource`, `CommandOutcome` and `OrdersApi.getOrderCommands` are generated. The entity enums are separate domain types (design) |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated*` |
| P-04 | Contracts evolve compatibly | PASS | A new operation, new schemas and a declared 409: all additive. Query 2.3.0, command 3.3.0. The status change from 400 to 409 for duplicates was approved in the proposal |
| P-05 | Every state change is recorded in the event log | PASS | Accept records `ACK` through the pipeline's `PublishOrderEventTask`; every fill event stores its command |
| P-06 | Kafka only through the transactional outbox | PASS | Nothing published directly; the command log is not published |
| P-07 | Schema changes through new Liquibase changesets | PASS | New `013-command-log.yaml` with a rollback; 001–012 untouched; `LiquibaseMigrationIntegrationTest#commandLogTableIsApplied` |
| P-08 | Concurrency and idempotency are explicit | PASS | Dedup by commandId on lifecycle, accept and fill. The constraint race maps to the same refusal (race test). Accept now takes the row lock |
| P-09 | Commands and queries stay separate | PASS | Written on the command path; read by `CommandLogReadService` (read-only) |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Accept moved into the lifecycle pipeline (F-20). No processor is called outside the dispatcher |
| P-11 | Layering and conventions | PASS | Thin controller and listener; dispatcher and writer services; repository; MapStruct mapper reusing `QueryOrderDtoMapper`'s UTC conversion |
| P-12 | Jackson 3 only | PASS | No JSON binding code added (auto R03) |
| P-13 | Errors and validation follow the framework specs | PASS | Problem+JSON 409 `urn:oms:error:duplicate-command`, documented in `error-handling.md` |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC has passing tests. Red first, or checked by disabling the code, as recorded in tasks.md |
| P-15 | Observability | PASS | The command log itself; `oms.command_log.write_failures`; `oms.commands.consumed` keeps its tags and counts duplicates as `refused` |
| P-16 | Security | PASS | No secrets. REST principal stays null until authentication exists, as documented |
| P-17 | Simplicity and dependencies | PASS | No dependency. Removes `OrderAcceptCommandProcessor`, one overload and duplicated routing |
| P-18 | Modules build standalone | PASS | `spec verify` ran `check` in oms-core, oms-contracts and the three consumers; all exit 0 |
| P-19 | Documentation follows behaviour | PASS | New `domain/command-log.md`. Updated: order-lifecycle, execution-processing, error-handling, query-api, FR-010, and, after the review, every page that described the removed accept processor (design, Knowledge Base Updates) |

## Independent Review

The spec-reviewer agent found every AC proven, with verdict NOT MET only for P-19. Its eight
findings and how each was resolved:

1. **[blocking, P-19] Pages still described `OrderAcceptCommandProcessor` and `process(execution)`.**
   **Fixed (T-15).** All nine pages, the animation labels and the storyboard link were updated. A
   grep finds only the history note in `order-acceptance.md`.
2. **A refused create reported the id of a rolled-back order.** **Fixed (T-13).** It answers
   `id: ""` and is logged with a null order id; `CommandLogIntegrationTest#refusedCreateNamesNoOrder`
   was red first.
3. **A failure while writing the APPLIED row or flushing at commit left no trace.** **Fixed (T-13).**
   The dispatcher writes and flushes inside its guarded block;
   `CommandLogIntegrationTest#failureAfterApplyingIsLoggedFailed` was red first. The remaining case,
   a failure of the commit itself, is documented.
4. **The Kafka duplicate test did not check events, outbox or DLT.** **Fixed (T-14).**
5. **The end-of-day test did not compare against CLOSE and EXP specifically.** **Fixed (T-14).**
6. **The constraint race was unit-tested only.** **Fixed (T-14).**
   `DuplicateCommandIntegrationTest#commandIdConstraintRaceIsTheSame409` runs against Postgres. It
   also revealed that the race was logged with a generic reason; `PipelineResults.refusalReason`
   now keeps the duplicate's message.
7. **A REQUIRES_NEW audit write needs a second pool connection while the command holds its own.**
   **Accepted, not changed.** It is bounded, has no deadlock (no foreign key), and failures are
   counted. Recorded under Follow-ups for SPEC-0048.
8. **verification.md was unfilled.** **Fixed:** this document.

## Automated Evidence

`evidence/last-run.json`: result **pass**.
- **Policy check:** PASS.
- **Commands:** `./gradlew check` exited 0 in oms-core, oms-contracts, oms-streaming-service,
  oms-mcp-server and oms-exchange-simulator (logs in `evidence/`).
- **oms-core:** its `check` was up to date in the verify run. Its 561 tests (0 skipped, 0
  failures) ran in the full `./gradlew check` just before, on identical sources.

## Follow-ups

- **SPEC-0048 (several instances).** The `REQUIRES_NEW` audit write takes a second pool connection
  while the command holds its own and, on lifecycle commands, the order row lock. Size the pool
  for it, or write refused and failed rows after the command's transaction ends.
- **SPEC-0030.** A bust or whack received over Kafka will need a command model to be logged. Until
  then such records are dead-lettered without a log row.
- **A search over the log** (by commandId, by outcome) for rows without an order, such as refused
  creates.
- **Authentication**, to fill `principal` on REST.

## Verdict

Verdict: GOAL MET
