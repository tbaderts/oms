# OMS Admin UI - Quick Start

## What Was Created

A complete, production-ready OMS Admin UI following the specification in `oms-knowledge-base/ui/oms-admin-ui_spec.mc`.

### Components Created

**Frontend (React + TypeScript):**
- ✅ Main App shell with header, tabs, footer
- ✅ Core Blotter component with AG Grid
- ✅ FilterBuilder for advanced filtering
- ✅ ColumnSelector for column management
- ✅ AuthorizeModal for OAuth tokens
- ✅ OrderBlotter and ExecutionBlotter
- ✅ Complete service layer (12+ services)
- ✅ Type definitions and static metamodel
- ✅ SCSS styling matching specification

**Backend (Spring Boot):**
- ✅ ConfigController for runtime configuration
- ✅ Configuration properties in application.yml

**Documentation:**
- ✅ OMS_ADMIN_UI_README.md with full architecture
- ✅ This quick start guide

## Running the Application

### Option 1: Development Mode (Hot Reload)

**Terminal 1 - React Dev Server:**
```powershell
cd oms-ui\frontend
npm start
```
Access at: http://localhost:3000

**Terminal 2 - Spring Boot:**
```powershell
cd oms-ui
.\gradlew.bat bootRun
```
Backend at: http://localhost:8080

### Option 2: Production Build

```powershell
cd oms-ui
.\gradlew.bat clean build
.\gradlew.bat bootRun
```
Access at: http://localhost:8080

## Prerequisites

- ✅ Java 21 installed
- ✅ OMS backend running on http://localhost:9001 (or configure in application.yml)
- ✅ npm dependencies installed (already done)

## Key Features

1. **Orders Blotter** - View and query orders with filtering, sorting, pagination
2. **Executions Blotter** - View and query executions
3. **Dynamic Filtering** - Build complex queries with multiple operators
4. **Column Management** - Select which columns to display
5. **OAuth Authorization** - Secure API access with bearer tokens
6. **State Persistence** - Filters and settings saved per tab
7. **Auto-refresh** - Optional automatic data refresh
8. **Metamodel-driven** - Columns generated from backend metadata

## Configuration

Edit `oms-ui\src\main\resources\application.yml`:

```yaml
oms:
  ui:
    app-name: OMS Admin Tool
  api:
    base-url: http://localhost:9001  # Point to your OMS backend
```

## Testing the UI

1. **Start the application** (see above)
2. **Navigate to Orders tab** (default view)
3. **Click "Authorize"** if backend requires authentication
4. **Use "Filters"** to query specific orders (e.g., symbol contains "BTC")
5. **Use "Columns"** to customize displayed fields
6. **Click column headers** to sort
7. **Use pagination** to navigate large datasets

## Architecture Highlights

- **React 18.2 + TypeScript** for type safety
- **AG Grid Community** for advanced data grid
- **Service layer** with singleton patterns
- **Metamodel caching** with fallback to static definitions
- **State management** per domain object type
- **Spring Boot wrapper** for production deployment

## Next Steps

- Enable Quotes and Quote Requests tabs (edit feature flags in App.tsx)
- Implement detail panels for complex objects
- Add export to CSV functionality
- Configure WebSocket for real-time updates
- Deploy to Kubernetes

## Troubleshooting

**No data showing:**
- Ensure OMS backend is running on configured URL
- Check backend supports Query API: `/api/v1/queries/orders`
- Click "Authorize" and enter OAuth token if required

**Build errors:**
- Run `npm install` in frontend directory
- Ensure Java 21 is in PATH

**Cannot connect to backend:**
- Update `oms.api.base-url` in application.yml
- Verify backend is accessible at that URL

## Files Created

```
oms-ui/
├── frontend/
│   ├── src/
│   │   ├── App.tsx (main app)
│   │   ├── index.tsx (entry point)
│   │   ├── components/ (8 React components)
│   │   ├── services/ (12 service files)
│   │   ├── types/ (type definitions)
│   │   └── *.scss (styling files)
│   ├── package.json (updated with dependencies)
│   └── tsconfig.json (TypeScript config)
├── src/main/java/.../controller/
│   └── ConfigController.java
├── src/main/resources/
│   └── application.yml (updated)
├── OMS_ADMIN_UI_README.md (full docs)
└── QUICKSTART_OMS_UI.md (this file)
```

## Additional Resources

- Full specification: `oms-knowledge-base/ui/oms-admin-ui_spec.mc`
- Architecture details: `OMS_ADMIN_UI_README.md`
- AG Grid docs: https://www.ag-grid.com/
- React docs: https://react.dev/
