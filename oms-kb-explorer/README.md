# OMS Knowledge Base Explorer

A modern, full-stack web application for browsing, searching, and exploring the OMS knowledge base documentation.

![KB Explorer](https://img.shields.io/badge/status-production%20ready-brightgreen) ![React](https://img.shields.io/badge/React-19.2.0-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue) ![Vite](https://img.shields.io/badge/Vite-7.3.1-purple)

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
# http://localhost:5173 (or next available port)
```

**Prerequisites:**
- Node.js 18+ or Bun
- OMS MCP Server running on port 8091 (see [Backend Setup](#backend-setup))

---

## ✨ Features

### 📂 Document Browser (Open Knowledge Format aware)
The knowledge base is an [OKF](https://github.com/GoogleCloudPlatform/open-knowledge-format) bundle
(see `oms-knowledge-base/okf-conventions.md`); the explorer reads each document's OKF metadata.
- **Types view** (default): concepts grouped by OKF type — capabilities by maturity
  (implemented / partial / planned), requirements FR / NFR in id order, then domain, interfaces,
  architecture, specifications, …; documents without front matter under "Untyped"
- **Folders view**: the bundle hierarchy; a folder's `index.md` opens when you click the folder name
- **Filters** for status (stable, draft, deprecated — legacy Active/Complete count as stable) and
  trust tier (human-reviewed, machine-confirmed, unverified)
- **Document header**: type, status, trust tier, stale warning, version, updated, tags,
  description, maturity / id / priority / implementation, the capability as a link, and the cited
  sources (bundle documents open in the explorer, `repo:` paths shown as text, URLs external)
- **Links panel** next to the table of contents: outgoing links (broken ones struck through) and
  "cited by"
- **In-app links**: links between knowledge base documents open in the explorer; external links in
  a new tab; deep links `?doc=<path>#anchor` open a document directly

### 🔍 Powerful Search
- **Keyword Search** - BM25 text matching
- **Semantic Search** - AI-powered meaning-based search (when enabled)
- **Hybrid Search** - Best of both worlds
- **Type and tag filters**, sent to the server (`filterType`, `filterTag`)
- **Search results** with title, type, status and trust badges, snippets and scores
- **Click-to-open** documents from search results

### 📄 Rich Document Viewer
- **Markdown rendering** with full CommonMark support
- **Syntax highlighting** for code blocks (Java, Python, TypeScript, etc.)
- **Copy buttons** on all code blocks
- **Responsive layout** with optimal reading width
- **Auto-generated Table of Contents** for easy navigation

### 🎨 Modern UI/UX
- **Dark/Light theme** toggle with system preferences
- **Responsive design** works on all screen sizes
- **Loading states** and smooth transitions
- **Empty states** with helpful guidance
- **Keyboard navigation** support

---

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS v4** - Styling with `@tailwindcss/postcss`
- **TanStack Query** - Data fetching and caching
- **react-markdown** - Markdown rendering
- **react-syntax-highlighter** - Code syntax highlighting
- **lucide-react** - Icon library

**Backend:**
- **Spring Boot 4.0** (Java 25)
- **Spring WebFlux** - Reactive web server
- **OMS MCP Server** - Knowledge base API
- See [oms-mcp-server README](../oms-mcp-server/README.md)

### Project Structure

```
oms-kb-explorer/
├── src/
│   ├── components/
│   │   ├── DocumentViewer.tsx      # Markdown viewer with syntax highlighting
│   │   ├── SearchBar.tsx           # Search input with mode tabs
│   │   ├── SearchResults.tsx       # Search results display
│   │   ├── TableOfContents.tsx     # Auto-generated TOC
│   │   └── TreeView.tsx            # Document browser tree
│   ├── services/
│   │   └── api.ts                  # API client for backend
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── App.tsx                     # Main application component
│   ├── main.tsx                    # Application entry point
│   └── index.css                   # Global styles + Tailwind
├── public/                         # Static assets
├── index.html                      # HTML template
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── vite.config.ts                  # Vite config
├── tailwind.config.js              # Tailwind CSS config
├── postcss.config.js               # PostCSS config (Tailwind v4)
└── README.md                       # This file
```

---

## 🔧 Backend Setup

The KB Explorer requires the **OMS MCP Server** to be running with the `local` profile:

```bash
cd ../oms-mcp-server

# Build the server
./gradlew build -x test

# Run with local profile (enables REST API + web server)
./gradlew bootRun --args='--spring.profiles.active=local'
```

The server will start on **http://localhost:8091** and provide:
- REST API endpoints at `/api/kb/*`
- Document access to `oms-knowledge-base/` directory
- Search functionality (keyword, semantic, hybrid)

**Configuration:**
- Profile: `local` (enables reactive web server)
- Port: 8091
- CORS: Enabled for localhost:5173-5176
- Document path: `../oms-knowledge-base` (configurable)

See [oms-mcp-server/README.md](../oms-mcp-server/README.md) for full details.

---

## 📡 API Endpoints

The frontend connects to these backend endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kb/documents` | GET | List all documents with metadata |
| `/api/kb/documents/read?path={path}` | GET | Read document content |
| `/api/kb/documents/sections?path={path}` | GET | List document sections (TOC) |
| `/api/kb/search/keyword?query={q}&topK={n}` | GET | Keyword search |
| `/api/kb/search/sections?query={q}&topK={n}` | GET | Section-level search |
| `/api/kb/search/hybrid?query={q}&topK={n}` | GET | Hybrid search |
| `/api/kb/health` | GET | Health check |

**Example:**
```bash
# List all documents
curl http://localhost:8091/api/kb/documents

# Search for "state machine"
curl "http://localhost:8091/api/kb/search/keyword?query=state+machine&topK=5"

# Read a document
curl "http://localhost:8091/api/kb/documents/read?path=oms-knowledge-base/oms-concepts/order-lifecycle.md"
```

---

## 🎯 Usage Guide

### Browsing Documents

1. **Open the app** at http://localhost:5173
2. **Browse the tree** on the left sidebar
3. **Click any document** to view it
4. **Use the Table of Contents** on the right to navigate sections
5. **Toggle dark/light mode** with the button in the header

### Searching

1. **Enter a search query** in the search bar
2. **Choose a search mode:**
   - **Keyword** - Fast, exact text matching (default)
   - **Semantic** - AI-powered (requires vector store)
   - **Hybrid** - Combines both approaches
3. **Press Enter** or click Search
4. **Click any result** to open the document
5. **Clear search** by clicking a document in the tree

---

## 🛠️ Development

### Install Dependencies

```bash
npm install
# or
bun install
```

### Run Development Server

```bash
npm run dev
# or
bun run dev
```

Vite will start on **http://localhost:5173** (or next available port).

The API defaults to `http://localhost:8091/api/kb` (the MCP server's KB explorer controller, active
in its `local` profile). Point it elsewhere with `VITE_KB_API_URL`, e.g.
`VITE_KB_API_URL=http://localhost:8096/api/kb npm run dev`. Endpoints used: `/documents`
(with `okf` metadata and `concept`), `/documents/read`, `/documents/sections`,
`/documents/links`, `/search/{keyword,semantic,hybrid}` (with `filterType`, `filterTag`).

The OKF logic (sidebar views and filters, document header, link resolution, search decoration,
status/trust badges) lives in plain TypeScript models under `src/okf/`, each with a `*.test.ts`;
the components only render them.

### Build for Production

```bash
npm run build
# or
bun run build
```

Output: `dist/` directory with optimized static files.

### Run Tests

```bash
npm test
```

Runs `src/**/*.test.ts` with Node's built-in test runner (Node 22.18 or later, which strips
TypeScript types natively; no test framework dependency). Test files are excluded from the app
build in `tsconfig.app.json`.

Knowledge base documents start with OKF front matter (see
`oms-knowledge-base/okf-conventions.md`); the document viewer strips it before rendering
(`src/utils/frontMatter.ts`).

### Preview Production Build

```bash
npm run preview
# or
bun run preview
```

---

## 🐛 Known Issues & Limitations

### Hybrid/Semantic Search
- **Issue:** Blocking I/O in reactive context causes 500 errors
- **Impact:** Hybrid and semantic search modes don't work
- **Workaround:** Use keyword search mode (default)
- **Fix:** Requires refactoring to use reactive WebClient or separate thread pool

### Table of Contents Navigation
- **Issue:** TOC links don't scroll to sections
- **Impact:** Clicking TOC items doesn't navigate
- **Workaround:** Use browser Ctrl+F to search for section titles
- **Fix:** Add anchor IDs to rendered markdown headings

---

## 🚧 Roadmap

### Near-term
- [ ] Fix hybrid search blocking I/O issue
- [ ] Add keyboard shortcuts (Ctrl+K for search)
- [ ] Highlight search terms in document viewer
- [ ] Add TOC anchor navigation
- [ ] Add document metadata in viewer

### Future
- [ ] Search history and saved searches
- [ ] Favorites/bookmarks for documents
- [ ] Export documents as PDF/HTML
- [ ] Advanced filters (status, category, date)
- [ ] Multi-document comparison view
- [ ] Mobile-optimized responsive design

---

## 📦 Dependencies

### Core Dependencies
```json
{
  "@tanstack/react-query": "^5.90.21",
  "lucide-react": "^0.564.0",
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "react-markdown": "^10.1.0",
  "react-syntax-highlighter": "^15.7.0"
}
```

### Dev Dependencies
```json
{
  "@tailwindcss/postcss": "^4.1.18",
  "@types/react": "^19.2.7",
  "@vitejs/plugin-react": "^5.1.1",
  "autoprefixer": "^10.4.24",
  "typescript": "^5.x",
  "vite": "^7.3.1"
}
```

---

## 🤝 Contributing

This project is part of the OMS (Order Management System) monorepo. Contributions should follow the project's development guidelines.

**Code Style:**
- TypeScript strict mode enabled
- ESLint for linting
- React functional components with hooks
- Tailwind for all styling (no CSS modules)

---

## 📄 License

Part of the OMS project. See root LICENSE file.

---

**Built with ❤️ for the OMS Project**

Last Updated: February 16, 2026
