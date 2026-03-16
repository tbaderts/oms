# 09 - Technology Stack Options

This document presents three reference architectures for implementing the Developer Cockpit. Each is viable and the choice depends on team expertise, deployment requirements, and performance goals.

---

## 1. Option A: Web Application (Node.js + React)

The lightest option. Runs as a local web server accessed via browser.

### Architecture

```
Browser (React SPA)
    |
    | HTTP + WebSocket
    |
Node.js Server (Express/Fastify)
    |
    +-- Services (TypeScript classes)
    +-- File watchers (chokidar)
    +-- PTY sessions (node-pty)
    +-- AI SDK (@anthropic-ai/sdk or openai)
```

### Technology Choices

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend framework** | React 19 + TypeScript | Dominant ecosystem, rich component libraries |
| **Styling** | Tailwind CSS 4 | Utility-first, fast iteration, dark mode built-in |
| **State management** | Zustand | Minimal boilerplate, excellent TypeScript support |
| **UI primitives** | Radix UI or shadcn/ui | Accessible, unstyled primitives + ready-made components |
| **Data grid** | AG Grid (Community) or TanStack Table | Sorting, filtering, pagination for large datasets |
| **Charts** | Recharts or Nivo | React-native charting with good defaults |
| **Code editor** | Monaco Editor (@monaco-editor/react) | Same engine as VS Code, syntax highlighting, SQL autocomplete |
| **Terminal** | xterm.js | Industry standard terminal emulator for the web |
| **Markdown** | react-markdown + remark-gfm + rehype-mermaid | GFM rendering with Mermaid diagram support |
| **Gantt chart** | dhtmlx-gantt, frappe-gantt, or custom with D3 | Interactive timeline visualization |
| **Backend** | Express 5 or Fastify | Mature, extensible HTTP framework |
| **PTY** | node-pty | Pseudo-terminal for AI CLI sessions |
| **File watching** | chokidar | Cross-platform, efficient file system watching |
| **YAML parsing** | gray-matter (front-matter) + js-yaml | Parse markdown front-matter and YAML configs |
| **Git** | simple-git or isomorphic-git | Git operations without shelling out |
| **Kubernetes** | @kubernetes/client-node | Official K8s client |
| **Kafka** | kafkajs | Pure JS Kafka client |
| **PostgreSQL** | pg | Standard PostgreSQL driver |
| **AI** | @anthropic-ai/sdk, openai | Official SDKs with streaming support |
| **WebSocket** | ws | Lightweight WebSocket server |
| **Build tool** | Vite | Fast dev server and optimized production builds |

### Pros
- Fastest to develop; largest ecosystem of libraries
- Team likely already knows React + TypeScript
- Easy to deploy (just `npm start`)
- Hot-reload development experience

### Cons
- Requires a running Node.js server
- No native OS integration (system tray, file dialogs, notifications)
- PTY support requires native module compilation (node-pty)

### Recommended When
- Team is proficient in TypeScript/React
- Local-only usage (no need for OS-level integration)
- Fastest path to MVP

---

## 2. Option B: Desktop Application (Electron)

Full desktop experience with native OS integration.

### Architecture

```
Electron App
  +-- Main Process (Node.js)
  |     +-- Services (same as Option A)
  |     +-- IPC bridge to renderer
  |     +-- Native file dialogs, system tray, notifications
  |
  +-- Renderer Process (Chromium + React)
        +-- Same frontend as Option A
        +-- IPC calls instead of HTTP for local services
```

### Technology Choices

Same as Option A for frontend and services, plus:

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Shell** | Electron 34+ | Mature, widely used, good Node.js integration |
| **IPC** | Electron IPC (contextBridge) | Secure communication between main and renderer |
| **Auto-update** | electron-updater | Built-in auto-update support |
| **Packaging** | electron-builder | Cross-platform packaging (dmg, exe, AppImage) |
| **Native menus** | Electron Menu API | Native OS menus and keyboard shortcuts |
| **System tray** | Electron Tray API | Background running with tray icon |
| **File dialogs** | Electron dialog API | Native open/save dialogs |

### Architecture Notes

**IPC instead of HTTP**: For performance, local service calls use Electron IPC instead of HTTP:

```typescript
// Main process (preload script exposes API)
contextBridge.exposeInMainWorld('cockpit', {
  specs: {
    list: () => ipcRenderer.invoke('specs:list'),
    get: (module, ticket) => ipcRenderer.invoke('specs:get', module, ticket),
  },
  // ... other service APIs
});

// Renderer process
const specs = await window.cockpit.specs.list();
```

**WebSocket remains** for streaming data (sessions, AI, investigation) -- IPC is better for request/response, WebSocket for push.

### Pros
- Native OS experience (menus, tray, notifications, file dialogs)
- No browser tab -- dedicated window
- Auto-update support
- Full Node.js access without CORS concerns
- Can bundle node-pty without user needing to compile

### Cons
- Large binary size (~150-200MB)
- Higher memory usage (bundled Chromium)
- Slower release cycle for Electron updates
- More complex build/packaging pipeline

### Recommended When
- You want a polished desktop experience
- Native OS integration is important
- You plan to distribute to non-technical users

---

## 3. Option C: Desktop Application (Tauri)

Lightweight desktop app using the OS webview.

### Architecture

```
Tauri App
  +-- Rust Backend
  |     +-- Services (Rust implementations or Node.js sidecar)
  |     +-- Tauri commands (IPC)
  |     +-- Native integrations (system tray, notifications)
  |
  +-- Frontend (OS WebView + React)
        +-- Same frontend as Option A
        +-- Tauri invoke() instead of HTTP for local services
```

### Technology Choices

Frontend same as Option A. Backend differs:

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Shell** | Tauri 2.x | Lightweight, secure, Rust backend |
| **Backend language** | Rust | Performance, safety, small binary |
| **IPC** | Tauri commands | Type-safe IPC with serde serialization |
| **File watching** | notify (Rust crate) | Efficient cross-platform file watching |
| **Git** | git2 (Rust bindings for libgit2) | Fast, no shell dependency |
| **HTTP client** | reqwest | For SCM API calls |
| **Kubernetes** | kube-rs | Rust Kubernetes client |
| **Database** | sqlx or tokio-postgres | Async PostgreSQL/MySQL/SQLite |
| **AI** | reqwest (HTTP) | Call AI APIs directly via HTTP |
| **Terminal** | portable-pty | PTY support in Rust |
| **WebSocket** | tokio-tungstenite | Async WebSocket |
| **Sidecar** | Optional Node.js sidecar | For complex JS library use (KafkaJS, etc.) |

### Hybrid Approach (Tauri + Node.js Sidecar)

For teams that want Tauri's small footprint but don't want to rewrite all services in Rust:

```
Tauri App
  +-- Rust Backend (shell, IPC, file watching, native features)
  +-- Node.js Sidecar (spawned by Tauri)
  |     +-- Express server on localhost
  |     +-- All services from Option A
  |
  +-- Frontend (WebView + React)
        +-- Calls Tauri commands for native features
        +-- Calls Node.js sidecar for services
```

### Pros
- Tiny binary size (~5-15MB vs Electron's ~150MB)
- Low memory footprint (uses OS webview, not bundled Chromium)
- Rust backend is fast and memory-safe
- Better security model (no Node.js in renderer)
- Cross-platform (Windows, macOS, Linux)

### Cons
- Rust learning curve (if team is JS-only)
- Smaller ecosystem for some integrations (Kafka, schema registry)
- WebView differences across platforms (can be mitigated)
- PTY support is less mature than node-pty
- Sidecar approach adds complexity

### Recommended When
- Binary size and memory matter
- Team knows Rust or wants to learn
- You want maximum performance
- Security is a priority

---

## 4. Comparison Matrix

| Criterion | Web (Node+React) | Electron | Tauri |
|-----------|:-:|:-:|:-:|
| **Development speed** | Fast | Medium | Slower |
| **Binary size** | N/A (server) | ~150MB | ~10MB |
| **Memory usage** | Low (server) | High | Low |
| **Native OS integration** | None | Full | Full |
| **Ecosystem/libraries** | Largest | Large | Growing |
| **Rust required** | No | No | Yes (or sidecar) |
| **Auto-update** | N/A | Built-in | Built-in |
| **Distribution** | npm/Docker | Installer | Installer |
| **Cross-platform** | Yes (browser) | Yes | Yes |
| **Security** | Standard | Moderate | Strong |

---

## 5. Shared Frontend Strategy

Regardless of shell (browser, Electron, Tauri), the React frontend code is **identical**. The only difference is how it communicates with the backend:

```typescript
// Abstract API client
interface CockpitAPI {
  specs: SpecAPI;
  kb: KbAPI;
  scm: ScmAPI;
  // ... etc
}

// Implementation varies by platform
class HttpCockpitAPI implements CockpitAPI {
  // Uses fetch() for REST calls
}

class ElectronCockpitAPI implements CockpitAPI {
  // Uses window.cockpit IPC bridge
}

class TauriCockpitAPI implements CockpitAPI {
  // Uses @tauri-apps/api invoke()
}
```

This means you can **start with Option A** (web app) and migrate to Electron or Tauri later by only changing the API transport layer.

---

## 6. Recommended Path

1. **Start with Option A** (Web + Node.js + React) for fastest MVP
2. **Wrap in Electron** (Option B) if desktop features are needed
3. **Consider Tauri** (Option C) for a future v2 if binary size / performance matters

The shared frontend strategy ensures that switching shells is a bounded effort.
