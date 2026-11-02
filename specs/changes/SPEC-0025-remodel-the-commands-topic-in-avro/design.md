# Design — SPEC-0025: Remodel the commands topic in Avro

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The approved proposal holds; its open questions were approved as assumptions:
- no dual-format period;
- deduplication unchanged;
- the `commands.DLT` depth gauge deferred.

The source is the review, `oms-core/docs/architecture-review-2026-10-30.md` §7.1. This design
follows it except where a decision below says otherwise.

**Today, contracts** (`oms-contracts/src/main/avro/`):
- `CommandMessage.avsc` has one field, `command`, a union of the eleven `*Cmd` records.
- Every `*Cmd` record starts with `type` (string) and `version` (nullable). Its payload fields are
  all nullable with a null default, e.g. `OrderAcceptCmd.orderId` and `OrderCreateCmd.order`.
- The four lifecycle records (`OrderRejectCmd`, `OrderCancelCmd`, `OrderCancelRequestCmd`,
  `OrderCancelRejectCmd`) also carry `commandId`.
- `Command.avsc` and `Cmd.avsc` are referenced by nothing.
- `CommandMessageCompatibilityTest` checks the resolved envelope against
  `compat/CommandMessage-baseline.json`.
- `DecimalPrecisionContractTest` encodes a `CommandMessage`.

**Today, OpenAPI** (`oms-cmd-api.yml`, 3.0.0):
- the `Command` base has `type` (required, the discriminator) and `version`;
- the four lifecycle schemas each declare `commandId` (maxLength 64).

**Today, consumer** (oms-core):
- `config/CommandListener#consume(Message<CommandMessage>)` unwraps the union and switches on the
  record class. It maps to the OpenAPI models by hand, through `OrderMapper.toCmdOrder` and
  `toCmdExecution`, and the four lifecycle commands through constructors. It calls
  `OrderCreateCommandProcessor`, `OrderAcceptCommandProcessor`, `ExecutionCommandProcessor` or
  `OrderLifecycleCommandProcessor`.
- An unknown type throws `IllegalArgumentException`.
- Values are read through `ErrorHandlingDeserializer` → `KafkaAvroDeserializer`
  (`specific.avro.reader: true`), as configured in `application.yml`.
- `config/KafkaConsumerConfig#commandErrorHandler` builds a `DeadLetterPublishingRecoverer` on the
  shared Avro `KafkaTemplate<String,Object>`, routing to `<topic>.DLT` on the same partition.
  `DeserializationException` and `IllegalArgumentException` are not retried.
- `OrderEventAppender#appendOrderEvent` stores the OpenAPI command as `order_events.transaction`
  (JSON). It stores `commandIdOf(command)` in `command_id`: today a four-way switch, so null for
  every other command.
- The unique constraint `uq_order_events_order_id_command_id` (changelog 006) backs
  `DeduplicateCommandTask`, which only the lifecycle pipeline runs.
- Every command appends exactly one event to its order. Duplicates are refused before the append:
  fills by `PersistExecutionTask` (`existsByOrderIdAndExecID`), creates by `PersistOrderTask`,
  accepts by their state precondition, lifecycle commands by `DeduplicateCommandTask`.

**Today, producer** (oms-exchange-simulator):
- `kafka/CommandGateway` implements `engine/CommandSink` and sends `new CommandMessage(record)`,
  keyed by orderId.
- `engine/ExchangeEngine` builds the lifecycle `commandId`s as `orderId-KIND-eventId` from the
  `OrderMessage` being answered (deterministic, so a replayed event yields a duplicate the OMS
  refuses). It schedules fills from the new-order message.

**Today, registration:** `spring.kafka.properties.auto.register.schemas: true` in oms-core.
- The simulator relies on the client default (true).
- oms-streaming-service only consumes.
- oms-mcp-server has no Kafka.
- Integration tests use the `mock://oms-it` and `mock://simulator-it` registries.

**Logging:** oms-core's log pattern is Spring Boot's default, whose correlation part prints only
`traceId`/`spanId`. Nothing in oms-core uses the MDC yet. The simulator puts `orderId` in the MDC.

**Closest examples:**
- `CommandListener` itself, and the `Message`-typed listener of SPEC-0018;
- the contract tests `OrderExecutionCompatibilityTest` and `OrderExecutionSchemaTest` (SPEC-0020);
- `OutboxRelay`'s Micrometer counters.

**Read:**
- `interfaces/avro-messages.md`, `interfaces/kafka-topics.md`, `interfaces/command-api.md`;
- `oms-framework/error-handling.md`, `testing-patterns.md`, `openapi-contracts.md`;
- `capabilities/exchange-simulation.md`.

## Approach

```mermaid
sequenceDiagram
  participant Sim as Simulator CommandGateway
  participant K as commands (key orderId)
  participant SR as Schema Registry
  participant L as CommandListener (oms-core)
  participant D as CommandDecoder
  participant P as Processors
  participant DLT as commands.DLT
  Sim->>SR: lookup id of commands-<Record> (auto.register=false)
  Sim->>K: bare <Record>{header, ...}
  K->>L: ConsumerRecord<String, byte[]>
  L->>D: decode(topic, bytes)
  D->>SR: schema by id → SpecificRecord
  L->>L: MDC commandId/correlationId; CommandHeaderMapper → OpenAPI Command
  L->>P: process(cmd)  → applied / refused
  L-->>DLT: on unknown type or decode failure: original bytes (byte[] template)
```

| What Changes (proposal) | Where |
|---|---|
| `CommandHeader`, eleven records rewritten, dead schemas removed | `oms-contracts/src/main/avro/` (Contract Changes) |
| OpenAPI base fields, 3.1.0 | `oms-cmd-api.yml` (Contract Changes) |
| Bare records, `TopicRecordNameStrategy` | simulator `application.yml` (producer); oms-core reads by schema id, so it needs no strategy |
| Listener on bare records, header mapper | oms-core `config/CommandListener`, new `config/CommandDecoder`, new `mapper/CommandHeaderMapper` |
| DLT keeps the original bytes | oms-core `config/KafkaConsumerConfig` |
| Simulator header | `CommandSink`, `ExchangeEngine`, `CommandGateway`, new `kafka/CommandHeaders` |
| `registerSchemas`, `auto.register.schemas=false` | oms-contracts source set `registry` and task; oms-core and simulator `application.yml`; `docker-compose.yml` |
| Counter and MDC | `CommandListener`; oms-core `logging.pattern.correlation` |

### oms-contracts

1. **Avro sources.**
   - Add `CommandHeader.avsc`.
   - Rewrite the eleven records (Contract Changes).
   - Delete `CommandMessage.avsc`, `Command.avsc` and `Cmd.avsc`.
2. **OpenAPI.** Add the base fields and set the version to 3.1.0 (Contract Changes).
3. **Tests.**
   - Delete `CommandMessageCompatibilityTest` and `compat/CommandMessage-baseline.json`.
   - Add `CommandSchemaTest`, the structural checks of AC-1. It discovers the records from the
     `*Cmd.avsc` files in `src/main/avro` and loads each generated class
     `org.example.common.model.msg.<name>`.
   - Add `CommandCompatibilityTest`, parameterised over the same list. Each record's
     `getClassSchema()` must read its baseline `compat/commands/<Record>.json`. The baselines are
     written once from the new schemas: this is the first release of the per-record subjects.
   - Add `CommandBaseContractTest` (AC-2), on the generated `cmd.Command`, plus `info.version`
     read from the YAML text.
   - In `DecimalPrecisionContractTest`, encode the bare `OrderCreateCmd`.
4. **Registration.** A new source set `registry` (`src/registry/java`, not part of the published
   jar) holds `org.example.common.contracts.registry.SchemaRegistrar`.
   - **Inputs:**
     - a `SchemaRegistryClient`;
     - the Avro source directory;
     - the subject map. For each `*Cmd.avsc` it is `commands-<full name>` with the generated
       class's `getClassSchema()`, plus the three event subjects in Events & Messaging.
   - **Phase 1:**
     - For each subject, call `testCompatibility(subject, schema)`. A subject that does not exist
       yet (registry error 40401) counts as compatible.
     - If any subject is incompatible, throw `IllegalStateException` naming every incompatible
       subject, before anything is registered.
   - **Phase 2:** register each subject.
   - **Which schema is registered:** the generated class's schema, not the `.avsc` text. The
     generated `SCHEMA$` carries properties the plugin adds (e.g. `avro.java.string`), and a
     serializer with `auto.register.schemas=false` looks up exactly that schema. Registering the
     file text would leave the serializer unable to find its id.
   - **Gradle:**
     - task `registerSchemas` (`JavaExec`, group `contracts`) runs `SchemaRegistrar.main` with the
       registry URL from `-PregistryUrl`, else `REGISTRY_URL`, else `http://localhost:8081`;
     - `registryImplementation 'io.confluent:kafka-schema-registry-client:7.9.9'` plus the main
       output;
     - `testImplementation sourceSets.registry.output` and
       `'io.confluent:kafka-avro-serializer:7.9.9'` for the tests.

### oms-core

1. **`application.yml`.**
   - `spring.kafka.properties.auto.register.schemas: ${KAFKA_AUTO_REGISTER_SCHEMAS:false}`.
   - `spring.kafka.consumer.value-deserializer: org.apache.kafka.common.serialization.ByteArrayDeserializer`.
     The `spring.deserializer.value.delegate.class` entry is removed. `specific.avro.reader` and
     `schema.registry.url` stay, read by the decoder.
   - `logging.pattern.correlation:
     "[${spring.application.name:},%X{traceId:-},%X{spanId:-},%X{commandId:-},%X{correlationId:-}] "`.
2. **`config/CommandDecoder`** (new `@Component`). It wraps a `KafkaAvroDeserializer` configured
   from `KafkaProperties.buildConsumerProperties()` (registry URL and `specific.avro.reader`).
   - `SpecificRecord decode(String topic, byte[] value)`. A null or empty value, or any
     `SerializationException` (unknown schema id, a writer class not on the classpath, bad magic
     byte), becomes `UndecodableCommandException extends IllegalArgumentException`, with the cause
     kept.
   - It is therefore non-retryable, as a `DeserializationException` is today.
3. **`config/KafkaConsumerConfig`.**
   - The container factory is typed `<String, byte[]>`.
   - The recoverer is built on a dedicated `KafkaTemplate<String, byte[]> deadLetterTemplate`
     (`StringSerializer` / `ByteArraySerializer`, from `KafkaProperties.buildProducerProperties()`).
   - The destination resolver, the backoff and the not-retryable list are unchanged.
   - Every value the recoverer sees is now the original `byte[]`, so the dead letter is
     byte-identical, including the 5-byte schema-id prefix.
4. **`mapper/CommandHeaderMapper`** (new `@Component`, plain code, no MapStruct: one source record
   onto any `Command` subclass).
   - `<C extends Command> C apply(CommandHeader header, C command)` sets:
     - `type` = the record's simple name;
     - `version` = `header.version`;
     - `commandId`, `correlationId`, `causationId`;
     - `sentAt` = `OffsetDateTime.ofInstant(header.sentAt, UTC)`.
   - It returns the command.
5. **`config/CommandListener`.**
   - `consume(ConsumerRecord<String, byte[]> record)` takes `receivedTime`, decodes, then
     `handle(SpecificRecord, Instant)`.
   - `handle`:
     - puts the header's `commandId` and `correlationId` in the MDC, removed in `finally`;
     - switches on the record class, as today without the unwrap;
     - each `handleX` builds the OpenAPI command (payload as today, header through the mapper),
       calls the processor and returns `isSuccess()`;
     - counts `oms.commands.consumed{type=<simple name>, outcome=applied|refused}`;
     - on any exception, counts `outcome=failed` and rethrows.
   - A decode failure counts `type=undecodable, outcome=failed`.
   - An unhandled record class (`ExecutionBust/Whack`, `QuoteCreate`, `QuoteRequestCreate`) throws
     `IllegalArgumentException`, as today, and goes to `commands.DLT`.
   - The lifecycle commands no longer copy `commandId` from the record; it comes from the header.
6. **`OrderEventAppender.commandIdOf`.** It becomes `command == null ? null : command.getCommandId()`
   (the field is on the base now), so `command_id` holds the header's id for every command.
   `DeduplicateCommandTask` is unchanged and still runs only in the lifecycle pipeline, so
   deduplication rules do not change (approved assumption).
7. **Test support.** `integration/TestCommands` (new) has:
   - `header(commandId)`, which builds a header with `producer=oms-core-it`;
   - a `commandTemplate(ProducerFactory)` factory: a `KafkaTemplate<String, Object>` with
     `value.subject.name.strategy=TopicRecordNameStrategy`.

   `AbstractKafkaPostgresIntegrationTest` sets `KAFKA_AUTO_REGISTER_SCHEMAS=true`, because the mock
   registry starts empty, as compose dev does. Five tests move to bare records:
   `AbstractFillFlowIntegrationTest`, `CommandListenerKafkaIntegrationTest`,
   `ExchangeWorkflowIntegrationTest`, `OrderExecutionPublicationIntegrationTest` and
   `CommandListenerTest`.

### oms-exchange-simulator

1. **`application.yml`** (producer):
   - `value.subject.name.strategy: io.confluent.kafka.serializers.subject.TopicRecordNameStrategy`;
   - `auto.register.schemas: ${KAFKA_AUTO_REGISTER_SCHEMAS:false}` under
     `spring.kafka.producer.properties`.

   `AbstractKafkaIntegrationTest` sets `KAFKA_AUTO_REGISTER_SCHEMAS=true`.
2. **`engine/Cause`** (new record): `(String rootOrderId, String orderId, Long eventId)`, with
   `Cause.of(OrderMessage)`.
   - `CommandSink` methods gain a leading `Cause cause` parameter.
   - `ExchangeEngine` stores the new-order message's cause on `SimOrder` for the accept and the
     fills. Cancel answers use the cancel request's cause, rejects the new order's.
   - `RecordingSink` and `ExchangeEngineTest` follow.
3. **`kafka/CommandHeaders`** (new) builds `CommandHeader.newBuilder()` with:
   - `commandId` = the lifecycle `commandId` when the engine supplied one (deterministic, so
     replays are still refused), else `UUID.randomUUID()` (accepts and fills);
   - `correlationId` = `cause.rootOrderId ?? cause.orderId`;
   - `causationId` = `orderId:eventId`, or null when `eventId` is null;
   - `sentAt` = now (micros);
   - `producer` = `spring.application.name` (`oms-exchange-simulator`);
   - `version` = `1.0.0`.

   `CommandGateway.send` publishes the record itself.

### Compose

`docker-compose.yml` sets `KAFKA_AUTO_REGISTER_SCHEMAS: "true"` on `oms-core` and
`exchange-simulator`, so local runs need no registration step.

## Contract Changes

**Avro — new `CommandHeader.avsc`:**

```json
{
  "namespace": "org.example.common.model.msg",
  "type": "record",
  "name": "CommandHeader",
  "doc": "Shared by every command, as its first field. Replaces the type and version fields repeated per record; the record name is the type.",
  "fields": [
    {"name": "commandId", "type": "string", "doc": "Identity of this command, unique per order. The lifecycle commands are refused as duplicates when their id was already applied."},
    {"name": "correlationId", "type": ["null", "string"], "default": null, "doc": "The root order this command belongs to."},
    {"name": "causationId", "type": ["null", "string"], "default": null, "doc": "The event that caused it, as orderId:eventId."},
    {"name": "sentAt", "type": {"type": "long", "logicalType": "timestamp-micros"}, "doc": "When the producer sent it."},
    {"name": "producer", "type": "string", "doc": "Service name, for diagnosis."},
    {"name": "version", "type": "string", "default": "1.0.0", "doc": "Command API version."}
  ]
}
```

**Avro — the eleven records**, each `header` first; `type`, `version` and the record-level
`commandId` removed (it is in the header). Payload fields the processor requires become
required; optional ones stay nullable:

| Record | Fields after `header` |
|---|---|
| `OrderCreateCmd` | `order: Order` |
| `OrderAcceptCmd` | `orderId: string` |
| `ExecutionCreateCmd` | `execution: Execution` |
| `ExecutionBustCmd`, `ExecutionWhackCmd` | `executionId: string` |
| `OrderRejectCmd`, `OrderCancelCmd`, `OrderCancelRejectCmd` | `orderId: string`, `text: ["null","string"] = null` |
| `OrderCancelRequestCmd` | `orderId: string` |
| `QuoteCreateCmd` | `quote: Quote` |
| `QuoteRequestCreateCmd` | `quoteRequest: QuoteRequest` |

For example:

```json
{
  "namespace": "org.example.common.model.msg",
  "type": "record",
  "name": "OrderRejectCmd",
  "doc": "Market rejected the order (FIX ExecutionReport ExecType=8).",
  "fields": [
    {"name": "header", "type": "org.example.common.model.msg.CommandHeader"},
    {"name": "orderId", "type": "string", "doc": "The order this command applies to."},
    {"name": "text", "type": ["null", "string"], "default": null, "doc": "Reject reason."}
  ]
}
```

The nested `Order`, `Execution`, `Quote` and `QuoteRequest` records are unchanged.

**Avro — removed:** `CommandMessage.avsc`, `Command.avsc`, `Cmd.avsc`.

**Generated classes that change:**
- the eleven `*Cmd` classes (constructors and builders);
- new `CommandHeader`;
- `CommandMessage`, `Command` and `Cmd` (msg) disappear.

**Compatibility: BREAKING on `commands`.**
- Wire format: the envelope is gone, and fields are removed and tightened.
- Subjects: `commands-value` is replaced by one subject per record.
- Compatible again from here on: each record has its own compatibility baseline (AC-1), and the
  registry checks each subject.
- Consumers broken: oms-core (the only consumer) and the simulator (the only producer). Both
  change in this ticket. oms-ui and oms-mcp-server do not read `commands`. No external producer is
  known.
- This is a P-04 exception (Policy Compliance).

**OpenAPI — `oms-cmd-api.yml`, `info.version: 3.1.0`.** The `Command` base gains these properties:

```yaml
        commandId:
          type: string
          maxLength: 64
          description: Identity of this command, unique per order; a lifecycle command already applied to the order is refused as a duplicate
        correlationId:
          type: string
          maxLength: 255
          description: The root order this command belongs to
        causationId:
          type: string
          maxLength: 255
          description: The event that caused this command, as orderId:eventId
        sentAt:
          type: string
          format: date-time
          description: When the sender sent the command
```

The four lifecycle schemas drop their own `commandId` (same name, type and length, now
inherited). The JSON wire format is unchanged: additive for every client. The generated Java
moves `getCommandId()` from the four subclasses to `cmd.Command`; callers compile unchanged.

## Data & Persistence

None — no schema change. `order_events.command_id` (changelog 006) now also receives the header's
`commandId` for creates, accepts and fills; `order_events.transaction` (JSONB) carries the new
base fields. The existing unique `(order_id, command_id)` holds, because every command appends at
most one event per order and duplicates are refused before the append (Context).

## Events & Messaging

- **`order_events` (P-05):** unchanged event types and counts. Each event's stored command now has
  `commandId`, `correlationId`, `causationId` and `sentAt` when it came over Kafka.
- **Outbox (P-06):** unchanged. oms-core still publishes `oms_orders`, `oms_executions` and
  `oms_order_executions` through `OutboxRelay` with `TopicNameStrategy`. With
  `auto.register.schemas=false` those subjects must exist, so `registerSchemas` registers:
  - `oms_orders-value` from `OrderMessage`;
  - `oms_executions-value` from `Execution`;
  - `oms_order_executions-value` from `OrderExecution`.
- **`commands`:**
  - Key: orderId, unchanged.
  - Value: the bare record; subject `commands-<full name>`.
  - Consumer idempotency is unchanged: fills by `(orderId, execID)`, creates by
    `(sessionId, clOrdId)`, accepts by state, lifecycle by `commandId`.
  - The simulator keeps its deterministic lifecycle ids in the header, so replayed answers are
    still refused.
  - Ordering: one partition per orderId, as today.
- **`commands.DLT`:**
  - Value: the original bytes.
  - Key: the original key.
  - Headers: Spring's exception headers, as today.
  - No subject is registered for it.
- **Cut-over (runbook in `interfaces/avro-messages.md`).**
  1. Run `registerSchemas` against the shared registry.
  2. Stop the simulator.
  3. Wait for `commands` consumer lag 0.
  4. Deploy oms-core.
  5. Deploy the simulator.
  6. Soft-delete `commands-value` after the retention period.

  It shares the drain of the SPEC-0039 runbook when both ship together.

## Domain, State & Orchestration

None — no state machine, task or validation change. Kafka commands reach the same processors and
pipelines. The refusal and failure semantics are unchanged: a refused result is acknowledged; an
exception retries and then goes to the DLT; a decode failure or an unknown type goes to the DLT
without retries.

## Alternatives & Decisions

- **Consume `byte[]` and decode in the listener** — chosen over the review's `SpecificRecord`
  container plus a templates-by-type recoverer.
  - With a `SpecificRecord` container, a record that deserialises but has no handler (e.g.
    `QuoteCreateCmd`) reaches the recoverer as an object. Writing it would re-serialise it under
    `commands.DLT`'s subject, which `auto.register=false` forbids, and the bytes would not be the
    original.
  - Decoding in the listener makes every dead letter the original bytes with one template (AC-4).
    It costs one small class.
- **Registrar on the Confluent `SchemaRegistryClient`** — chosen over the review's hand-written
  `java.net.http` task.
  - The client is already a dependency of every service (`kafka-avro-serializer:7.9.9` pulls it
    in), so this is not new to the project. It lives in a separate source set, out of the
    published jar, so oms-contracts' consumers do not gain it.
  - It gives compatibility checks and registration with the registry's exact semantics.
  - It lets the test use `MockSchemaRegistryClient` and then prove that a `KafkaAvroSerializer`
    with `auto.register.schemas=false` finds the registered id.
  - A hand-written HTTP client could only be tested against a fake that reimplements the
    registry. Rejected.
  - **P-17 build change:** a new source set and a `registerSchemas` task in
    `oms-contracts/build.gradle`. No new plugin.
- **Register the generated classes' schemas**, not the `.avsc` text: a serializer that cannot
  register looks up its class's exact schema (Approach).
- **Check every subject before registering any** — chosen over registering subject by subject. A
  failed run then leaves the registry unchanged, which is what AC-6's "registers nothing" asks.
- **The record-level `commandId` of the lifecycle records moves into the header** rather than
  staying beside it. Two ids on one command would invite disagreement. The simulator puts its
  deterministic lifecycle id in the header and a UUID for accepts and fills (AC-5).
- **`correlationId` falls back to the orderId** when the `OrderMessage` has no `rootOrderId`.
  Today every order is its own root (`OrderEventAppender.partitionKey`).
- **`auto.register.schemas` through `${KAFKA_AUTO_REGISTER_SCHEMAS:false}`**, rather than a Spring
  profile. Compose sets the variable, and so do the test bases. Neither service has a compose
  profile today, and a variable is one line in each place.
- **A decode failure is not retried**, as a `DeserializationException` is today. A registry outage
  while decoding an unseen schema id therefore dead-letters the command, which is the existing
  behaviour. Retrying on I/O causes is left out of this ticket (Risks).
- **No `@KafkaHandler` class-level listener** (the review's "tidier equivalent"). It needs the
  container to deserialise, which the first decision rules out. The switch stays.
- **Counter outcomes:** `applied` (success result), `refused` (unsuccessful result) and `failed`
  (exception, each attempt). Type `undecodable` is used when there is no record.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Undrained envelope records at cut-over fail to decode | Consumers-first after the drain (runbook). Such records land on `commands.DLT` with their original bytes, so they are recoverable, not lost (AC-4) |
| The serializer cannot find its schema with `auto.register=false` (the registered text differs from the class schema) | The registrar registers `getClassSchema()`. `SchemaRegistrarTest` serialises with a non-registering `KafkaAvroSerializer` against the same mock registry |
| Event subjects missing in a fresh shared registry, so oms-core's outbox stalls | `registerSchemas` covers the three event subjects; this is runbook step 1. Compose and tests keep auto-registration |
| A REST client reuses one `commandId` for two commands on one order, so the unique constraint fires | The contract says the id is unique per order. Within the Kafka path this cannot happen (UUIDs and deterministic lifecycle ids). Over REST a constraint violation is reported as today |
| A registry outage dead-letters commands whose schema id is not cached yet | The deserializer caches ids after first use, so the exposure is limited to a few new types after a restart. This behaviour is unchanged. Dead letters keep their bytes for replay |
| The changed log pattern breaks log parsing in Loki/Alloy | The pattern is only extended inside the existing `[...]` correlation block; the Alloy pipeline does not parse it (it ships lines) |
| Every test producer of commands must change at once | One `TestCommands` helper; the full oms-core and simulator suites run in verify |

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit (oms-contracts) | `CommandSchemaTest#headerFieldsAsSpecified`, `#everyCommandStartsWithHeader`, `#envelopeAndDeadSchemasAreGone`; `CommandCompatibilityTest#readsBaseline` (parameterised over every `*Cmd`) | Header field names, types, defaults and logical type. Every `*Cmd` record has `header: CommandHeader` first and no top-level `type`/`version`. `CommandMessage`/`Command`/`Cmd` classes and `.avsc` files are absent. Each record is reader-compatible with `compat/commands/<Record>.json` |
| AC-2 | unit (oms-contracts) | `CommandBaseContractTest#baseCarriesHeaderFields`, `#versionIs310` | `cmd.Command` has optional `commandId`, `correlationId`, `causationId`, `sentAt: OffsetDateTime`; the lifecycle classes inherit `commandId`; `oms-cmd-api.yml` `info.version` is 3.1.0 |
| AC-3 | integration | `CommandHeaderIntegrationTest#headerReachesTheEventLog` (new, extends `AbstractKafkaPostgresIntegrationTest`); unit `CommandHeaderMapperTest` | Bare `OrderCreateCmd` → `OrderAcceptCmd` → `ExecutionCreateCmd` (partial) → `OrderCancelRequestCmd` with distinct headers, over Kafka with the record-name strategy. Each applies (order LIVE, cumQty, cancel state PCXL). Each `order_events` row's `transaction` has the header's `commandId`/`correlationId`/`causationId`/`sentAt` (micros), and `command_id` equals the header `commandId` |
| AC-4 | integration | `CommandDeadLetterIntegrationTest#unhandledUndecodableAndGarbageKeepTheirBytes` (new) | On one key: a registered `QuoteCreateCmd` (no handler), a record of an unknown type `FutureCmd` (registered in the mock, no class), garbage bytes, then an `OrderAcceptCmd`. The first three appear on `commands.DLT` byte-for-byte equal to what was produced, with no retries (each once). The accept is applied |
| AC-5 | integration (simulator) + unit | `ExchangeSimulatorKafkaIntegrationTest#unackOrder_producesAckThenSingleFill` (extended), `#commandsUseOneSubjectPerRecord` (new); `CommandHeadersTest`; oms-core `ExchangeWorkflowIntegrationTest` (all) | Values are bare `OrderAcceptCmd`/`ExecutionCreateCmd` keyed by orderId. The mock registry has `commands-…OrderAcceptCmd` and `commands-…ExecutionCreateCmd` and no `commands-value`. Header: UUID `commandId`, `correlationId` = rootOrderId, `causationId` = `orderId:eventId`, `producer` = `oms-exchange-simulator`. Lifecycle answers keep the deterministic id. The oms-core workflow suite passes on bare records |
| AC-6 | unit (oms-contracts) + config | `SchemaRegistrarTest#registersEveryCommandAndEventSubject`, `#serializerWithoutAutoRegisterFindsTheId`, `#incompatibleSubjectFailsAndRegistersNothing`; oms-core `SchemaRegistrationConfigTest`; simulator `SchemaRegistrationConfigTest` | Subjects = one per `*Cmd` plus the three event subjects. A `KafkaAvroSerializer` (`auto.register=false`, `TopicRecordNameStrategy`) serialises each command against the same mock. With an incompatible version pre-registered under one subject, the run throws naming it, and no subject gains a version. Each service's `application.yml` resolves `auto.register.schemas` to `false` without the variable and to `true` with it, and `docker-compose.yml` sets it `true` for `oms-core` and `exchange-simulator` only |
| AC-7 | unit + integration | `CommandListenerTest#countsAppliedRefusedFailed`, `#mdcCarriesCommandAndCorrelationId`; `CommandListenerKafkaIntegrationTest#logLinesCarryCommandAndCorrelationId` (`OutputCaptureExtension`) | `oms.commands.consumed` counts applied, refused (duplicate `commandId` result) and failed (processor throws) under their record type and outcome. Every log event during processing has the MDC keys. A printed log line of a Kafka-consumed command contains its `commandId` and `correlationId` |

Also updated and run in verify: `CommandListenerTest` (dispatch for each record, unknown type
throws), `DecimalPrecisionContractTest`, and the oms-core suites that send commands
(`AbstractFillFlowIntegrationTest` subclasses, `OrderExecutionPublicationIntegrationTest`,
`ExchangeWorkflowIntegrationTest`). The simulator's `ExchangeEngineTest` covers the `Cause` it
passes.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | comply | The new and rewritten `.avsc` files, the OpenAPI change and the registrar are all in oms-contracts; no module gains a contract folder |
| P-02 | Specification before code, generated models only | comply | Schemas first; the listener, simulator and mapper use the generated `msg` and `cmd` classes. `CommandHeaderMapper` maps between generated types and defines none |
| P-03 | Never edit generated code | comply | Regenerated by `./gradlew clean build` in oms-contracts |
| P-04 | Contracts evolve compatibly | exception | BREAKING on `commands`: the envelope is removed, `type`/`version`/`commandId` are removed from the records, and payload fields are tightened. This is the goal of the ticket and approved in the proposal (marked BREAKING, consumers listed). It is contained by a drained, consumers-first cut-over, and both affected modules change here. From here on each record has its own compatibility baseline and registry subject. The OpenAPI change is additive (3.1.0) |
| P-05 | Every state change is recorded in the event log | comply | Unchanged events; the stored command gains the header fields |
| P-06 | Kafka only through the transactional outbox | comply | oms-core still publishes only via `OutboxRelay`. The new dead-letter template only republishes a failed inbound record, which is the existing DLT mechanism and not a state change |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database change |
| P-08 | Concurrency and idempotency are explicit | comply | Deduplication is unchanged per command type. The deterministic lifecycle ids are kept in the header. `(order_id, command_id)` stays unique, with at most one event per command per order (Data & Persistence) |
| P-09 | Commands and queries stay separate | comply | Command API and the command topic only |
| P-10 | State transitions go through the state machine and task pipeline | comply | The listener calls the same processors; no transition logic is added |
| P-11 | Layering and conventions | comply | `config/` holds the Kafka wiring (listener, decoder) and `mapper/` the header mapper. The simulator's `Cause` sits in `engine/` and `CommandHeaders` in `kafka/`, beside their peers |
| P-12 | Jackson 3 only | comply | No new Jackson use; `transaction` serialisation is unchanged (`tools.jackson`) |
| P-13 | Errors and validation follow the framework specs | comply | Kafka error path as in `error-handling.md`: refusals acknowledged; retries then DLT; undecodable and unknown records to the DLT with no retry. REST validation of the new fields comes from the spec (`maxLength`) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Every AC is mapped to a test above; the tests are written red first in the plan |
| P-15 | Observability | comply | `oms.commands.consumed{type,outcome}`; `commandId`/`correlationId` in the MDC and printed in the correlation block; trace propagation is unchanged |
| P-16 | Security | comply | No secrets. The registry URL comes from the environment as today. Schemas are registered by an explicit operator or CI step instead of by any running producer |
| P-17 | Simplicity and dependencies | comply | No new library for the project: the registry client is already in every service and is scoped to a non-published source set. Build change recorded (source set and task). The alternatives are in Alternatives & Decisions |
| P-18 | Modules build standalone | comply | oms-core and the simulator include oms-contracts as today. The registrar source set builds within oms-contracts. All five Java modules are verified |
| P-19 | Documentation follows behaviour | comply | Knowledge Base Updates below |

## Knowledge Base Updates

- `interfaces/avro-messages.md` — the envelope section replaced by `CommandHeader` and the
  per-record subjects; the registration step; the cut-over added to the deployment runbook.
- `interfaces/kafka-topics.md` — `commands`: value, subject strategy, subjects, key; `commands.DLT`
  holds the original bytes; event subjects registered by `registerSchemas`.
- `interfaces/command-api.md` — the `Command` base fields and 3.1.0.
- `capabilities/exchange-simulation.md` — the header the simulator sets.
- `oms-framework/error-handling.md` — the decode path and byte-identical dead letters.
- `oms-framework/testing-patterns.md` — producing bare commands in tests (`TestCommands`,
  `TopicRecordNameStrategy`, auto-registration in test bases).
- `oms-contracts/README.md` — `registerSchemas` and the command schemas (it names
  `CommandMessage`).
- The storyboard steps the review names: updated if they show `CommandMessage` (none are found
  under `oms-knowledge-base` by grep; checked again in implement).
- `mission-control/docs/architecture/mission-control-v2.md` mentions `CommandMessage`, but it is a
  historical design note of another module. It is left as is and listed in the verify follow-ups.
