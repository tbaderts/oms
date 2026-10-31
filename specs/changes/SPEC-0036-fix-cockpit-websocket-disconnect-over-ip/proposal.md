# Proposal — SPEC-0036: Fix cockpit WebSocket disconnect over IPv4

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The developer-cockpit status bar shows **Disconnected**, so live events (file watcher, ticket and
storyboard changes) are unreliable and the developer cannot trust the indicator. SPEC-0013's
runtime check recorded this and blamed address families: `ws://localhost:9321` resolves to IPv4
while the server listens only on IPv6.

Measured on 2026-10-31 against the running cockpit (dev mode, `npm run dev`), that diagnosis does
not hold:

- The server (`src/main/websocket/server.ts`, `new WSServer({ port })`) listens on `[::]:9321`,
  which is dual-stack on Windows. Probes with the `ws` client to `ws://127.0.0.1:9321`,
  `ws://[::1]:9321` and `ws://localhost:9321` all connected and received `connection:status`.
- Port 9321 constantly held about 42 sockets in `TIME_WAIT`, with one established connection. That
  is one new connection every 3 s (the event bus reconnect delay) over Windows' 120 s `TIME_WAIT`:
  the renderer is in a reconnect loop.

The loop comes from `src/renderer/lib/event-bus.ts`. `App.tsx` calls `eventBus.connect()` from an
effect, and under `<React.StrictMode>` (`src/renderer/main.tsx`) the dev build runs that effect
twice, so `connect` runs twice. The second `doConnect` closes the first socket, but that socket's
`onclose` handler is still attached. It emits `connected: false` and schedules a reconnect, which
closes the now-current socket, whose `onclose` does the same. Every 3 s the bus replaces its socket,
and a stale close can land after the new socket's open, so the status bar ends on Disconnected.
Any second `connect` call starts the same loop.

Two related weaknesses:
- The address family stays implicit: the client uses `localhost`, and the server binds every
  interface, which also exposes the event stream to the local network.
- The page CSP allows only `ws://localhost:9321`. The end-to-end runs use a random
  `COCKPIT_WS_PORT`, so they can never connect and cannot test the indicator.

If nothing is done, the indicator stays wrong, events can be lost during the churn, and the
WebSocket server stays reachable from other machines.

## What Changes

- The renderer event bus ignores events from a socket it has replaced. Calling `connect` twice, or
  reconnecting, leaves one open socket and the status **Connected**, without a reconnect loop. It
  still reports Disconnected and retries every 3 s when the current socket really closes.
- The main process binds the WebSocket server to the IPv4 loopback address `127.0.0.1` only, and
  `events:getWebSocketUrl` returns `ws://127.0.0.1:<port>`. Server and client agree on one address,
  with no name resolution, and the server is no longer reachable from the network.
- The renderer CSP allows `ws://127.0.0.1:*` (loopback, any port) instead of
  `ws://localhost:9321`, so a cockpit started with `COCKPIT_WS_PORT` (end-to-end runs) can connect.
- An end-to-end test asserts that the status bar shows Connected.

No BREAKING changes: the WebSocket is internal to the cockpit (main ↔ its own renderer); no other
module connects to it.

## Scope

### In scope

- `event-bus.ts` reconnect and stale-socket handling, with unit tests.
- The server bind address, the URL handed to the renderer, the CSP `connect-src` entry, and their
  tests.
- An end-to-end assertion that the status bar reaches and keeps Connected.
- The cockpit spec page that describes the WebSocket.

### Out of scope

- Removing `<React.StrictMode>`. It is useful in development, and the bus must cope with repeated
  `connect` calls anyway.
- Changing the reconnect delay, adding backoff, or adding a heartbeat or ping.
- Authentication on the WebSocket, or anything the WebSocket carries (event types and payloads).
- The other SPEC-0013 runtime findings (Mermaid layout, the KB tree listing files as folders).

## Acceptance Criteria

- **AC-1** — Given the renderer event bus and a WebSocket stand-in, when `connect(url)` is called
  twice in a row (as StrictMode does) and both sockets settle (the first is closed, the second
  opens), then `eventBus.connected` is `true`, the last `connection:status` event emitted has
  `connected: true`, and over the following 10 s (fake timers) no further socket is created.
- **AC-2** — Given an open connection, when the current socket closes (server stopped), then a
  `connection:status` event with `connected: false` is emitted and a new socket is created after
  3 s; when that socket opens, `connected: true` is emitted again.
- **AC-3** — Given an open connection, when `disconnect()` is called, then the socket is closed, no
  reconnect happens within the following 10 s, and the stale socket's close emits nothing.
- **AC-4** — Given the main-process `WebSocketServer` started on a free port, when its bound
  address is read, then it is `127.0.0.1`, and a `ws` client connecting to `ws://127.0.0.1:<port>`
  receives the `connection:status` greeting; `events:getWebSocketUrl` returns
  `ws://127.0.0.1:<port>`.
- **AC-5** — Given the renderer `index.html`, when its Content-Security-Policy is parsed, then
  `connect-src` contains `ws://127.0.0.1:*` and contains no `ws://localhost` or wildcard-host
  WebSocket source.
- **AC-6** — Given the built cockpit launched by the end-to-end fixture (random `COCKPIT_WS_PORT`),
  when the window has loaded, then the status bar shows "Connected" within 10 s, and still shows
  "Connected" 7 s later, after at least two reconnect intervals.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none. The cockpit's internal WebSocket event types are unchanged |
| Consumers (oms-ui, oms-mcp-server, downstream) | none. Only the cockpit's own renderer connects |
| Knowledge base | none in `oms-knowledge-base/`. In the cockpit's spec (`developer-cockpit/spec/04-backend-services.md`), the WebSocket section is updated with the bind address, URL and CSP |

## Open Questions

- [resolved] The ticket says the server listens only on IPv6. Should the fix follow that
  diagnosis? → assumption: no. Measurements show a dual-stack listener that accepts IPv4, IPv6 and
  `localhost` (see Why). The real cause is the reconnect loop. The goal, "the cockpit must connect
  and show Connected", is unchanged. Pinning both sides to `127.0.0.1` (What Changes) still settles
  the address-family question the ticket raised. **Reviewer: please confirm that this re-diagnosis
  matches what you see.**
- [resolved] Bind to `127.0.0.1` or to `::1`? → assumption: `127.0.0.1`. IPv4 loopback exists on
  every supported OS even when IPv6 is disabled, and it matches the ticket's title. Cheap to
  change.
- [resolved] Allow any loopback port in the CSP, or only 9321? → assumption: any port on
  `127.0.0.1`. Only loopback is reachable, and the end-to-end runs need a non-default port. The CSP
  still blocks every other host.
