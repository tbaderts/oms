# Verification — SPEC-0007: API Explorer as OMS-aware console

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (`evidence/developer-cockpit-2.log`: 40
files / 191 tests + perf test). Paths are under `developer-cockpit/test/`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Command types from the `Command` mapping, live | `main/ApiCatalogService.test.ts`: "lists the command types of the repository's Command mapping" (the 7 types, in order), "follows the mapping on disk" (a type added to and removed from a temp copy), "reports a missing contract file instead of throwing"; `main/WatcherService.test.ts`: "watches oms-contracts/src/main"; `renderer/ApiExplorer.commands.test.tsx`: "reloads the command list when a contract file changes". Runtime: 7 types listed. | PASS |
| AC-2 | Template with every required property; passes the check | `renderer/api-schema.test.ts`: "template for every command type … passes the check" (all 7 real schemas, every required path recursively), "resolves allOf and schema.yml refs", "nested required properties are filled (execution.execId)" | PASS |
| AC-3 | Findings with paths; Send enabled; invalid JSON blocks | `renderer/api-schema.test.ts`: "reports missing required, wrong type, enum and length with paths", "reports null for a property that is not nullable", "reports JSON parse errors with line and column"; `renderer/ApiExplorer.commands.test.tsx`: "send stays enabled with findings and is disabled for invalid JSON"; `main/OmsHttpService.test.ts`: "refuses a body that is not JSON without sending" | PASS |
| AC-4 | POST to `/api/command/execute`; status, ms, body; unreachable/timeout | `main/OmsHttpService.test.ts`, against a real HTTP server: "posts the command … returns status, duration and body" (201 and 400, method, path, content type, body), "keeps a non-JSON body as text", "reports oms-core not reachable on connection refused", "times out after the request timeout" (injected 200 ms; the default constant is asserted to be 10 000), "never throws across IPC"; `renderer/ApiExplorer.commands.test.tsx`: "shows status, duration and body; shows the unreachable alert", "shows the title and detail of a problem response". Runtime: 201 / 400 shown with duration. | PASS |
| AC-5 | Follow-up: state, timeline by version, refresh, not found, next command | `main/OmsHttpService.test.ts`: "followUp loads the order and events sorted by version" (exact URLs, id encoded), "unknown order gives order null and no timeline", "unexpected event shape falls back to raw", "tells a failed order query from an unknown order", "refuses a blank order id without a request"; `renderer/api-schema.test.ts`: "orderIdOf …"; `renderer/ApiExplorer.followup.test.tsx`: create → state and timeline, Refresh, not found, raw fallback, failed query, "next command presets orderId" (top level and `execution.orderId`), no follow-up for a failed create. Runtime: UNACK + v1 after create, v2 REJ after refresh. | PASS |
| AC-6 | Filter builder by kind; URL shown = URL sent; table; row → follow-up | `shared/apiExplorer.test.ts`: `toSearchParams`, "FILTER_FIELDS matches the query API description" (drift check, both directions); `main/OmsHttpService.test.ts`: "search builds the query string and refuses unknown filter fields"; `renderer/ApiExplorer.orders.test.tsx`: operators by kind, enum values from the catalog, shown URL equals the URL main reports for the first search and for a search after paging and editing, table, page metadata, next page, row opens the follow-up. Runtime: `clOrdId eq …` found the order and the row opened it. | PASS |
| AC-7 | Non-local host needs confirmation; reads do not | `shared/apiExplorer.test.ts`: "isLocalHost"; `main/OmsHttpService.test.ts`: "refuses a command to a non-local host without matching confirmation; queries need none" (enforced in main); `renderer/ApiExplorer.commands.test.tsx`: "asks before sending to a non-local host; cancel sends nothing" | PASS |
| AC-8 | History survives restart, newest first, ≤100, restore, clear | `main/ApiHistoryService.test.ts`: "keeps the newest 100 across instances" (new instance = restart), "clear empties the file", "corrupt file reads as empty …", "truncates large bodies", atomic write; `main/apiExplorer.ipc.test.ts`: "records each send including failures, not follow-ups", "returns the response when the history cannot be written"; `renderer/ApiExplorer.history.test.tsx`: list with time, label, method and path, status; refused marker; restore body and filters; clear asks first. Runtime: History listed the sends; Restore put the create body back. | PASS |
| AC-9 | Default `http://localhost:8090`; config change applies to the next request | `main/apiExplorer.ipc.test.ts`: "defaults to http://localhost:8090", "falls back to the default when the saved URL is empty", "uses the new base URL after config save without re-registering" (real ConfigService); `renderer/SettingsView.test.tsx`: "edits the oms-core URL" | PASS |

**Runtime check (T-12):** the built app over CDP at 1440×900, against the oms-core of the running
Docker stack. Results are in tasks.md Notes; screenshots were inspected; there were no console
errors and no horizontal overflow. Deviations from the planned script:
- **How the create body got into the editor.** It was put there via History → Restore of a
  seeded entry, because typing into Monaco over CDP was unreliable.
- **The accept was refused.** The exchange simulator rejected the order first (v2 REJ), so the
  "Next command" accept was refused by oms-core (400, invalid transition REJ → LIVE). The explorer
  displayed that correctly, but a *successful* follow-on command was not observed at runtime. It
  is covered by the component tests.

## Goal Assessment

The Goal: *build the API Explorer as an OMS-aware console rather than a second Swagger UI: pick a
command type, get a request built from its schema, send it, and see the order's resulting state
and events.*

What was delivered, and confirmed in the running app against the real oms-core:
- the command types come from the contract;
- the template and the live checks come from the schema;
- sending goes through the main process, with a guard for non-local hosts;
- the order follow-up shows state and an event timeline and offers the next command;
- a query builder that cannot produce the silently-ignored filters oms-core would accept;
- a per-user history.

**Gap, outside this ticket:** the generated `OrderCreateCmd` template cannot create an order as
it stands. oms-core answers 400 "SessionId is required", but `Order` in `oms-cmd-api.yml` does not
list `sessionId` as required. The explorer shows the error clearly. Filling in a `sessionId`
works, as the runtime check did. The mismatch belongs to the contract or to oms-core, and is
recorded as the first follow-up. It does not make this ticket's goal unmet, but the first step of
the loop needs one extra field until the follow-up is done.

## Policy Review

Reviewed against the SPEC-0007 files only. The six R10 warnings from the policy check come from
unrelated branch work: Gradle and docker-compose files.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Contracts are read from the configured `oms-contracts` paths; nothing is copied. |
| P-02 | Specification before code, generated models only | PASS | Command types, templates and checks are derived from the contracts at runtime; the filter table is drift-tested against the query API. |
| P-03 | Never edit generated code | N/A | No generated code involved. |
| P-04 | Contracts evolve compatibly | N/A | No contract change. |
| P-05 | Every state change is recorded in the event log | N/A | The cockpit changes no order state itself; commands go through oms-core. |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka. |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database. |
| P-08 | Concurrency and idempotency are explicit | PASS | Single writer (main), atomic history writes, no automatic resend; `commandId` stays the user's choice. |
| P-09 | Commands and queries stay separate | PASS | Separate tabs, channels and service methods; reads never POST. |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions here; oms-core enforced them (REJ → LIVE refused at runtime). |
| P-11 | Layering and conventions | PASS | IPC → services with injectable fetch, clock and directory; pure logic in `lib/` and `shared/`; zustand store; tabbed view. |
| P-12 | Jackson 3 only | N/A | TypeScript only. |
| P-13 | Errors and validation follow the framework specs | PASS | oms-core's FAILED results and Problem+JSON are shown as returned; network failures carry their cause; refused and unreachable are distinct; nothing is swallowed, IPC never rejects. |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC is traced above. One red run was not observed (T-3, recorded in tasks.md Notes). Monaco is stubbed in the tests, and the T-12 runtime check exercised the real editor only through restore. |
| P-15 | Observability | PASS | `[api-explorer]` log line per request (method, path, status, ms, orderId); history write failures logged. |
| P-16 | Security | PASS | Input validated in main: JSON body, known filters, http(s) URL, non-blank encoded order id, host guard. No secrets; history in the user's home folder; CSP unchanged. |
| P-17 | Simplicity and dependencies | PASS | No new dependency. |
| P-18 | Modules build standalone | PASS | `npm run typecheck`, `npm test` (evidence logs 1 and 2) and `npm run build`. |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/02`, `03` (API Explorer section), `04` (services and IPC), `05` (`omsCoreUrl`, history file). |

## Independent Review

**spec-reviewer: MET.** It re-ran the 12 SPEC-0007 test files (67/67) and confirmed every AC
proven. Its findings and how each was resolved (T-15, ticket reopened at implement):

1. *Major*: the `OrderCreateCmd` template fails with "SessionId is required" (contract/server
   mismatch) and no follow-up was tracked. **Recorded** in Goal Assessment and as Follow-up 1. It
   is outside this ticket: no contract or oms-core change was in scope.
2. `null` for a required or typed property was not reported. **Fixed**: `null` is checked like any
   value, giving "expected string, got null"; tested, including nested.
3. After paging, editing the query showed `page=N` while Search sends page 0. **Fixed**: any query
   change resets the page; tested that the shown URL equals the sent one after paging and editing.
4. Refused sends were shown as "unreachable", and a failing history write could reject the IPC
   call. **Fixed**: `refused` marker (shown as *refused*); history writes are caught and logged;
   both tested.
5. A blank `followUp` id would return an arbitrary order. **Fixed**: refused in main without a
   request; tested.
6. "Order … not found" was shown when the order query had failed. **Fixed**: `orderError`
   separates the two cases; tested.
7. The T-12 deviation and the seeded history entry. **Recorded** above. The seeded entry (status
   *unreachable*, 12:22:50) is still in the user's `~/.developer-cockpit/api-explorer-history.json`;
   **Clear history** removes it.
8. verification.md was still the template. **Written** (this file).

The fixes were small and local, all behind new tests. `spec verify` was re-run after them; a second
review round was not run.

## Automated Evidence

`spec verify SPEC-0007` at 2026-10-27T11:32Z: result **pass**, modules `developer-cockpit`.

| Command | Exit | Log |
|---|---|---|
| policy check (changes since main) | PASS (0 errors; 6 R10 warnings from unrelated branch work) | — |
| `npm run typecheck` | 0 (7 s) | `evidence/developer-cockpit-1.log` |
| `npm test` | 0 (32 s; 191 tests + 1 perf test) | `evidence/developer-cockpit-2.log` |

## Follow-ups

1. **`sessionId` contract/server mismatch.** oms-core requires `order.sessionId` for
   `OrderCreateCmd`, but `oms-cmd-api.yml` does not list it as required. Either mark it required
   in the contract (a breaking change for clients) or default it in oms-core. A spec ticket for
   oms-contracts/oms-core is suggested.
2. **Contract the order-events endpoint.** `/api/order-events/orderId/{orderId}` is `@Hidden` and
   not in `oms-query-api.yml`; it should be added as a query operation. Agreed in the proposal.
3. **Add `servers` (or the base paths) to the OpenAPI contracts,** so `/api/command` and
   `/api/query` are no longer fixed in the cockpit.
4. **Make the cockpit's WebSocket port configurable.** A second instance (tests, runtime checks)
   fails on port 9321 while the user's cockpit is open. Also listed in SPEC-0006.
5. **Optional: a generated form view** on the same schema code, and "Open in API Explorer" links
   from the Contracts view and the storyboard link chips (out of scope in the proposal).

## Verdict

Verdict: GOAL MET
