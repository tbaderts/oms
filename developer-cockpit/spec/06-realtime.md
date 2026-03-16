# 06 - Real-Time Update Architecture

The Developer Cockpit uses WebSocket (or Server-Sent Events as a fallback) to push real-time updates from the backend to the frontend. This eliminates polling and provides an instant, reactive experience.

---

## 1. Connection Architecture

```
Browser/Client
    |
    |  WebSocket upgrade on /ws
    v
+-------------------+
|  WebSocket Server  |
|                    |
|  Connection Pool   |  <-- one connection per client
|                    |
|  Event Bus ------->|  broadcasts events to all clients
|                    |
+-------------------+
    ^
    |  Services publish events to the bus
    |
+-------------------+
| WatcherService    | --> file change events
| SessionManager    | --> session output events
| InvestigatorSvc   | --> investigation progress events
| AIService         | --> AI stream events
| ConfigService     | --> config reload events
| ContainerService  | --> container status events
+-------------------+
```

### Connection Lifecycle
1. Client opens WebSocket at `ws://host:port/ws`
2. Server adds connection to pool
3. Client can optionally subscribe to specific event types (filter)
4. Server pushes events as they occur
5. Client reconnects automatically on disconnect (exponential backoff)

---

## 2. Message Protocol

All WebSocket messages are JSON:

### Server -> Client (Event)

```json
{
  "type": "event",
  "event": "specs:changed",
  "timestamp": "2026-03-15T14:30:00Z",
  "data": {
    "module": "backend",
    "ticketId": "PROJ-123",
    "changeType": "modified"
  }
}
```

### Server -> Client (Stream Chunk)

```json
{
  "type": "stream",
  "streamId": "uuid-of-stream",
  "event": "ai:stream",
  "data": {
    "chunk": "The order was placed at 10:42 and..."
  }
}
```

### Server -> Client (Stream End)

```json
{
  "type": "stream_end",
  "streamId": "uuid-of-stream",
  "event": "ai:stream"
}
```

### Client -> Server (Subscribe)

```json
{
  "type": "subscribe",
  "events": ["specs:changed", "sessions:output"]
}
```

### Client -> Server (Unsubscribe)

```json
{
  "type": "unsubscribe",
  "events": ["sessions:output"]
}
```

### Client -> Server (Session Input)

```json
{
  "type": "input",
  "sessionId": "session-uuid",
  "data": "yes\n"
}
```

---

## 3. Event Catalogue

### Filesystem Events

| Event | Trigger | Data |
|-------|---------|------|
| `specs:changed` | File change in `*/specs/**` | `{ module, ticketId?, changeType }` |
| `kb:changed` | File change in KB root | `{ path, changeType }` |
| `roadmap:changed` | Roadmap file changed | `{ changeType }` |
| `reviews:changed` | Review report added/modified | `{ module?, path, changeType }` |

`changeType`: `"added"`, `"modified"`, `"removed"`

### AI & Session Events

| Event | Trigger | Data |
|-------|---------|------|
| `ai:stream` | AI model produces a token | `{ streamId, chunk }` |
| `ai:stream:end` | AI stream completes | `{ streamId, totalTokens? }` |
| `sessions:output` | CLI session produces output | `{ sessionId, data }` (raw terminal bytes) |
| `sessions:status` | Session status change | `{ sessionId, status }` |
| `investigation:progress` | Investigator step completes | `{ investigationId, step }` (see below) |

### Investigation Progress Events

The investigator emits detailed progress events for each step:

```json
{
  "investigationId": "uuid",
  "step": {
    "type": "tool_call",
    "tool": "query_database",
    "input": { "sql": "SELECT..." },
    "status": "running"
  }
}
```

```json
{
  "investigationId": "uuid",
  "step": {
    "type": "tool_result",
    "tool": "query_database",
    "output": "5 rows returned",
    "status": "complete"
  }
}
```

```json
{
  "investigationId": "uuid",
  "step": {
    "type": "reasoning",
    "content": "The order appears to be stuck because...",
    "status": "complete"
  }
}
```

```json
{
  "investigationId": "uuid",
  "step": {
    "type": "conclusion",
    "content": "Root cause: ...\nRecommendation: ...",
    "status": "complete"
  }
}
```

### System Events

| Event | Trigger | Data |
|-------|---------|------|
| `config:reloaded` | Configuration reloaded | `{ changedKeys }` |
| `connection:status` | Infrastructure connection change | `{ service, connected, error? }` |

---

## 4. Frontend Event Handling

### Event Bus (Client-Side)

The frontend maintains a client-side event bus that dispatches WebSocket events to registered listeners:

```typescript
// Pseudocode
class CockpitEventBus {
  private ws: WebSocket;
  private listeners: Map<string, Set<(data: any) => void>>;

  connect(url: string): void;       // Open WebSocket, set up reconnect
  on(event: string, handler): void;  // Register listener
  off(event: string, handler): void; // Remove listener
  subscribe(events: string[]): void; // Tell server which events we want
}
```

### View Integration Pattern

Each view subscribes to relevant events on mount and unsubscribes on unmount:

```typescript
// Pseudocode for Dashboard view
function DashboardView() {
  useEffect(() => {
    const handler = () => refreshSpecs();
    eventBus.on("specs:changed", handler);
    return () => eventBus.off("specs:changed", handler);
  }, []);
}
```

---

## 5. Reconnection Strategy

| Attempt | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| 5+ | 15 seconds (cap) |

On reconnect, the client re-sends its subscription list. The UI shows a subtle "Reconnecting..." indicator in the status bar during disconnection.

---

## 6. SSE Fallback (Optional)

If WebSocket is not available (e.g., behind certain proxies), fall back to Server-Sent Events:

- `GET /api/v1/events` returns an SSE stream
- Each event is formatted as standard SSE:
  ```
  event: specs:changed
  data: {"module":"backend","ticketId":"PROJ-123"}

  ```
- Client-to-server communication falls back to regular REST POST calls
- Session input is sent via `POST /api/v1/sessions/:id/input`

---

## 7. Rate Limiting & Debouncing

| Scenario | Strategy |
|----------|----------|
| Rapid file saves | Debounce file watcher events by 200ms |
| AI streaming | No debounce (every chunk matters) |
| Container stats | Poll every 5 seconds, push via event |
| Git status | Refresh on file change events, debounce 1 second |
| Bulk file operations | Coalesce multiple changes into single event per 300ms window |
