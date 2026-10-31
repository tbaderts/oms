# Verification — SPEC-0036: Fix cockpit WebSocket disconnect over IPv4

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The unit tests below passed in the last `spec verify` run (evidence/developer-cockpit-2.log: 82
files, 492 passed, 2 skipped). Each was seen failing first: AC-1 and AC-3 on the old event bus; for
AC-4, `address()` was missing and the URL was `ws://localhost:…`; AC-5 on the old CSP.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Double `connect` settles on one open socket, Connected, no further socket within 10 s | `test/renderer/event-bus.test.ts` › "double connect settles on one open socket": socket 2 opens before socket 1's late close; `connected === true`, last status `true`, 2 sockets after 10 s, socket 2 not closed (evidence/developer-cockpit-2.log) | PASS |
| AC-2 | A real close → Disconnected, new socket at 3 s, Connected again | `event-bus.test.ts` › "a real close reports Disconnected and reconnects after 3 s" (no socket at 2.9 s, one at 3.0 s) | PASS |
| AC-3 | `disconnect()` closes, the stale close emits nothing, no reconnect within 10 s | `event-bus.test.ts` › "disconnect closes without events or reconnect" | PASS |
| AC-4 | Server bound to `127.0.0.1`, greets a client there, URL `ws://127.0.0.1:<port>` | `test/main/websocket-server.test.ts` › "binds IPv4 loopback only" (`address()` is `127.0.0.1`, `[::1]` refused), "greets a client on 127.0.0.1", "getWebSocketUrl returns the loopback URL"; `websocket-no-actions.test.ts` still green on `127.0.0.1` | PASS |
| AC-5 | CSP `connect-src` = `'self' ws://127.0.0.1:*`, with no localhost or wildcard host | `test/renderer/csp.test.ts` › "connect-src allows only self and IPv4 loopback WebSockets"; `MermaidDiagram.security.test.tsx` › "keeps the CSP unchanged" (constant updated to the new CSP) | PASS |
| AC-6 | Built app shows Connected within 10 s and still 7 s later | `e2e/connection.spec.ts` › "status bar shows Connected and stays connected". It ran with `npm run test:e2e -- connection`: 1 passed (runtime-check.md). The independent reviewer re-ran it: 1 passed (9.0 s). `spec verify` does not run e2e | PASS |

## Goal Assessment

Goal: "the cockpit must connect and show Connected". The ticket blamed an IPv6-only listener. The
approved proposal measured a dual-stack listener and traced the Disconnected status to a reconnect
loop in the renderer event bus, triggered by StrictMode's double `connect` (runtime-check.md →
Before).

The change does two things:
- It fixes the loop: replaced or deliberately closed sockets are released with their handlers
  detached (AC-1 to AC-3).
- It pins server and client to `127.0.0.1`, which settles the address-family question the ticket
  raised (AC-4, AC-5). As a side effect, the event server is no longer reachable from the network.

The built app connects and stays Connected (AC-6).

Remaining gap, stated honestly: the loop was observed in the **dev** cockpit (`npm run dev`). The
end-to-end run uses the production build, which has no StrictMode double effect. So in a running
dev cockpit, the loop fix is proven by the unit test (AC-1) and not yet by observation.

I did not restart the requester's running dev cockpit to measure it. Its renderer has already
hot-reloaded the new CSP while its main process still serves the old URL, so it now shows
Disconnected until restarted. After a restart of `npm run dev`, the status bar should show Connected
and port 9321 should no longer collect `TIME_WAIT` sockets. This is a manual confirmation listed
under Follow-ups. It is not a gap in the fix.

## Policy Review

Reviewed against SPEC-0036's files in the working tree (merge-base `ad7c3d0c`). The tree also holds
SPEC-0019 and SPEC-0035 changes, including a SPEC-0035 hunk in `spec/04-backend-services.md`. This
review does not cover them.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | no OpenAPI or Avro |
| P-02 | Specification before code, generated models only | N/A | no API or message contract; proposal and design came first |
| P-03 | Never edit generated code | PASS | nothing generated was touched |
| P-04 | Contracts evolve compatibly | N/A | internal WebSocket message format unchanged |
| P-05 | Every state change is recorded in the event log | N/A | no order state |
| P-06 | Kafka only through the transactional outbox | N/A | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | no database |
| P-08 | Concurrency and idempotency are explicit | N/A | no order updates. The bus resolves concurrent sockets by identity and detached handlers |
| P-09 | Commands and queries stay separate | N/A | the WebSocket stays push-only; `websocket-no-actions.test.ts` passes |
| P-10 | State transitions go through the state machine and task pipeline | N/A | no order state |
| P-11 | Layering and conventions | PASS | changes stay in the existing files and layers; tests follow the existing patterns (real `ws` server, CSP pinning, the e2e fixture) |
| P-12 | Jackson 3 only | N/A | TypeScript |
| P-13 | Errors and validation follow the framework specs | N/A | no API errors; retry behaviour on a real close is unchanged |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | every AC has an automated test, seen failing first where the behaviour was new |
| P-15 | Observability | PASS | the server log line names its host and port |
| P-16 | Security | PASS | the server binds loopback only, no longer all interfaces. The CSP narrows the host to `127.0.0.1` but widens the port to `*`; the design accepted this, and the reviewer's note is under Follow-ups |
| P-17 | Simplicity and dependencies | PASS | no new dependency; one exported constant, one helper and one accessor |
| P-18 | Modules build standalone | PASS | `npm run typecheck` and `npm test` passed in developer-cockpit (`spec verify`); no other module changed |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/04-backend-services.md` (bind address, URL, CSP) and `06-realtime.md` (as-built reconnect behaviour) are updated |

## Independent Review

The spec-reviewer agent found the goal met, with every AC proven. It re-ran the e2e test itself:

1. **[major, process] verification.md was unfilled.** *Fixed:* this document.
2. **[minor] No dev-mode "after" measurement.** *Accepted as a gap and stated in Goal Assessment.*
   It needs a restart of the requester's running dev cockpit, which I did not do on their behalf.
   It is listed under Follow-ups.
3. **[minor] `ws://127.0.0.1:*` allows every loopback port.** *Kept, as the design decided:* the host
   stays loopback, `script-src 'self'` limits what can use it, and the e2e runs need a non-default
   port. Narrowing the production page to the configured port is a follow-up.
4. **[minor] Fixed 50 ms wait in `websocket-server.test.ts`.** *Fixed:* the test now waits until
   `address()` reports the bind (polling, up to 2 s). The test passed, and `spec verify` was re-run
   afterwards.
5. **[minor, existed before, out of scope] `App.tsx` can connect after its effect was cleaned up.**
   With this fix it ends on one socket, but an unmounted App can still connect. Listed under
   Follow-ups.

## Automated Evidence

`evidence/last-run.json`, the last `spec verify`, run after the final code change:
- **Result:** pass. Module: developer-cockpit.
- **Policy check:** PASS (changes since main, merge-base `ad7c3d0c`).
- **`npm run typecheck`:** exit 0 (evidence/developer-cockpit-1.log).
- **`npm test`:** exit 0, 82 files, 492 passed, 2 skipped (evidence/developer-cockpit-2.log).

End-to-end (outside `spec verify`): `npm run test:e2e -- connection`, 1 passed (runtime-check.md),
reproduced by the reviewer.

## Follow-ups

- After restarting `npm run dev`, confirm in the dev cockpit that the status bar shows Connected and
  that port 9321 does not accumulate `TIME_WAIT` sockets over about 15 s.
- Optionally narrow the production CSP to the configured port, keeping the wildcard only for e2e
  runs.
- `App.tsx`: ignore a `getWebSocketUrl()` result that arrives after the effect's cleanup (a
  cancelled flag), so an unmounted App does not connect.
- `spec/06-realtime.md` still describes exponential backoff in its generic lifecycle list. Align it
  when the realtime spec is next revised.

## Verdict

Verdict: GOAL MET
