# OMS UI Microservice

A Spring Boot 4 microservice that serves the **OMS Admin Tool** — a React 19 + TypeScript single-page application (SPA) providing real-time blotters for Orders and Executions.

## Overview

The OMS Admin UI is a metamodel-driven blotter application:

- **Columns, filters, and types are generated from backend metadata** (`oms-core` metamodel API) rather than hardcoded in the frontend.
- **Dual data modes**: a REST mode (server-side pagination/sort/filter via the oms-core query API) and a **streaming mode** (default) that subscribes to RSocket streams from `oms-streaming-service` for real-time updates.
- The Spring Boot backend is a **thin shell**: it serves the built SPA, exposes a runtime configuration endpoint (`/api/config`), and forwards SPA routes to `index.html`. It never proxies business data — the browser talks directly to `oms-core` (REST) and `oms-streaming-service` (RSocket WebSocket).

## Technology Stack

### Backend
- **Java 25** (toolchain), **Spring Boot 4.1**, Spring MVC, Actuator
- **Gradle** with the node-gradle plugin (provisions Node 22.20 + npm 10.9)

### Frontend
- **React 19** + **TypeScript** (strict mode)
- **AG Grid Community 36** (data grid, shared theme)
- **Axios** (REST client with OAuth bearer-token injection)
- **rsocket-core / rsocket-websocket-client** (real-time streaming)
- **SCSS** component styles, react-app-rewired CRA build

## Project Structure

```
oms-ui/
├── build.gradle                    # Gradle build (Java + orchestrated npm build)
├── Dockerfile                      # Container image (matches oms-core pattern)
├── src/main/java/org/example/omsui/
│   ├── OmsUiApplication.java       # Main Spring Boot application
│   ├── config/WebConfig.java       # SPA route forwarding → index.html
│   └── controller/
│       ├── ConfigController.java   # GET /api/config (URLs + feature flags)
│       └── HealthController.java   # Health check API
├── src/main/resources/application.yml
└── frontend/                       # React SPA
    ├── config-overrides.js         # Webpack overrides (Buffer polyfill for rsocket)
    └── src/
        ├── App.tsx                 # Shell: header, tabs, REST/Streaming mode toggle
        ├── components/             # Blotter, StreamingBlotter, FilterBuilder,
        │                           #   ColumnSelector, DetailModal/Panel,
        │                           #   AuthorizeModal, ErrorBoundary, …
        ├── services/               # ApiClient, OMSApiService, RSocketStreamingService,
        │                           #   Metamodel* services, ConfigService,
        │                           #   AuthTokenService, BlotterStateService, …
        ├── types/                  # Domain, metamodel, and streaming types
        └── theme/agGridTheme.ts    # Shared AG Grid theme
```

## Build Process

The Gradle build orchestrates both the Java and JavaScript builds:

1. **npmInstall** — installs Node dependencies (`--legacy-peer-deps`)
2. **buildReact** — production build of the React app
3. **copyReactBuild** — copies `frontend/build` into Spring Boot static resources
4. **processResources / bootJar** — packages everything into an executable JAR

### Gradle Tasks

- `./gradlew build` — builds the entire application (React + Spring Boot)
- `./gradlew bootRun` — runs the application locally
- `./gradlew test` — runs all tests
- `./gradlew npmInstall` / `npmBuild` — frontend-only tasks

### Frontend Tests

```powershell
cd oms-ui/frontend
npm test            # Jest + React Testing Library (watch mode)
npm test -- --watchAll=false --ci   # single run
```

## Configuration

Runtime configuration is served to the SPA by `GET /api/config` and driven by these properties (all overridable via environment variables):

| Property | Env var | Default |
|---|---|---|
| `oms.ui.app-name` | — | `OMS Admin Tool` |
| `oms.api.base-url` | `OMS_API_BASE_URL` | `http://localhost:8090` |
| `oms.streaming.url` | `OMS_STREAMING_URL` | `ws://localhost:7000/trade-blotter/stream` |
| `oms.ui.features.quotes-enabled` | `OMS_UI_QUOTES_ENABLED` | `false` |
| `oms.ui.features.quote-requests-enabled` | `OMS_UI_QUOTE_REQUESTS_ENABLED` | `false` |
| `oms.ui.features.streaming-enabled` | `OMS_UI_STREAMING_ENABLED` | `true` |

Feature flags control tab visibility and the REST/Streaming mode toggle without rebuilding the frontend.

## Running

### Development (hot reload)

```powershell
# Terminal 1 — React dev server (proxies /api to oms-core)
cd oms-ui/frontend
npm start

# Terminal 2 — Spring Boot shell
cd oms-ui
.\gradlew.bat bootRun
```

### Production build

```powershell
cd oms-ui
.\gradlew.bat clean build
java -jar build/libs/oms-ui-0.0.1-SNAPSHOT.jar
```

### Docker Compose

`oms-ui` is part of the root `docker-compose.yml` stack:

```powershell
docker compose up -d --build oms-ui   # http://localhost:8080
```

## Integration Points

- **oms-core** (REST, `:8090`): `/api/query/search` (orders), `/api/executions`, `/api/v1/metamodel/{entity}` (column/filter metadata)
- **oms-streaming-service** (RSocket WebSocket, `:7000`): routes `orders.stream`, `executions.stream`, `blotter.stream` with server-side stream filters
- OAuth bearer token is entered via the **Authorize** dialog and kept in `sessionStorage`; blotter preferences (filters, visible columns) persist in `localStorage`

## Monitoring

- Application: `http://localhost:8080`
- Actuator: `http://localhost:8080/actuator`
- Prometheus metrics: `http://localhost:8080/actuator/prometheus`

See `docs/ARCHITECTURE.md` for detailed architecture diagrams.
