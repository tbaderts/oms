# Tasks — SPEC-0036: Fix cockpit WebSocket disconnect over IPv4

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

- [x] **T-1** Write `test/renderer/event-bus.test.ts` (fake `WebSocket` via `vi.stubGlobal`, fake timers; the three cases for AC-1, AC-2 and AC-3) and see AC-1 and AC-3 fail. Then export `EventBus`, add `release()`, an identity guard in the handlers, a timer clear in `doConnect`, and the new `disconnect()` in `src/renderer/lib/event-bus.ts` (AC-1, AC-2, AC-3)
  - files: developer-cockpit/test/renderer/event-bus.test.ts, developer-cockpit/src/renderer/lib/event-bus.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/event-bus.test.ts` passes
- [x] **T-2** Write `test/main/websocket-server.test.ts` (binds IPv4 loopback only, greets a client on 127.0.0.1, refuses `[::1]`, `getWebSocketUrl` returns the loopback URL) and see it fail. Then add `WS_HOST` and `address()` to `src/main/websocket/server.ts` and bind to `WS_HOST`, build the URL from `WS_HOST` in `src/main/ipc/events.ipc.ts`, and switch `test/main/websocket-no-actions.test.ts` to `127.0.0.1` (AC-4)
  - files: developer-cockpit/test/main/websocket-server.test.ts, developer-cockpit/src/main/websocket/server.ts, developer-cockpit/src/main/ipc/events.ipc.ts, developer-cockpit/test/main/websocket-no-actions.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/websocket-server.test.ts test/main/websocket-no-actions.test.ts` passes
- [x] **T-3** Write `test/renderer/csp.test.ts` (parses `connect-src`) and see it fail. Then change `index.html` to `connect-src 'self' ws://127.0.0.1:*`, update the pinned constant in `MermaidDiagram.security.test.tsx`, and update the CSP comment in `src/main/index.ts` (AC-5)
  - files: developer-cockpit/test/renderer/csp.test.ts, developer-cockpit/src/renderer/index.html, developer-cockpit/test/renderer/MermaidDiagram.security.test.tsx, developer-cockpit/src/main/index.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/csp.test.ts test/renderer/MermaidDiagram.security.test.tsx` passes
- [x] **T-4** Add `e2e/connection.spec.ts`: the status bar shows Connected within 10 s and still shows it 7 s later. Run it against the build from before T-1 to T-3 if possible (expected to fail), then against the current build (AC-6)
  - files: developer-cockpit/e2e/connection.spec.ts
  - verify: `cd developer-cockpit && npm run test:e2e -- connection` passes (output saved for verification)
- [x] **T-5** Update the cockpit spec pages for the bind address, URL, CSP and reconnect behaviour (AC-4, AC-5)
  - files: developer-cockpit/spec/04-backend-services.md, developer-cockpit/spec/06-realtime.md
  - verify: `git grep -n "127.0.0.1" -- developer-cockpit/spec/04-backend-services.md developer-cockpit/spec/06-realtime.md` lists the new lines
- [x] **T-6** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0036` exits 0

## Notes

- T-4 tests the built app, so it runs after T-1 to T-3. Checking that it fails before the fix
  means stashing the source changes. That is optional: AC-6's failure mode, a CSP that blocks the
  random e2e port, follows directly from the old `index.html`.
