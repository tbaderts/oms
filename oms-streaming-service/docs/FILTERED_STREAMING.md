# Filtered Order Streaming

This document describes the filtered streaming implementation for the OMS Trade Blotter UI.

## Overview

The streaming service supports **filtered order subscriptions** where:
1. UI opens an RSocket subscription with optional filters matching the Query API format
2. Streaming service fetches a filtered snapshot from OMS Core REST API
3. The same filter is applied to the real-time Kafka stream
4. Events are deduplicated using `eventId` when merging snapshot with live stream

## RSocket Endpoints

| Route | Pattern | Description |
|-------|---------|-------------|
| `orders.stream` | Request-Stream | Stream order events with optional filter |
| `executions.stream` | Request-Stream | Stream execution events with optional filter |
| `blotter.stream` | Request-Stream | Unified stream based on StreamRequest (ORDERS, EXECUTIONS, or ALL) |
| `orders.snapshot` | Request-Response | Get current order snapshot |
| `executions.snapshot` | Request-Response | Get current execution snapshot |
| `health` | Request-Response | Health check (returns "OK") |

## Filter Format

Filters use the same format as the OMS Query API:

```json
{
  "logicalOperator": "AND",
  "filters": [
    {"field": "symbol", "operator": "EQ", "value": "INTC"},
    {"field": "side", "operator": "EQ", "value": "BUY"},
    {"field": "price", "operator": "BETWEEN", "value": "30", "value2": "50"}
  ],
  "includeSnapshot": true
}
```

### Supported Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `EQ` | Equality (case-insensitive) | `{"field": "symbol", "operator": "EQ", "value": "AAPL"}` |
| `LIKE` | Substring match (case-insensitive) | `{"field": "symbol", "operator": "LIKE", "value": "INT"}` |
| `GT` | Greater than | `{"field": "price", "operator": "GT", "value": "100"}` |
| `GTE` | Greater than or equal | `{"field": "orderQty", "operator": "GTE", "value": "1000"}` |
| `LT` | Less than | `{"field": "price", "operator": "LT", "value": "50"}` |
| `LTE` | Less than or equal | `{"field": "leavesQty", "operator": "LTE", "value": "100"}` |
| `BETWEEN` | Inclusive range | `{"field": "price", "operator": "BETWEEN", "value": "30", "value2": "50"}` |

### Filterable Fields

**String fields:** `orderId`, `parentOrderId`, `rootOrderId`, `clOrdId`, `account`, `symbol`, `securityId`, `securityType`, `exDestination`, `text`, `timeInForce`

**Enum fields:** `side` (BUY, SELL), `ordType` (MARKET, LIMIT, STOP), `state` (NEW, LIVE, FILLED, etc.), `cancelState`

**Numeric fields:** `price`, `stopPx`, `orderQty`, `cumQty`, `leavesQty`, `avgPx`, `cashOrderQty`

**DateTime fields:** `sendingTime`, `transactTime`, `expireTime`, `eventTime`

### Logical Operators

- `AND` (default): All conditions must match
- `OR`: At least one condition must match

## StreamRequest Format

For the `blotter.stream` endpoint, use a `StreamRequest` object:

```json
{
  "blotterId": "blotter-1",
  "streamType": "ORDERS",
  "filter": {
    "logicalOperator": "AND",
    "filters": [
      {"field": "symbol", "operator": "EQ", "value": "INTC"}
    ],
    "includeSnapshot": true
  }
}
```

### Stream Types

| Type | Description |
|------|-------------|
| `ORDERS` | Order events only |
| `EXECUTIONS` | Execution events only |
| `ALL` | Both orders and executions merged |

## Data Flow

```
┌──────────────┐                    ┌─────────────────────────────────┐
│   Trade UI   │──RSocket──────────▶│  TradeBlotterController         │
│  (React)     │  orders.stream     │  @MessageMapping("orders.stream")│
│              │  executions.stream │  @MessageMapping("executions.stream")
│              │  blotter.stream    │  @MessageMapping("blotter.stream")│
└──────────────┘                    └─────────────────────────────────┘
                                                  │
                                                  ▼
                                    ┌─────────────────────────────────┐
                                    │  KafkaEventStreamProvider       │
                                    │  (or MockEventStreamProvider)   │
                                    │  getOrderEventStream(filter)    │
                                    │  getExecutionEventStream(bool)  │
                                    └─────────────────────────────────┘
                                          │              │
                      ┌───────────────────┘              └────────────────┐
                      ▼                                                   ▼
        ┌─────────────────────────┐                     ┌─────────────────────────┐
        │  REST API Snapshot      │                     │  Kafka Live Stream      │
        │  (OmsQueryClient)       │                     │  (filtered)             │
        │  GET /api/query/search  │                     │  orders topic           │
        │  with filter params     │                     │  executions topic       │
        └─────────────────────────┘                     └─────────────────────────┘
                      │                                                   │
                      └─────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │  Deduplicated Stream  │
                        │  (by eventId)         │
                        └───────────────────────┘
```

## Deduplication Strategy

When `includeSnapshot: true`:
1. Snapshot orders are fetched from REST API with `id` (database ID) mapped to `eventId`
2. All `eventId`s from snapshot are tracked in a Set
3. Live Kafka events with `eventId` already in the snapshot are skipped
4. This prevents duplicate events during the snapshot-to-live transition

## Testing with RSC Client

### Prerequisites

Install the RSocket CLI client:
```bash
# Using Homebrew (macOS)
brew install rsocket-routing-client

# Or download from releases
# https://github.com/making/rsc/releases
```

### Start the Services

```powershell
# Terminal 1: Start OMS Core (with dependencies)
cd oms-core
docker compose up postgres broker schema-registry -d
.\gradlew.bat bootRun

# Terminal 2: Start Streaming Service
cd oms-streaming-service
.\gradlew.bat bootRun
```

### Test Commands

#### 1. Unfiltered Stream (all orders with snapshot)

```bash
rsc --stream --route orders.stream ws://localhost:7000/rsocket
```

#### 2. Filter by Symbol (e.g., INTC orders only)

```bash
rsc --stream --route orders.stream \
  --data '{"filters":[{"field":"symbol","operator":"EQ","value":"INTC"}],"includeSnapshot":true}' \
  ws://localhost:7000/rsocket
```

#### 3. Filter by Side (BUY orders only)

```bash
rsc --stream --route orders.stream \
  --data '{"filters":[{"field":"side","operator":"EQ","value":"BUY"}],"includeSnapshot":true}' \
  ws://localhost:7000/rsocket
```

#### 4. Filter by State (LIVE orders)

```bash
rsc --stream --route orders.stream \
  --data '{"filters":[{"field":"state","operator":"EQ","value":"LIVE"}],"includeSnapshot":true}' \
  ws://localhost:7000/rsocket
```

#### 5. Price Range Filter (BETWEEN)

```bash
rsc --stream --route orders.stream \
  --data '{"filters":[{"field":"price","operator":"BETWEEN","value":"100","value2":"200"}],"includeSnapshot":true}' \
  ws://localhost:7000/rsocket
```

#### 6. Multiple Conditions (AND)

```bash
rsc --stream --route orders.stream \
  --data '{"logicalOperator":"AND","filters":[{"field":"symbol","operator":"EQ","value":"AAPL"},{"field":"side","operator":"EQ","value":"BUY"},{"field":"state","operator":"EQ","value":"LIVE"}],"includeSnapshot":true}' \
  ws://localhost:7000/rsocket
```

#### 7. Multiple Symbols (OR)

```bash
rsc --stream --route orders.stream \
  --data '{"logicalOperator":"OR","filters":[{"field":"symbol","operator":"EQ","value":"AAPL"},{"field":"symbol","operator":"EQ","value":"MSFT"}],"includeSnapshot":true}' \
  ws://localhost:7000/rsocket
```

#### 8. Large Orders Only (quantity > 1000)

```bash
rsc --stream --route orders.stream \
  --data '{"filters":[{"field":"orderQty","operator":"GT","value":"1000"}],"includeSnapshot":true}' \
  ws://localhost:7000/rsocket
```

#### 9. Live Stream Only (no snapshot)

```bash
rsc --stream --route orders.stream \
  --data '{"filters":[{"field":"symbol","operator":"EQ","value":"INTC"}],"includeSnapshot":false}' \
  ws://localhost:7000/rsocket
```

#### 10. Health Check

```bash
rsc --request --route health ws://localhost:7000/rsocket
```

#### 11. Execution Stream

```bash
rsc --stream --route executions.stream ws://localhost:7000/rsocket
```

#### 12. Blotter Stream (unified orders + executions)

```bash
rsc --stream --route blotter.stream \
  --data '{"blotterId":"blotter-1","streamType":"ALL","filter":{"includeSnapshot":true}}' \
  ws://localhost:7000/rsocket
```

#### 13. Orders Only via Blotter Stream

```bash
rsc --stream --route blotter.stream \
  --data '{"blotterId":"blotter-1","streamType":"ORDERS","filter":{"filters":[{"field":"symbol","operator":"EQ","value":"INTC"}],"includeSnapshot":true}}' \
  ws://localhost:7000/rsocket
```

### PowerShell Examples

For Windows PowerShell, use **backslash escaping** for JSON quotes:

```powershell
# Change to workspace directory
cd c:\data\workspace\oms

# Filter by symbol (INTC)
java -jar .\tools\rsc-0.9.1.jar --stream --route orders.stream --dataMimeType "application/json" --data '{\"filters\":[{\"field\":\"symbol\",\"operator\":\"EQ\",\"value\":\"INTC\"}],\"includeSnapshot\":true}' ws://localhost:7000/rsocket

# Filter by side (BUY orders)
java -jar .\tools\rsc-0.9.1.jar --stream --route orders.stream --dataMimeType "application/json" --data '{\"filters\":[{\"field\":\"side\",\"operator\":\"EQ\",\"value\":\"BUY\"}],\"includeSnapshot\":true}' ws://localhost:7000/rsocket

# Filter by state (LIVE orders)
java -jar .\tools\rsc-0.9.1.jar --stream --route orders.stream --dataMimeType "application/json" --data '{\"filters\":[{\"field\":\"state\",\"operator\":\"EQ\",\"value\":\"LIVE\"}],\"includeSnapshot\":true}' ws://localhost:7000/rsocket

# Multiple filters (INTC + BUY)
java -jar .\tools\rsc-0.9.1.jar --stream --route orders.stream --dataMimeType "application/json" --data '{\"logicalOperator\":\"AND\",\"filters\":[{\"field\":\"symbol\",\"operator\":\"EQ\",\"value\":\"INTC\"},{\"field\":\"side\",\"operator\":\"EQ\",\"value\":\"BUY\"}],\"includeSnapshot\":true}' ws://localhost:7000/rsocket

# Price range (BETWEEN)
java -jar .\tools\rsc-0.9.1.jar --stream --route orders.stream --dataMimeType "application/json" --data '{\"filters\":[{\"field\":\"price\",\"operator\":\"BETWEEN\",\"value\":\"30\",\"value2\":\"50\"}],\"includeSnapshot\":true}' ws://localhost:7000/rsocket

# Unfiltered stream (all orders with snapshot)
java -jar .\tools\rsc-0.9.1.jar --stream --route orders.stream --dataMimeType "application/json" --data '{\"includeSnapshot\":true}' ws://localhost:7000/rsocket

# Live stream only (no snapshot)
java -jar .\tools\rsc-0.9.1.jar --stream --route orders.stream --dataMimeType "application/json" --data '{\"includeSnapshot\":false}' ws://localhost:7000/rsocket

# Health check
java -jar .\tools\rsc-0.9.1.jar --request --route health ws://localhost:7000/rsocket

# Execution stream
java -jar .\tools\rsc-0.9.1.jar --stream --route executions.stream --dataMimeType "application/json" --data '{\"includeSnapshot\":true}' ws://localhost:7000/rsocket

# Blotter stream (unified ORDERS + EXECUTIONS)
java -jar .\tools\rsc-0.9.1.jar --stream --route blotter.stream --dataMimeType "application/json" --data '{\"blotterId\":\"blotter-1\",\"streamType\":\"ALL\",\"filter\":{\"includeSnapshot\":true}}' ws://localhost:7000/rsocket

# Orders only via blotter stream
java -jar .\tools\rsc-0.9.1.jar --stream --route blotter.stream --dataMimeType "application/json" --data '{\"blotterId\":\"blotter-1\",\"streamType\":\"ORDERS\",\"filter\":{\"filters\":[{\"field\":\"symbol\",\"operator\":\"EQ\",\"value\":\"INTC\"}],\"includeSnapshot\":true}}' ws://localhost:7000/rsocket
```

**Important**: Always include `--dataMimeType "application/json"` for the server to parse the filter correctly.

### Expected Output

#### Order Event

Each order event in the stream will look like:

```json
{
  "eventType": "SNAPSHOT",
  "orderId": "ORD-12345",
  "eventId": 42,
  "sequenceNumber": 100,
  "timestamp": "2025-11-29T10:30:05Z",
  "order": {
    "eventId": 42,
    "orderId": "ORD-12345",
    "parentOrderId": null,
    "rootOrderId": "ORD-12345",
    "clOrdId": "CL-12345",
    "account": "ACCT-001",
    "symbol": "INTC",
    "side": "BUY",
    "ordType": "LIMIT",
    "state": "LIVE",
    "cancelState": null,
    "orderQty": 1000,
    "cumQty": 0,
    "leavesQty": 1000,
    "price": 45.50,
    "avgPx": null,
    "stopPx": null,
    "timeInForce": "DAY",
    "securityId": "US4581401001",
    "securityType": "CS",
    "exDestination": "XNAS",
    "text": null,
    "sendingTime": "2025-11-29T10:30:00Z",
    "transactTime": "2025-11-29T10:30:01Z",
    "expireTime": null,
    "sequenceNumber": 100,
    "eventTime": "2025-11-29T10:30:01Z"
  }
}
```

#### Execution Event

Each execution event in the stream will look like:

```json
{
  "eventType": "NEW",
  "execId": "EXEC-001",
  "orderId": "ORD-12345",
  "sequenceNumber": 101,
  "timestamp": "2025-11-29T10:30:10Z",
  "execution": {
    "execId": "EXEC-001",
    "orderId": "ORD-12345",
    "executionId": "EXEC-001",
    "lastQty": 500,
    "lastPx": 45.50,
    "cumQty": 500,
    "avgPx": 45.50,
    "leavesQty": 500,
    "execType": "FILL",
    "lastMkt": "XNAS",
    "lastCapacity": "A",
    "transactTime": "2025-11-29T10:30:10Z",
    "creationDate": "2025-11-29T10:30:10Z",
    "sequenceNumber": 101,
    "eventTime": "2025-11-29T10:30:10Z"
  }
}
```

#### Event Types

| Event Type | Description |
|------------|-------------|
| `SNAPSHOT` | Initial data from REST API |
| `UPDATE` | Real-time order update from Kafka |
| `CREATE` | New order created |
| `NEW` | New execution |
| `CORRECT` | Execution correction |
| `BUST` | Execution bust |
| `CACHE` | Fallback from local cache (when OMS Core unavailable) |

## Implementation Details

### Files Changed

| File | Description |
|------|-------------|
| `StreamFilter.java` | Filter model with `withSnapshot()`, `liveOnly()`, `eq()`, `and()` factory methods; `toQueryParams()` |
| `FilterCondition.java` | Condition model with `eq()`, `like()`, `between()` factory methods; operators: EQ, LIKE, GT, GTE, LT, LTE, BETWEEN |
| `StreamRequest.java` | Request model with `blotterId`, `filter`, `streamType` (ORDERS, EXECUTIONS, ALL) |
| `OrderDto.java` | Order DTO with `eventId`, `sequenceNumber`, `eventTime` for streaming |
| `OrderEvent.java` | Event wrapper with `eventType`, `eventId`, `order`, `timestamp` |
| `ExecutionDto.java` | Execution DTO with `execId`, `orderId`, `lastQty`, `lastPx`, `cumQty`, `avgPx`, etc. |
| `ExecutionEvent.java` | Event wrapper with `eventType`, `execId`, `orderId`, `execution`, `timestamp` |
| `EventStreamProvider.java` | Interface: `getOrderEventStream(filter)`, `getExecutionEventStream(includeSnapshot)` |
| `KafkaEventStreamProvider.java` | Kafka-based implementation with filtered snapshot fetch and eventId deduplication |
| `MockEventStreamProvider.java` | Mock implementation for testing without Kafka (enable with `streaming.kafka.enabled=false`) |
| `OmsQueryClient.java` | REST client: `fetchAllOrders()`, `fetchOrdersWithFilter(filter)`, `fetchOrders(symbol, side, state)` |
| `FilterService.java` | Creates predicates from StreamFilter: `createOrderEventPredicate()`, `createOrderPredicate()`, etc. |
| `TradeBlotterController.java` | RSocket controller with `orders.stream`, `executions.stream`, `blotter.stream`, snapshot endpoints |

### Query API Mapping

The filter is converted to Query API parameters (used against `/api/query/search`):

| StreamFilter | Query API Parameter |
|--------------|---------------------|
| `field: symbol, operator: EQ, value: INTC` | `symbol=INTC` |
| `field: symbol, operator: LIKE, value: INT` | `symbol__like=INT` |
| `field: price, operator: GT, value: 100` | `price__gt=100` |
| `field: price, operator: GTE, value: 100` | `price__gte=100` |
| `field: price, operator: LT, value: 50` | `price__lt=50` |
| `field: price, operator: LTE, value: 50` | `price__lte=50` |
| `field: price, operator: BETWEEN, value: 30, value2: 50` | `price__between=30,50` |

## Configuration

### Kafka Mode (default)

Enabled by default. Uses Avro/Schema Registry for Kafka messages:

```yaml
streaming:
  kafka:
    enabled: true
  oms:
    base-url: http://localhost:8080
    connect-timeout-ms: 5000
    read-timeout-ms: 30000
```

### Mock Mode (for development without Kafka)

Generates simulated order and execution events:

```yaml
streaming:
  kafka:
    enabled: false
```

## Troubleshooting

### No events received
- Verify OMS Core is running: `curl http://localhost:8080/api/query/search`
- Check Kafka is running: `docker compose ps`
- Check streaming service logs for connection errors
- Try Mock mode if Kafka isn't available: set `streaming.kafka.enabled=false`

### Filter not working
- Verify field names match OrderDto/ExecutionDto fields exactly (case-sensitive)
- Check operator is valid (EQ, LIKE, GT, GTE, LT, LTE, BETWEEN)
- For BETWEEN, ensure both `value` and `value2` are provided
- Ensure `--dataMimeType "application/json"` is set in rsc commands

### Duplicate events
- This is expected briefly during snapshot-to-live transition
- Events with same `eventId` from snapshot should be filtered from live stream
- Check logs for "Skipping duplicate event" messages

### Mock mode not generating events
- Verify `streaming.kafka.enabled=false` is set in application config
- Check logs for "Starting mock event generation (Kafka disabled)"
- Initial orders are generated on startup, then periodic updates every 2s (orders) and 5s (executions)
