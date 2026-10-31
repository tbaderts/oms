# Runtime check — SPEC-0036

## Before (2026-10-31, running dev cockpit, PID 46488, `npm run dev`)

- Listener `[::]:9321` (dual-stack). `ws` probes to `ws://127.0.0.1:9321`, `ws://[::1]:9321` and `ws://localhost:9321` all received `connection:status`.
- Port 9321 held 42–43 sockets in TIME_WAIT and 1 established, steady over 15 s: one new connection per 3 s reconnect interval (120 s TIME_WAIT ÷ 3 s ≈ 40).

## After: `npm run test:e2e -- connection` (AC-6), built app, random COCKPIT_WS_PORT

```
Running 1 test using 1 worker
  ok 1 e2e\connection.spec.ts:5:5 › status bar shows Connected and stays connected (9.2s)
  1 passed (10.3s)
```
