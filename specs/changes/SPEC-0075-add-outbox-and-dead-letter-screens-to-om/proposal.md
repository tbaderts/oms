# Proposal — SPEC-0075: Add outbox and dead-letter screens to oms-ui

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Two places in the OMS hold messages that did not get where they were going. Today neither can be
seen without database or Kafka tools.

- **The order outbox.** The `outbox` table is drained to Kafka by `OutboxRelay`; see
  [Outbox Message](../../../oms-knowledge-base/domain/model/outbox-message.md) and
  [FR-024](../../../oms-knowledge-base/capabilities/functional-requirements/FR-024-retry-failed-publication.md).
  - A message that fails `kafka.outbox.max-attempts` (10) times is **stuck**: it is no longer
    retried, and it stays in the table.
  - The later messages of its aggregate (same topic and key) are **held** behind it, so they are not
    published out of order.
  - The gauges `oms.outbox.stuck` and `oms.outbox.oldest.age` say *that* something is wrong. They
    don't say which messages, which orders, or what error. To find out, an operator queries
    PostgreSQL by hand.
- **Dead-letter topics.** oms-core's command listener retries a failing command, then routes it to
  `<command-topic>.DLT`. A malformed or unknown command goes there at once (`KafkaConsumerConfig`).
  - The record keeps the original bytes, and Spring adds headers: the exception, and the original
    topic, partition and offset.
  - The stack has no Kafka UI, so these records are invisible unless someone runs the Kafka CLI.
  - A dead-lettered command means a client's order instruction was lost, which is the kind of
    failure an operator must notice.

The ticket goal asks oms-ui to help manage the platform. It names two things: a tab that shows the
outbox's messages and whether any are pending or blocked, and a screen for the dead-letter topics.

## What Changes

- **A read-only operator API in oms-core,** specified first in oms-contracts. It is additive, with
  new paths only:
  - an outbox summary: counts of pending, stuck and held messages, and the age of the oldest pending
    message;
  - the outbox messages, filterable by state, oldest first, paged;
  - the dead-letter topics, with a record count each;
  - the latest records of one dead-letter topic, with the failure details from the headers and the
    payload decoded to JSON where possible.
- **An "Outbox" tab in oms-ui:**
  - summary tiles (pending, stuck, held, oldest age);
  - a table of messages with a state filter. Each row shows the state, aggregate (topic and key),
    order, type, attempts against the maximum, created time and last error;
  - a detail view of one message.
- **A "Dead letters" tab in oms-ui:**
  - the dead-letter topics with their counts;
  - the latest records of the selected topic: time, key, original topic, partition and offset,
    exception and message;
  - a detail view with the decoded payload (the JSON tree from SPEC-0074).
- **Reading changes nothing.** No outbox row is changed, no attempt is counted, no consumer group
  offset is committed, and no record is consumed away.

## Scope

### In scope

- The operator API (contract, oms-core implementation, tests) and the two oms-ui tabs.
- Every dead-letter topic on the broker: topics ending in `.DLT`, which is today the command topic's.
- Knowledge base: the outbox and event-publication pages, the oms-ui specification, and the
  event-streaming page's dead-letter section.

### Out of scope

- **Resending dead-lettered records.** This is deferred to a follow-up ticket; see Open Questions.
- **Replaying or removing a stuck outbox message.** FR-024 expects "an operator replays or removes
  it". That is a write action affecting delivery order, so it belongs to the same follow-up.
- **Alerting.** Alerts on the existing gauges belong to Grafana. The screens are for looking, not for
  paging.
- **Authentication and entitlements.** The OMS has none today. The API is read-only and exposes no
  more than the query API already does.
- **Dead-letter topics of other services.** Only oms-core dead-letters today. Topics ending in `.DLT`
  are listed whoever wrote them, but nothing else is added.

## Acceptance Criteria

### Outbox

- **AC-1** — Given outbox rows in every state, when the outbox summary is requested, then it answers
  the number of pending, stuck and held messages and the age of the oldest pending one.
  - The stuck count equals the `oms.outbox.stuck` gauge, and the age agrees with
    `oms.outbox.oldest.age`.
  - The Outbox tab shows these four figures.
- **AC-2** — Given an aggregate (topic and key) with a message that has used up its attempts and a
  later message, plus another aggregate with a message below its maximum, when the messages are
  listed, then their states are as follows:
  - the exhausted message is `STUCK`;
  - the later message of its aggregate is `HELD`;
  - the other is `PENDING`.

  Each row carries its id, topic, key, order id, execution id, message type, attempts, max attempts,
  created time and last error.
- **AC-3** — Given messages in several states, when the list is requested with a state filter, then
  only messages in that state are returned, oldest first, paged (page and size, size at most 200),
  with the total count. The Outbox tab's filter shows the same.
- **AC-4** — Given an empty outbox, when the Outbox tab is shown, then it says that every message has
  been published, with all counts at 0.
- **AC-5** — Given a message selected in the Outbox tab, when its detail opens, then it shows every
  field. A message staged with a payload shows the payload as a JSON tree; a pointer message, which
  has none, shows what it points to (order, execution, version).

### Dead letters

- **AC-6** — Given dead-letter topics on the broker, when they are requested, then each topic ending
  in `.DLT` is listed with the number of records it holds (the sum of end minus start offsets over
  its partitions). The Dead letters tab lists them.
- **AC-7** — Given a command that the command listener dead-letters, when the latest records of
  `<command-topic>.DLT` are requested, then that record is returned with the following:
  - its partition, offset, timestamp and key;
  - the original topic, partition and offset;
  - the exception class and message, from the Spring dead-letter headers;
  - its payload decoded to JSON when it is Avro registered in the schema registry, and otherwise as
    text or hex.

  Records come newest first, at most `limit` (default 50, at most 500).
- **AC-8** — Given dead-letter records, when they are read twice, then both reads return the same
  records, and no consumer group offset was committed by the reads.
- **AC-9** — Given the broker is unreachable, when the dead-letter API is called, then it answers 503
  within 10 seconds, with a problem body naming the cause. The Dead letters tab shows the error with
  a retry, and the Outbox tab keeps working.
- **AC-10** — Given no dead-letter topic or no records, when the Dead letters tab is shown, then it
  shows an empty state rather than an empty table.

### Knowledge base

- **AC-11** — Given this change, when the knowledge base is read, then the following pages describe
  what this ticket adds:
  - the outbox model page and FR-024: where stuck and held messages can be seen;
  - the event-streaming page: where dead-letter records can be seen;
  - the oms-ui specification: the two tabs;
  - the API's reference page: the endpoints.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts (new admin API spec), oms-core (endpoints, outbox and Kafka reads), oms-ui (two tabs), oms-knowledge-base |
| Contracts (OpenAPI / Avro) | Additive: a new operator (admin) OpenAPI document or new paths; no change to existing paths or Avro |
| Data (tables, migrations) | None; read-only queries on `outbox`. Indexes are checked in design (state queries by attempts and aggregate) |
| Events / Kafka topics | None written. `.DLT` topics are read with assigned partitions and no group commit |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui gains two tabs. The consumers of contracts (oms-core, oms-streaming-service, oms-mcp-server) rebuild with the new spec; nothing else changes for them |
| Knowledge base | `domain/model/outbox-message.md`, `capabilities/functional-requirements/FR-024-retry-failed-publication.md`, `architecture/concepts/event-streaming.md`, `ui/admin-ui.md`, the API reference page (new or extended) |

## Open Questions

- [resolved] **Resend dead-letter records (and replay or remove stuck outbox messages) now or later?**
  → assumption: **later, in a follow-up ticket.** This ticket is read-only.
  - Resending and replaying change delivery and ordering. A replay must respect the aggregate's
    order, and a resent command may duplicate one that has since been applied, which raises
    idempotency questions.
  - Both deserve their own acceptance criteria.
  - Seeing the messages first also shows which actions are actually needed.
  - **If you want them in this ticket, reopen this proposal with that note.**
- [resolved] **Where the API lives** → assumption: in oms-core, which owns the outbox table and the
  command listener's dead-letter topic, under a new `/api/admin/…` path group specified in
  oms-contracts. Not an actuator endpoint: it serves the UI and is specified like the other APIs.
- [resolved] **Which dead-letter topics** → every topic ending in `.DLT`, which is Spring's default
  suffix and the one oms-core uses, found through the Kafka admin client. Today only the command
  topic's exists.
- [resolved] **How records are read without side effects** → assumption: a short-lived consumer with
  assigned partitions, seeking back from the end offsets, with no group id and so no commit. The
  design confirms the client settings.
- [resolved] **Is "blocked" the same as held?** → yes. The goal's "blocked" messages are the KB's
  *held* messages, waiting behind a stuck one. The tab uses the KB's terms (stuck, held) and explains
  them.
