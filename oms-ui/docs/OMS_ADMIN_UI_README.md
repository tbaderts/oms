# OMS Admin UI Implementation

This document describes the comprehensive OMS Admin UI implementation based on the specification in `oms-knowledge-base/ui/oms-admin-ui_spec.mc`.

## Overview

The OMS Admin UI is a React 18.2 + TypeScript application served by Spring Boot 3.5, providing a web-based interface for viewing and managing Orders, Executions, Quotes, and Quote Requests. The UI leverages AG Grid Community Edition for advanced data grid functionality and follows a spec-driven architecture with metamodel-based column configuration.

## Architecture

### Technology Stack

**Frontend:**
- React 18.2 with TypeScript
- AG Grid Community 31.0 (data grid)
- Axios (HTTP client)
- SCSS (styling)
- Node.js 20.x (build)

**Backend:**
- Spring Boot 3.5
- Java 21
- Gradle 8.x

## Project Structure

```
oms-ui/
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── App.tsx          # Main application shell
│   │   │   ├── Blotter.tsx      # Core data grid component
│   │   │   ├── FilterBuilder.tsx
│   │   │   ├── ColumnSelector.tsx
│   │   │   ├── AuthorizeModal.tsx
│   │   │   ├── OrderBlotter.tsx
│   │   │   ├── ExecutionBlotter.tsx
│   │   │   └── *.scss           # Component styles
│   │   ├── services/            # Service layer
│   │   │   ├── ApiClient.ts
│   │   │   ├── ConfigService.ts
│   │   │   ├── AuthTokenService.ts
│   │   │   ├── MetamodelService.ts
│   │   │   ├── BackendMetamodelApiService.ts
│   │   │   ├── MetamodelMappingService.ts
│   │   │   ├── MetamodelCacheService.ts
│   │   │   ├── StaticMetamodel.ts
│   │   │   ├── OMSApiService.ts
│   │   │   ├── BlotterStateService.ts
│   │   │   └── ColumnConfigService.ts
│   │   ├── types/
│   │   │   └── types.ts         # TypeScript type definitions
│   │   ├── index.tsx            # Application entry point
│   │   └── App.scss             # Global styles
│   ├── package.json
│   └── tsconfig.json
└── src/main/java/org/example/omsui/
    └── controller/
        └── ConfigController.java  # Runtime config API

```

## Key Features Implemented

### 1. Application Shell (App.tsx)
- Header with Acme Capital branding and app title
- OAuth authorization button with status indicator
- Tab navigation (Orders, Executions)
- Feature flags for future tabs (Quotes, Quote Requests)
- Footer with copyright information

### 2. Core Blotter Component (Blotter.tsx)
- AG Grid integration with server-side data model
- Dynamic column configuration from metamodel
- Server-side pagination (default 100 rows per page)
- Server-side sorting and filtering
- State persistence across tab switches
- Auto-refresh capability (30-second interval)
- Error handling and loading states
- Toolbar with Filters, Columns, Refresh, Auto-Size buttons

### 3. Filter Builder (FilterBuilder.tsx)
- Rule-based filtering UI
- Dynamic field selection from metamodel
- Multiple operators: Equals, Contains, Greater Than, Less Than, Between
- Type-appropriate input controls (text, number, date)
- Add/remove filter rules
- Apply/Clear all functionality

### 4. Column Selector (ColumnSelector.tsx)
- Checkbox list of all available fields
- Field type indicators
- Bulk actions: Select All, Select None, Default Columns
- Complex object badges

### 5. Authorization Modal (AuthorizeModal.tsx)
- OAuth bearer token input
- Secure password-style input
- Save/Clear token functionality
- Token state persistence

### 6. Service Layer

**Configuration & Authentication:**
- `ConfigService`: Fetches runtime config from Spring Boot
- `AuthTokenService`: Manages OAuth tokens (singleton)
- `ApiClient`: HTTP client with automatic token injection

**Metamodel Services:**
- `MetamodelService`: Main service with sync/async access
- `BackendMetamodelApiService`: Fetches from OMS backend
- `MetamodelMappingService`: Maps backend to frontend format
- `MetamodelCacheService`: In-memory caching with TTL
- `StaticMetamodel`: Fallback when backend unavailable

**Data Services:**
- `OMSApiService`: Queries Orders and Executions
- `BlotterStateService`: Persists user preferences per domain object
- `ColumnConfigService`: Generates AG Grid column definitions

## API Integration

### Configuration Endpoint
```
GET /api/config
Response: { "appName": "OMS Admin Tool", "apiBaseUrl": "http://localhost:9001" }
```

### OMS Backend Query API
```
GET /api/v1/queries/orders?symbol__like=%AAPL%&page=0&size=100
GET /api/v1/queries/executions?orderId=123&page=0&size=100
```

### MetaModel API (Optional)
```
GET /api/v1/metamodel
GET /api/v1/metamodel/Order
GET /api/v1/metamodel/entities
```

## Build and Run

### Prerequisites
- Java 21
- Node.js 20.x (or let Gradle download it)
- Running OMS backend on port 9001 (or configure in application.yml)

### Install Dependencies
```powershell
cd oms-ui/frontend
npm install
```

### Development Mode

**Terminal 1 - React Dev Server:**
```powershell
cd oms-ui/frontend
npm start
```
Runs on http://localhost:3000 with hot-reloading.

**Terminal 2 - Spring Boot Backend:**
```powershell
cd oms-ui
.\gradlew.bat bootRun
```
Runs on http://localhost:8080.

### Production Build
```powershell
cd oms-ui
.\gradlew.bat clean build
.\gradlew.bat bootRun
```

Access at http://localhost:8080

## Configuration

### application.yml
```yaml
oms:
  ui:
    app-name: OMS Admin Tool
  api:
    base-url: http://localhost:9001  # OMS backend URL
```

### Feature Flags (App.tsx)
```typescript
const FEATURE_FLAGS = {
  QUOTES_ENABLED: false,
  QUOTE_REQUESTS_ENABLED: false,
};
```

## Data Flow

1. **App Initialization:**
   - ConfigService fetches runtime config
   - AuthTokenService checks token status
   - User selects tab (Orders/Executions)

2. **Blotter Load:**
   - MetamodelService fetches/caches metadata
   - BlotterStateService restores saved filters/columns
   - OMSApiService queries backend with filters/sort/pagination
   - AG Grid renders data

3. **User Interaction:**
   - Apply filters → FilterBuilder → OMSApiService → Backend
   - Change columns → ColumnSelector → ColumnConfigService → AG Grid update
   - Page navigation → OMSApiService with new page number
   - Sort column → OMSApiService with sort parameter

4. **State Persistence:**
   - BlotterStateService saves filters, columns, sort, page
   - State preserved when switching tabs
   - Restored when returning to tab

## Styling

Component-scoped SCSS files follow the specification's color scheme:
- **Primary Red**: #e60000 (Acme Capital brand, active tabs)
- **Action Orange**: #ff9800 (Authorize button)
- **Authorized Green**: #4caf50
- **Primary Blue**: #2196f3 (buttons)
- **Background**: #fafafa, #f5f5f5
- **Text**: #333 (primary), #666 (secondary)

## Metamodel Fallback

If the OMS backend MetaModel API is unavailable, the UI uses `StaticMetamodel.ts` with predefined field definitions for Orders and Executions, ensuring the UI remains functional.

## Future Enhancements

- Quote and Quote Request blotters (feature-flagged)
- Detail panel for nested objects (parties, accounts)
- Export to CSV/Excel
- Advanced filter operators (IN, NOT IN)
- Column reordering and grouping
- User preference persistence to backend
- WebSocket integration for real-time updates

## Testing

Run tests:
```powershell
cd oms-ui/frontend
npm test
```

## Troubleshooting

**TypeScript/Axios errors:** Run `npm install` to install dependencies.

**Backend connection fails:** Check OMS backend is running on configured URL (default: http://localhost:9001).

**No data shown:** Click "Authorize" and enter valid OAuth token if backend requires authentication.

**Filters not working:** Ensure backend Query API supports filter operators (`__like`, `__gt`, `__between`, etc.).

## References

- Specification: `oms-knowledge-base/ui/oms-admin-ui_spec.mc`
- AG Grid Docs: https://www.ag-grid.com/react-data-grid/
- React 18 Docs: https://react.dev/
- TypeScript Docs: https://www.typescriptlang.org/
