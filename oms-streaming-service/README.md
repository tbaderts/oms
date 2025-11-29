# OMS Streaming Service

Real-time streaming service for the OMS Trade Blotter UI. Consumes order and execution events from Kafka using Avro serialization and streams them to connected clients via RSocket over WebSocket.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  OMS Core       │     │  Streaming Service   │     │ Trade Blotter   │
│  Query API      │────▶│  (Initial Snapshot)  │     │      UI         │
└─────────────────┘     │                      │────▶│  (RSocket/WS)   │
                        │  - REST Client       │     └─────────────────┘
┌─────────────────┐     │  - Avro Consumer     │
│   Kafka Topics  │────▶│  - Filter Engine     │
│  - orders       │     │  - State Cache       │
│  - executions   │     └──────────────────────┘
│  (Avro/Schema)  │
└─────────────────┘

Data Flow:
1. On client subscription, fetch initial snapshot via REST from OMS Core Query API
2. Merge snapshot with real-time Kafka stream (Avro serialized OrderMessage)
3. Stream combined data to UI via RSocket over WebSocket
```

## Features

- **Avro Serialization**: Consumes OrderMessage/Execution Avro records from Kafka via Schema Registry
- **Initial Snapshot**: Fetches complete order data from OMS Core Query API on subscription
- **Stream Merging**: Combines REST snapshot with real-time Kafka updates
- **Reactive Kafka Consumer**: Non-blocking event consumption with backpressure
- **RSocket over WebSocket**: Bidirectional streaming with flow control
- **Filter Engine**: Dynamic filtering based on user-defined criteria
- **State Cache**: In-memory cache updated from both REST and Kafka
- **Mock Mode**: Development mode without Kafka dependency

## Quick Start

### Build

```powershell
.\gradlew.bat clean build
```

### Run with Kafka

```powershell
# Start Kafka, Schema Registry and OMS Core (from oms-core)
cd ..\oms-core
docker compose up broker schema-registry -d
.\gradlew.bat bootRun

# Run streaming service
cd ..\oms-streaming-service
.\gradlew.bat bootRun
```

### Run in Mock Mode (No Kafka)

```powershell
.\gradlew.bat bootRun --args='--streaming.kafka.enabled=false'
```

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | 8092 | HTTP server port |
| `spring.rsocket.server.port` | 7000 | RSocket server port |
| `spring.rsocket.server.transport` | websocket | RSocket transport |
| `spring.kafka.bootstrap-servers` | localhost:9092 | Kafka brokers |
| `spring.kafka.properties.schema.registry.url` | http://localhost:8081 | Schema Registry URL |
| `streaming.kafka.topics.orders` | orders | Orders topic (Avro) |
| `streaming.kafka.topics.executions` | executions | Executions topic (Avro) |
| `streaming.kafka.enabled` | true | Enable/disable Kafka |
| `streaming.oms.base-url` | http://localhost:8090 | OMS Core base URL |

## Endpoints

### REST (HTTP)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/trade-blotter/metadata` | GET | All object metadata |
| `/trade-blotter/metadata/orders` | GET | Order field metadata |
| `/trade-blotter/metadata/executions` | GET | Execution field metadata |
| `/trade-blotter/status` | GET | Service status |

### RSocket

| Route | Pattern | Description |
|-------|---------|-------------|
| `orders.stream` | Request-Stream | Stream order events |
| `executions.stream` | Request-Stream | Stream execution events |
| `blotter.stream` | Request-Stream | Combined stream by type |
| `orders.snapshot` | Request-Response | Current order snapshot |
| `executions.snapshot` | Request-Response | Current execution snapshot |
| `health` | Request-Response | Health check |

## Filtering

Clients can apply filters when subscribing to streams:

```json
{
  "logicalOperator": "AND",
  "filters": [
    {
      "fieldName": "state",
      "operator": "EQUALS",
      "value": "LIVE"
    },
    {
      "fieldName": "orderQty",
      "operator": "GREATER_THAN",
      "value": "1000"
    }
  ]
}
```

### Supported Operators

- `EQUALS`, `NOT_EQUALS`
- `GREATER_THAN`, `GREATER_THAN_OR_EQUALS`
- `LESS_THAN`, `LESS_THAN_OR_EQUALS`
- `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`
- `IN` (comma-separated values)
- `BETWEEN` (comma-separated min,max)

## Client Connection Example (JavaScript)

```javascript
import { RSocketClient } from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';

const client = new RSocketClient({
  transport: new RSocketWebSocketClient({
    url: 'ws://localhost:7000/trade-blotter/stream'
  })
});

client.connect().subscribe({
  onComplete: rsocket => {
    // Stream orders
    rsocket.requestStream({
      data: { logicalOperator: 'AND', filters: [] },
      metadata: Buffer.from('orders.stream')
    }).subscribe({
      onNext: event => console.log('Order event:', event),
      onError: error => console.error('Error:', error)
    });
  }
});
```

## Development

### Project Structure

```
oms-streaming-service/
├── src/main/java/org/example/streaming/
│   ├── StreamingServiceApplication.java
│   ├── config/
│   │   ├── KafkaConfig.java
│   │   └── RSocketConfig.java
│   ├── controller/
│   │   ├── TradeBlotterController.java
│   │   └── MetadataController.java
│   ├── model/
│   │   ├── OrderDto.java
│   │   ├── ExecutionDto.java
│   │   ├── OrderEvent.java
│   │   ├── ExecutionEvent.java
│   │   ├── StreamFilter.java
│   │   ├── FilterCondition.java
│   │   └── StreamRequest.java
│   └── service/
│       ├── OrderEventService.java
│       ├── ExecutionEventService.java
│       ├── FilterService.java
│       ├── MetadataService.java
│       └── MockEventService.java
└── src/main/resources/
    └── application.yml
```

### Testing

```powershell
.\gradlew.bat test
```

## Integration with OMS Core

The streaming service consumes events published by OMS Core to Kafka topics:

1. **Order Events**: Published when orders are created, updated, or cancelled
2. **Execution Events**: Published when executions are reported

Ensure Kafka topics are created before starting the service:

```bash
kafka-topics --create --topic order-events --bootstrap-server localhost:9092
kafka-topics --create --topic execution-events --bootstrap-server localhost:9092
```
