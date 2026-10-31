# Proposal — SPEC-0007: API Explorer as OMS-aware console

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The developer-cockpit sidebar has had an **API Explorer** entry since the start, but it opens a
"coming soon" placeholder (`ContentArea.tsx`), and no cockpit spec page describes it
(`developer-cockpit/spec/03-features.md` has no section for it). The requester asked for it to become
an **OMS-aware console** rather than a second Swagger UI (ticket Goal).

Today a developer who wants to exercise oms-core by hand:

- uses Swagger UI (`/swagger-ui.html`) or curl. The command API is a single `POST
  /api/command/execute` with a polymorphic `Command` body (7 types chosen by `type`). Swagger shows
  three hard-coded examples (`CommandController`) and no way to start from a given type's schema.
- has to know that the paths in `oms-contracts` (`/execute`, `/search`) are served under
  `/api/command` and `/api/query`. The contracts declare no `servers` entry.
- gets back only `CommandResult` (`id`, `status`, `message`). To see what the command did to the
  order, they have to query the order (`/api/query/search?orderId=…`) and its event log
  (`/api/order-events/orderId/{orderId}`, an internal `@Hidden` endpoint) separately, by hand.
- loses filters silently. The query API ignores unknown or malformed filters (`OrderSpecifications`
  logs a warning), so a typo in `?symbl=AAPL` returns *all* orders without any hint.

The cockpit already loads the contracts from `oms-contracts` (Contracts view, SPEC-0005). It can
therefore build requests from the same source the server is generated from, and it knows the
domain: order ids, command types, event log. If we do nothing, the sidebar keeps a dead entry, and
manual testing of the order lifecycle stays a multi-tool chore.

## What Changes

New **API Explorer** view in developer-cockpit (replaces the placeholder), with two tabs:

- **Commands**:
  - Pick a command type. The list is read from the `Command` discriminator mapping in
    `oms-cmd-api.yml`, so a new command type in the contract shows up without a cockpit change.
  - The JSON editor (Monaco) is pre-filled with a template generated from that type's schema:
    `type`, `version`, every required field, with placeholder values by type, the first enum value
    and the schema's example where one exists.
  - The body is checked against the schema as you type: missing required fields, wrong types and
    unknown enum values are listed with their JSON path. These are warnings; you can still send, to
    test server-side validation.
  - Send it: the response's status code, duration and body are shown.
- **Order follow-up**, shown under a command response that names an order (the created `id`, or the
  command's `orderId`):
  - the order's current state and key fields;
  - its event timeline from the event log: version, event, resulting state, time, with the command
    and snapshot expandable.
  - It can be refreshed. From it, the next command for that order (accept, fill, cancel, …) can be
    started with `orderId` already filled in.
- **Orders** (query):
  - A filter builder over the query API's filterable fields, offering only the operators valid for
    each field's kind (string: `eq`, `like`; numeric and date-time: `eq`, `gt`, `gte`, `lt`, `lte`,
    `between`; enum: `eq` with the enum's values). Unknown fields therefore cannot be entered.
  - Page, size and sort; the exact request URL is shown.
  - Results appear as a table; clicking an order opens its follow-up.
- **Target and safety**:
  - Requests go from the Electron main process to a configurable oms-core base URL (default
    `http://localhost:8090`; Settings/config).
  - If oms-core cannot be reached, the view says so ("oms-core not reachable at …") instead of
    failing silently.
  - Sending a command to a host other than localhost/127.0.0.1 asks for confirmation every time.
- **History**:
  - Every sent request (command or query) is kept per user, up to the last 100, and survives a
    restart.
  - Selecting an entry loads it back into the editor or filter builder; the history can be cleared.
- `developer-cockpit/spec/03-features.md` gains an API Explorer section; the placeholder disappears.
- Nothing is **BREAKING**. No change outside developer-cockpit.

## Scope

### In scope

- The API Explorer view (Commands, Orders, Order follow-up, History) in developer-cockpit.
- A main-process HTTP service and IPC for it, plus a base-URL config entry with a default.
- Template generation and schema checks from the OpenAPI contracts in `oms-contracts` (including
  `$ref`s into `schema.yml` and `allOf` composition).
- Tests for every AC, a runtime check against a running oms-core, and the cockpit spec pages.

### Out of scope

- Changes to oms-core or the contracts. In particular, the event log endpoint is used as it is
  today; contracting it is a separate ticket (see Open Questions).
- Kafka/Avro messages: publishing or browsing them belongs to the Message Bus view.
- Authentication, multiple named environments, request collections shared through the repository.
- Load or performance testing (repeat/batch sends).
- A generic "any OpenAPI file" explorer; only the OMS command and query APIs are supported.
- Links from other views (Contracts "Open in API Explorer", storyboard link chips); later tickets.

## Acceptance Criteria

- **AC-1** — Given the contracts in `oms-contracts/src/main/openapi`, when the Commands tab opens,
  then it offers exactly the command types in the `Command` discriminator mapping of
  `oms-cmd-api.yml` (today 7). After a type is added to or removed from that mapping on disk, the
  list follows without a restart.
- **AC-2** — Given a command type is selected, when the template is generated, then the editor
  contains valid JSON with `type` set to that type and every required property of that type's schema
  (resolved through `allOf` and `$ref`, including into `schema.yml`), nested required properties
  included. Enum properties take a value from their enum, and the template passes the schema check
  with no findings.
- **AC-3** — Given a command body in the editor, when it lacks a required property, has a value of
  the wrong type, or has a value outside its enum, then each problem is listed with its JSON path
  (e.g. `order.side`). Send stays enabled, and a body that is not valid JSON cannot be sent and shows
  the parse error.
- **AC-4** — Given a reachable oms-core, when a command is sent, then the main process POSTs it to
  `<baseUrl>/api/command/execute` with `Content-Type: application/json`, and the view shows the HTTP
  status, the duration in ms and the response body, for both 2xx and 4xx/5xx responses.
  Given an unreachable base URL or no answer within 10 s, it shows "oms-core not reachable at
  <baseUrl>" with the underlying error, and the view stays usable.
- **AC-5** — Given a command response that names an order (the `id` of a successful
  `OrderCreateCmd`, or the `orderId` of the sent command), when the follow-up loads, then it shows
  the order's current state from `/api/query/search?orderId=<id>`, and its events from
  `/api/order-events/orderId/<id>` ordered by version (version, event, resulting state, time).
  Refresh reloads both. An order id that matches no order shows "Order <id> not found" and no
  timeline. From the follow-up, choosing a command type opens a template with `orderId` set to that
  order.
- **AC-6** — Given the Orders tab, when filters are added, then only the query API's filterable
  fields can be chosen, each with only the operators valid for its kind (and the enum's values for
  enum fields). The request URL shown equals the one sent (filters, `page`, `size`, `sort`), the
  results are listed as a table with the page metadata, and clicking a row opens that order's
  follow-up.
- **AC-7** — Given a base URL whose host is not `localhost`, `127.0.0.1` or `::1`, when a command is
  sent, then a confirmation naming the host is shown, and cancelling sends nothing. Queries and
  follow-up reads are sent without confirmation.
- **AC-8** — Given requests have been sent, when the cockpit is restarted, then the history lists
  them, newest first, at most 100, each with method, path or command type, status and time. Choosing
  an entry restores the command body or the query filters. Clear empties the history, also on disk.
- **AC-9** — Given the cockpit config, when no base URL is set, then `http://localhost:8090` is used;
  when the base URL is changed in the config, then the next request uses the new value without a
  restart.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit only: main-process HTTP and history service plus IPC, config field, renderer view, stores, template/schema-check library. |
| Contracts (OpenAPI / Avro) | none; read only. |
| Data (tables, migrations) | none in OMS. The cockpit stores history in a per-user file next to its config (`~/.developer-cockpit/`). |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none. Commands sent from the explorer go through oms-core like any other client (event log, outbox) and are visible in oms-ui. |
| Knowledge base | `developer-cockpit/spec/03-features.md` (new API Explorer section), `02-information-architecture.md` (view description), `04-backend-services.md` (HTTP service). No `oms-knowledge-base/` change. |

## Open Questions

- [resolved] Form fields or a JSON editor for command bodies? → assumption: a JSON editor with a
  generated template and schema checks. The order in `OrderCreateCmd` has ~30 fields; a generated form
  would be large, and JSON is copy-pastable into tests and curl. A form can be added later on the
  same schema code.
- [resolved] Should the follow-up use the internal, uncontracted event log endpoint
  (`/api/order-events/orderId/{orderId}`, `@Hidden`, returns the `OrderEvent` entity)? →
  assumption: yes, read-only. The timeline is the core of "OMS-aware", and changing oms-core is out
  of scope. The order state comes from the contracted query API. Risk: the entity's JSON shape can
  change without a contract; the view degrades to showing the raw JSON if expected fields are
  missing. Follow-up ticket: add an events operation to `oms-query-api.yml`. **Reviewer, please
  confirm or ask to include the contract change in this ticket.**
- [resolved] How does the explorer know the URL prefix (`/api/command`, `/api/query`) that the
  contracts do not declare? → assumption: a fixed mapping in the cockpit (command API →
  `/api/command`, query API → `/api/query`), covered by a test. Adding `servers` to the contracts is
  a follow-up.
- [resolved] Where do the filterable fields and operators come from? They exist in the query API
  only as description prose (and in `OrderSpecifications`). → assumption: a cockpit-side table that
  mirrors that description, with a test that fails if a field in the table is missing from the
  description text, or the other way round.
- [resolved] Safety guard for state-changing commands? → assumption: confirmation for non-local
  hosts only (AC-7). Local sends are the normal developer loop and should not nag.
- [resolved] Where is the history stored? → assumption: per user in `~/.developer-cockpit/`, not in
  the repository. Shared scenarios are out of scope.
- [deferred] Several named environments (local, docker, test) → a single base URL is enough for
  the local stack. Adding a list later does not change the stored history format.
