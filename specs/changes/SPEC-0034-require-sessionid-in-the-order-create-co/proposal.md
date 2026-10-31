# Proposal — SPEC-0034: Require sessionId in the order create contract

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The command contract and oms-core disagree about `sessionId` (SPEC-0007 follow-up 1, still open in
SPEC-0008). `oms-cmd-api.yml` lists `Order.sessionId` as optional. oms-core's `ValidateOrderTask`
rejects an `OrderCreateCmd` without it ("SessionId is required"), and duplicate detection keys on
`(sessionId, clOrdId)` (`PersistOrderTask`, FR-004). So a client that builds a request from the
contract alone sends a request the contract calls valid, and gets a 400.

This affects anyone who works from the contract:
- the developer cockpit's API Explorer, which fills and checks bodies from the schema's `required`
  list;
- the Swagger UI;
- future generated clients.

Today the cockpit's starter templates only work because they set `sessionId` by hand. If nothing
changes, every new client finds the rule by trial and error, and the contract cannot be trusted as
the specification (spec-driven development).

The requester chose the contract alignment: mark the field required in the contract rather than
default it in oms-core.

## What Changes

- **BREAKING** (contract only): `Order.sessionId` in `oms-cmd-api.yml` becomes required and
  non-empty (`minLength: 1`, like `clOrdId`). The API version moves from `1.0.0` to `2.0.0`.
  - On the wire, nothing that works today stops working: oms-core already rejects these requests.
  - The break is in the published contract and generated code:
    - clients that validate against the contract now reject a body without `sessionId` before
      sending it;
    - the generated Java `Order` all-required-args constructor gains a `sessionId` parameter.
  - Consumers of the command contract: developer-cockpit (API Explorer, Contracts view) and the
    oms-core Swagger UI. oms-ui and oms-mcp-server do not send commands. oms-exchange-simulator
    sends executions, not `OrderCreateCmd`.
- `POST /api/command/execute` with an `OrderCreateCmd` whose `order.sessionId` is missing or empty
  is still rejected with **400**. The rejection now comes from request validation, so the body is
  the same `ProblemDetail` that other contract-required order fields (`symbol`, `clOrdId`, …)
  already produce, instead of a `CommandResult` with status `FAILED`.
- The API Explorer's generated `OrderCreateCmd` body includes `order.sessionId`. Its pre-send
  check reports a missing `order.sessionId`.
- Knowledge base pages that describe the create contract or its validation state that `sessionId`
  is contract-required.

## Scope

### In scope

- `oms-cmd-api.yml`: `required` and `minLength` on `Order.sessionId`, and the version bump.
- oms-core: anything that stops compiling or passing because of the regenerated model, and tests
  for the HTTP rejection.
- developer-cockpit: anything that breaks against the new contract (templates, fixtures, tests).
- Fixing every `OrderCreateCmd` sample or example in the repository that omits `sessionId`.
- Knowledge base updates for the create contract and validation pages.

### Out of scope

- **Avro**: `Order.avsc` / `CommandMessage` keep `sessionId` nullable. Narrowing it would break
  backward compatibility (P-04). The Kafka command path keeps rejecting a missing `sessionId` in
  `ValidateOrderTask`. Remodelling the commands topic is SPEC-0025.
- Defaulting or deriving `sessionId` in oms-core (the rejected alternative).
- Requiring `sessionId` on the query side (`oms-query-api.yml`) or in `OrderMessage`.
- Changing what a session is, or the `(sessionId, clOrdId)` duplicate rule.
- Versioning the URL path (`/api/command/v2`). The version change is in `info.version` only.

## Acceptance Criteria

- **AC-1** — Given `oms-contracts/src/main/openapi/oms-cmd-api.yml`, when the `Order` schema is
  read, then `required` contains `sessionId`, `sessionId` has `minLength: 1`, and `info.version`
  is `2.0.0`.
- **AC-2** — Given the regenerated command models, when an `OrderCreateCmd` whose order has no
  `sessionId` (and, separately, an empty `""` one) is validated with Bean Validation, then there is
  a violation on `order.sessionId`.
- **AC-3** — Given oms-core is running, when `POST /api/command/execute` receives an
  `OrderCreateCmd` whose `order.sessionId` is missing or `""`, then the response is 400, its body
  names `sessionId`, and no row is added to `orders`, `order_events` or the outbox.
- **AC-4** — Given oms-core is running, when `POST /api/command/execute` receives a valid
  `OrderCreateCmd` with a non-empty `sessionId`, then the response is 201 with status `OK`
  (regression).
- **AC-5** — Given an Avro `OrderCreateCmd` on the commands topic whose order has a null
  `sessionId`, when oms-core consumes it, then no order is persisted and the command is reported
  as rejected, as today. The Avro schemas and their compatibility baselines are unchanged.
- **AC-6** — Given the developer cockpit loads the updated contract, when it builds the starter
  body for `OrderCreateCmd`, then the body contains `order.sessionId`. When the pre-send check runs
  on a body without it, it reports `order.sessionId` as a missing required property.
- **AC-7** — Given the repository after this change, when every bundled `OrderCreateCmd` example
  (cockpit `api-templates/*.http`, oms-core `rest.http`, and the `CommandController` OpenAPI
  examples) is checked against the new contract, then none of them is missing `order.sessionId`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, developer-cockpit (set with `spec set`) |
| Contracts (OpenAPI / Avro) | `oms-cmd-api.yml`: `Order.sessionId` required, `minLength: 1`, version 2.0.0. **BREAKING** (narrowing). Avro unchanged. |
| Data (tables, migrations) | none |
| Events / Kafka topics | none: the commands topic schema is unchanged, and so is its runtime behaviour |
| Consumers (oms-ui, oms-mcp-server, downstream) | developer-cockpit (API Explorer, Contracts view, templates), oms-core Swagger UI. No change for oms-ui, oms-mcp-server, oms-streaming-service or oms-exchange-simulator. |
| Knowledge base | `functional-requirements/FR-002-validate-new-orders.md`, `oms-framework/validation-rules.md`, `oms-framework/openapi-contracts.md` (as needed) |

## Open Questions

- [resolved] Required in the contract, or a default in oms-core? → Required in the contract (the
  requester's choice; the goal says so).
- [resolved] Which version number for the narrowing? → assumption: `2.0.0`, because P-04 says a
  breaking change is versioned and semver puts that in the major number. Cheap to change at
  approval if you prefer `1.1.0`, since the wire behaviour does not change.
- [resolved] Should the response body for a missing `sessionId` stay a `CommandResult`? →
  assumption: no. It becomes the same 400 `ProblemDetail` as every other contract-required field,
  and the status code is unchanged. Keeping the old body would need a special case that the
  contract does not describe.
- [resolved] Should whitespace-only `sessionId` (`"  "`) be rejected by the contract? → assumption:
  no contract pattern for it. `ValidateOrderTask` keeps rejecting blank values (`isBlank`), so
  behaviour is unchanged, and `clOrdId` is handled the same way.
- [deferred] Making `sessionId` non-nullable in Avro → it is a backward-incompatible change, and
  the commands topic is being remodelled in SPEC-0025. The runtime check covers the Kafka path.
