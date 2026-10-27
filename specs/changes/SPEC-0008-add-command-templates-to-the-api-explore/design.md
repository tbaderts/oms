# Design — SPEC-0008: Add command templates to the API Explorer

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The API Explorer was built in SPEC-0007, and this ticket extends it.

**Renderer.**
- `src/renderer/stores/apiExplorer.ts` (zustand) holds:
  - `selectedType`, `bodyText`, `templateText` (to tell whether the user edited the body) and `check`;
  - the follow-up (`followUpId`), the Orders query and History.
- `selectType(type, preset)` builds a schema skeleton with `buildTemplate` from
  `src/renderer/lib/api-schema.ts`. If the body was edited, it asks first.
- `send()` passes `bodyText` to main as it is.
- `restore(entry)` puts a History body back into the editor.

**Views and live reload.**
- `views/api-explorer/CommandsTab.tsx` shows the command type list (`nav`), the Monaco editor, the
  findings, `ResponsePanel` and `OrderFollowUp`.
- `OrderFollowUp.tsx` has the "Next command…" select.
- `OrdersTab.tsx` rows open the follow-up, which `OrdersTab` also renders.
- `ApiExplorerView.tsx` reloads the catalog on `file:*` events for contract files, debounced by
  300 ms.

**Main.**
- `src/main/ipc/apiExplorer.ipc.ts` registers the `apiExplorer:*` channels. It records history from
  the body it is given, so the stored body is exactly the sent one.
- Services take the workspace root and the config dir, as `ApiHistoryService` does (atomic
  writes, never throws).
- `WatcherService` watches a fixed list of workspace folders. `developer-cockpit/api-templates`
  and arbitrary extra files are not on it.

**Config.**
- `CockpitConfig.infrastructure.omsCoreUrl` (in `src/shared/types/config.ts`) is the oms-core URL.
- `ConfigService.load` merges the saved config over `DEFAULT_CONFIG`, so a new key gets its
  default.

**Existing material for templates.**
- `oms-core/rest.http` holds one full `OrderCreateCmd` body and five lifecycle bodies with
  `<orderId>` placeholders.
- `Order` in `oms-cmd-api.yml` lists the client fields (`sessionId` … `text`). The query API's
  order returns the same names plus server fields (`orderId`, `state`, `cancelState`, `txNr`,
  `cumQty`, `leavesQty`, …).
- The exchange simulator accepts AAPL, MSFT, IBM, NVDA and INTC, at reference prices of 170, 420,
  250, 120 and 86.96, within ±10 %.

The closest pattern to follow is SPEC-0007's split: a pure parser and logic in `shared/` and
`renderer/lib/`, file I/O in a main service behind IPC, and state in the store. Other material read:
the REST Client file format (requests separated by `###`, `# @name`, `@var = value`,
`{{$guid}}`/`{{$datetime iso8601}}`/`{{$timestamp}}`/`{{$randomInt}}`).

## Approach

```mermaid
flowchart LR
  F[".http files<br/>api-templates/*.http<br/>+ extra sources"] -->|read| S[ApiTemplateService (main)]
  S -->|parseHttpFile| P[shared/httpFile.ts]
  S -- "apiExplorer:templates" --> R[store.loadTemplates]
  R --> L["lib/api-templates.ts<br/>classify by command type"]
  L --> C[CommandsTab template list]
  C -->|select| E[editor body + file variables]
  E -->|"check: resolve → checkBody"| K[findings / unresolved]
  E -->|"send: resolve (fresh values)"| H["apiExplorer:sendCommand (resolved body)"]
  E -->|"Save as template"| W["apiExplorer:saveTemplate → append block"]
  W --> F
  WS[WatcherService] -->|"file:* (.http)"| R
```

### 1. `.http` parsing and writing — `src/shared/httpFile.ts` (new, pure)

```ts
export interface HttpRequestBlock {
  name: string | null;      // from `# @name X` or `// @name X`
  comment: string | null;   // last plain comment line before the request line
  method: string;           // upper case; a bare URL line is GET
  url: string;              // as written, variables unresolved
  body: string | null;      // text after the first blank line following the headers, trimmed at the end
  line: number;             // 1-based line of the request line
}
export interface HttpFile { variables: Record<string, string>; requests: HttpRequestBlock[] }
export function parseHttpFile(text: string): HttpFile;
export const isCommandRequest = (r: HttpRequestBlock) => r.method === 'POST' && /\/api\/command\/execute\/?$/.test(r.url.split('?')[0]);
export const templateName = (r: HttpRequestBlock, type: string, n: number) => r.name ?? r.comment ?? `${type} #${n}`;
export function formatTemplateBlock(name: string, url: string, body: string): string;
```

Parsing rules, following REST Client:
- Lines are split on `\r?\n`, and a line starting with `###` starts a new block.
- In a block, `#` and `//` lines are comments. `@name X` inside a comment is the name.
- A line matching `^@([A-Za-z_][\w.-]*)\s*=\s*(.*)$` declares a file variable. Variables are
  file-wide; if a name is declared twice, the last one wins.
- The first other non-empty line is the request line, `METHOD URL [HTTP/x.y]`. Header lines follow,
  up to the first blank line, and everything after that is the body.

`formatTemplateBlock` returns the text below, with the body exactly as given:

```
\n###\n# @name <name>\nPOST <url> HTTP/1.1\ncontent-type: application/json\n\n<body>\n
```

### 2. Template sources — `src/main/services/ApiTemplateService.ts` (new)

```ts
export interface TemplateSource {
  path: string;            // workspace-relative, forward slashes
  shared: boolean;         // true for files in developer-cockpit/api-templates
  missing?: boolean;       // a configured source that does not exist
  error?: string;          // could not be read
  file?: HttpFile;
}
export type SaveTemplateRequest = { path: string; name: string; body: string } | { newFile: string; name: string; body: string };
export type SaveTemplateResult = { ok: true; path: string } | { ok: false; error: string };

export class ApiTemplateService {
  constructor(workspaceRoot: string, extraSources: string[], baseUrl: () => string);
  list(): TemplateSource[];
  save(req: SaveTemplateRequest): SaveTemplateResult;
}
export const SHARED_TEMPLATE_DIR = 'developer-cockpit/api-templates';
```

**`list()`**
- Returns every `*.http` file directly in `SHARED_TEMPLATE_DIR`, sorted by name, then each
  `extraSources` entry (workspace-relative or absolute).
- A file that doesn't exist becomes `{ missing: true }`. A read error becomes `{ error }`.
- Sources are read on every call, as `ApiCatalogService` does. It never throws.

**`save()`** appends only.
- `path` must be one of the paths `list()` returns, not missing. Any other path is refused with
  "not a template source". The renderer never names an arbitrary file.
- `newFile` must match `^[\w.-]+\.http$`. It is created in `SHARED_TEMPLATE_DIR` with flag `wx`, so
  an existing file is never overwritten. It starts with `@baseUrl = <configured oms-core URL>\n`.
- `name` is trimmed and must be 1–80 characters on one line. It must not equal the effective name
  (`templateName`) of any request already in the file, or the save is refused and nothing is
  written.
- The block URL is `{{baseUrl}}/api/command/execute` when the file declares `@baseUrl`. Otherwise
  it is the configured URL as a literal, so the block still runs in VS Code.
- The block is written with `fs.appendFileSync`. If the file doesn't end with a newline, the
  appended text starts with one, so every byte that was there before stays the same.
- Each save logs `[api-explorer] template saved <name> → <path>`.

### 3. Config, IPC, preload and watching

- `InfrastructureConfig.apiTemplateSources: string[]` defaults to `[]`. It lists extra `.http`
  files, such as `oms-core/rest.http`.
- `apiExplorer.ipc.ts` adds two channels:
  - `apiExplorer:templates` → `TemplateSource[]`;
  - `apiExplorer:saveTemplate(req)` → `SaveTemplateResult`.

  Each call builds an `ApiTemplateService` from the current config, as the catalog does. Preload
  and `shared/types/ipc.ts` add `templates()` and `saveTemplate(req)`.
- `WatcherService`:
  - adds `developer-cockpit/api-templates` to the fixed watch list;
  - gets `setExtraPaths(absPaths: string[])`, which unwatches the previous extra set and adds the
    new one. Called before `start()`, it remembers the paths and applies them on start.
- `registerConfigIpc` gets an optional `onSaved(config)` callback. In `main/index.ts`:
  - `watcherService.setExtraPaths(...)` runs at startup;
  - it runs again in `onSaved`, so a source added in Settings is watched without a restart.
- `ApiExplorerView`: a `file:*` event whose path ends in `.http` reloads the templates, debounced
  300 ms like the contract reload.

### 4. Variables, templates and checks — `src/renderer/lib/api-templates.ts` (new, pure)

```ts
export interface CommandTemplate { source: string; name: string; type: string; body: string; variables: Record<string, string>; line: number }
export interface UnusableTemplate { source: string; name: string; line: number; reason: string }
export function classifyTemplates(sources: TemplateSource[], commandTypes: string[]):
  { byType: Record<string, CommandTemplate[]>; unusable: UnusableTemplate[] };

export interface ResolveContext { variables: Record<string, string>; orderId: string | null; now: () => Date; uuid: () => string; random: () => number }
export function resolveVariables(text: string, ctx: ResolveContext): { text: string; unresolved: string[] };
export function templatize(bodyText: string): string;
export function orderToTemplate(order: Record<string, unknown>, createSchema: JsonSchema): string;
export function checkTemplateBody(text: string, type: string, schema: JsonSchema, ctx: ResolveContext): CheckResult;
```

**`classifyTemplates`** looks at every `isCommandRequest` block:
- a usable block has a body that parses as JSON once its variables are filled with placeholders
  (strings with `x`, numbers with `0`), and a `type` that is in `commandTypes`;
- anything else goes to `unusable`, with the reason "no body", "invalid JSON: …" or
  "unknown command type X";
- non-command blocks are ignored.

**`resolveVariables`** replaces every `{{…}}`:

| Variable | Value |
|---|---|
| `{{$guid}}` | `ctx.uuid()` (`crypto.randomUUID`), new for each occurrence |
| `{{$datetime iso8601}}` | `ctx.now().toISOString()` |
| `{{$timestamp}}` | Unix seconds |
| `{{$randomInt a b}}` | an integer in [a, b) |
| `{{name}}` (file variable) | its value, resolved recursively up to depth 5 |
| `{{orderId}}` | when no file variable has that name, `ctx.orderId` |

Anything else stays unresolved and is reported by name (each name once): an unknown `$` function,
a `$datetime` format other than `iso8601`, an undeclared name, or `orderId` with no followed
order.

**`checkTemplateBody`** resolves first:
- unresolved names give `CheckResult.unresolved` and one finding per name:
  `{ path: '{{name}}', message: 'unresolved variable' }`;
- otherwise it returns `checkBody(resolved, type, schema)`.

A body without `{{` behaves exactly as today.

**`templatize`** replaces the per-send fields, wherever they appear at the top level or one level
down (`order`, `execution`):
- `clOrdId` and `commandId` become `"{{$guid}}"`;
- `sendingTime` and `transactTime` become `"{{$datetime iso8601}}"`.

It keeps the key order. A body that isn't valid JSON is returned unchanged.

**`orderToTemplate`** turns a query-API order into an `OrderCreateCmd` body:
- It keeps the order's non-null fields that are properties of the create schema's `order`.
- It drops the server-assigned fields `orderId`, `parentOrderId`, `rootOrderId` and
  `origClOrdId`. Query-only fields such as `state`, `cancelState`, `txNr`, `cumQty` and
  `leavesQty` drop out because they aren't in the schema.
- It builds the body with `buildTemplate('OrderCreateCmd', schema, { order })`, then applies
  `templatize`.

### 5. Store and UI

New store state and actions in `stores/apiExplorer.ts`:
- `templates: TemplateSource[]`, `loadTemplates()` (also called from `load()`), and
  `templateVars: Record<string, string>`;
- `selectTemplate(t: CommandTemplate)`:
  - asks first if the body was edited, as `selectType` does;
  - sets `selectedType = t.type`, `bodyText = templateText = t.body` and
    `templateVars = t.variables`.

  `selectType` and `restore` reset `templateVars` to `{}`.
- `check`:
  - always comes from `checkTemplateBody`, with context `{ variables: templateVars, orderId: followUpId, … }`;
  - is recomputed when the follow-up changes.
- `send()` resolves `bodyText` at send time with a fresh context:
  - if any name is unresolved, it sets the check and returns without an IPC call (AC-4);
  - otherwise it sends the resolved text, so History records the resolved body (AC-3).

  `orderIdOf` reads the resolved body.
- `saveTemplate({ target, name, useVariables })` calls `apiExplorer:saveTemplate`:
  - the body is `templatize(bodyText)` if `useVariables` is set, otherwise `bodyText`;
  - on success it reloads the templates and returns the result for the dialog.
- `useOrderAsTemplate(order)`:
  - asks first if the body was edited;
  - sets `selectedType = 'OrderCreateCmd'`, the body from `orderToTemplate`, `templateVars = {}`,
    and switches to the Commands tab.

UI:
- **CommandsTab nav.** Each command type button is followed by its templates, indented, each a
  button with its name and the source file in its `title`. At the end of the nav, a
  "Template files" group lists missing or unreadable sources and unusable blocks, each with its
  reason.
- **Editor header.** A "Save as template" button (disabled with no type selected) opens
  `SaveTemplateDialog.tsx`, built on `components/ui/dialog`. It has:
  - a name;
  - the target, chosen from the existing non-missing sources or "New file in api-templates"
    with a file name;
  - a switch "Use variables for clOrdId, commandId and times", on by default.

  An error from main is shown in the dialog, which stays open.
- **Send** is disabled while `check.unresolved` is non-empty. The findings show the unresolved
  names.
- **OrderFollowUp.** A "Use as template" button is shown when the order is loaded. Because
  `OrdersTab` renders the same follow-up, the button also covers the Orders tab, where a row opens
  that follow-up.
- **History.** Restore stays as it is, and Save as template then works on the restored body.
- **SettingsView** gets a textarea, "API Explorer template files (one path per line)", bound to
  `infrastructure.apiTemplateSources`.

### 6. Starter templates — `developer-cockpit/api-templates/`

- **`orders.http`** declares `@baseUrl = http://localhost:8090`, `@sessionId = cockpit` and
  `@account = account-01`, and holds `OrderCreateCmd` templates:
  - "INTC limit buy", at 86.96 (the reference price, so marketable);
  - "AAPL limit sell", at 170.00;
  - "MSFT market buy".

  Each uses `{{$guid}}`, `{{$datetime iso8601}}`, `{{sessionId}}` and `{{account}}`, plus the
  venue fields from `rest.http`.
- **`lifecycle.http`** holds one template each for OrderAcceptCmd, OrderRejectCmd,
  OrderCancelRequestCmd, OrderCancelCmd, OrderCancelRejectCmd and ExecutionCreateCmd. Each uses
  `{{orderId}}` and `"commandId": "{{$guid}}"`, with the bodies from rest.http.

## Contract Changes

None. The cockpit reads the existing contracts; oms-core and oms-contracts are unchanged.

## Data & Persistence

None in the OMS (no tables, no Liquibase).

The cockpit side:
- the new tracked files `developer-cockpit/api-templates/*.http`;
- the new config key `infrastructure.apiTemplateSources`, which defaults to `[]` through the
  existing merge, so no migration is needed;
- appends to `.http` files, but only by an explicit Save as template.

## Events & Messaging

None. The commands sent are ordinary `/api/command/execute` requests. oms-core records them as
before, and the cockpit publishes nothing.

## Domain, State & Orchestration

None. No OMS state machine or task pipeline changes. Templates only produce request bodies, which
oms-core validates and processes as usual (e.g. an `OrderAcceptCmd` on a REJ order is still
refused by oms-core).

## Alternatives & Decisions

- **Templates are REST Client `.http` files.**
  - Alternatives considered:
    - (a) the cockpit's own JSON template format plus a one-way `.http` importer;
    - (b) templates stored in the cockpit config (per user).
  - (a) gives two formats to keep in sync, and the imported copies drift from `rest.http`.
  - (b) isn't shared through git.
  - With `.http`, one file serves both tools, and "import" is "add the file as a source".
- **Variables are resolved in the renderer, at send time.**
  - Alternative: resolve in main.
  - The renderer already owns the follow-up `orderId` and the body check. Main then receives and
    records the exact body sent, with no change to the send path or the history.
- **The template's own URL is ignored.**
  - Alternative: send to the URL in the block.
  - That would bypass the configured target and the SPEC-0007 host guard.
- **Saving appends only.**
  - Alternative: rewrite the file with an updated block.
  - Rewriting risks clobbering hand-written comments and formatting. Users edit and delete blocks
    in their editor.
- **The watcher takes the extra sources through `setExtraPaths`, called on config save.**
  - Alternative: a second chokidar watcher inside `ApiTemplateService`.
  - That would mean two watcher lifecycles and a duplicate event path. Alternative: reload only
    when the tab opens. That doesn't meet AC-2 for changes made while the tab is open.
- **A file variable named `orderId` overrides the followed order.** This is REST Client's meaning
  of an explicit declaration; the starter files don't declare it.
- **No new dependency.**
  - `crypto.randomUUID` (available in Electron's renderer), the existing chokidar, and the Radix
    dialog already in `components/ui`.
  - The parser covers only the REST Client subset listed (P-17).

- **Changed during implementation (review finding 1).** Save as template defaults to the file the
  template came from. File variables that the target file doesn't declare are written into the
  saved body as their values (`inlineFileVariables`), so the saved template still resolves there.
  System variables stay as variables. Rejected alternative: refuse the save. That would force users
  to edit the target file first, for no gain.
- **Changed during implementation (review findings 2–4).**
  - The duplicate-name check uses the names the list shows, including `<type> #n`
    (`effectiveNames` in `shared/httpFile.ts`).
  - Variables are resolved after the non-local confirmation, so the time is the send time.
  - `orderToTemplate` also drops `expireTime`, because the old order's expiry is usually in the
    past.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A save corrupts a hand-edited `.http` file | Append only. The byte-preservation test compares the old content with the new prefix. Path whitelist, and `wx` for new files. |
| The renderer asks main to write an arbitrary file | `save` accepts only paths `list()` returns, or a bare `*.http` file name inside `api-templates`. Tested. |
| Parse errors point at the resolved text, not the template | The resolved text differs only inside `{{…}}`, and errors name the JSON path. Placeholder-resolved check in the list catches broken templates early. |
| Starter templates go stale when the simulator's symbols or prices change | AC-7 test checks the templates against the contracts. The runtime check exercises INTC. The simulator warnings ticket will check prices. |
| A numeric variable unquoted in JSON (`"orderQty": {{qty}}`) makes Monaco show a JSON error | Accepted. The cockpit's own check runs on the resolved text, and the starter files quote all variables or use literal numbers. |
| `{{$guid}}` used for `commandId` hides an intended duplicate test | Templatize is optional (switch in the dialog), and literal ids are kept as written. |

## Test Strategy

All tests run from `developer-cockpit/` with Vitest.

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit | test/shared/httpFile.test.ts#"parses requests, names, comments and file variables" | Blocks split on `###`; `# @name`, `// @name` and comment names; GET/bare-URL lines; headers vs body; variables; line numbers; CRLF |
| AC-1 | unit | test/renderer/api-templates.test.ts#"classifies command blocks by type and reports unusable ones" | Execute POSTs are listed under their type, with name fallbacks to comment and then `<type> #n`; GET and other paths ignored; invalid JSON and unknown type are unusable with a reason |
| AC-1 | component | test/renderer/ApiExplorer.templates.test.tsx#"lists templates under their command type and loads one" | Nav shows the template under its type; clicking it puts its body in the editor; the unusable block and its reason are shown |
| AC-2 | unit (main) | test/main/ApiTemplateService.test.ts#"lists shared and extra sources and marks a missing one" | Files from `api-templates` and an extra file; the missing extra is `missing`, the others still listed; changes on disk show on the next `list()` |
| AC-2 | unit (main) | test/main/WatcherService.test.ts#"watches api-templates and the extra template paths" | The watch list includes `developer-cockpit/api-templates`; `setExtraPaths` adds new paths and unwatches the old ones (also before `start`) |
| AC-2 | component | test/renderer/ApiExplorer.templates.test.tsx#"reloads templates on a .http file event" | A `file:changed` event for a `.http` path makes the list show the new template |
| AC-3 | unit | test/renderer/api-templates.test.ts#"resolves system, file and orderId variables" | `$guid` differs per occurrence; `$datetime iso8601` and `$timestamp` from the clock; `$randomInt 1 100` in range; nested file variable; `orderId` from context, overridden by a file variable |
| AC-3 | component | test/renderer/ApiExplorer.templates.test.tsx#"sends the resolved body with fresh values each time" | With an order followed, two Sends call `sendCommand` with fully resolved bodies, different `clOrdId`s and the followed `orderId`. Main records what it receives (apiExplorer.ipc test asserts that history stores the body passed in) |
| AC-4 | unit | test/renderer/api-templates.test.ts#"reports unresolved variables" | An undeclared name, an unsupported `$` function, and `orderId` without context each give `unresolved` and a finding |
| AC-4 | component | test/renderer/ApiExplorer.templates.test.tsx#"does not send a body with unresolved variables" | Send is disabled, the findings name `{{orderId}}`, and `sendCommand` is not called; a forced `send()` makes no call either |
| AC-5 | unit (main) | test/main/ApiTemplateService.test.ts#"appends a template block without changing existing bytes" | The new content starts with the old bytes (also with no trailing newline and with CRLF); parsing gives the template with that body; `{{baseUrl}}` used only when declared |
| AC-5 | unit (main) | test/main/ApiTemplateService.test.ts#"refuses a duplicate name, an unknown path and an existing new file" | The file is unchanged in each case; the error is returned |
| AC-5 | unit | test/renderer/api-templates.test.ts#"templatize replaces per-send fields" | `clOrdId` and `commandId` become `{{$guid}}`, `sendingTime` and `transactTime` become `{{$datetime iso8601}}`, at the top level and under `order`/`execution`; other fields untouched |
| AC-5 | component | test/renderer/ApiExplorer.templates.test.tsx#"saves the editor body as a template" | The dialog calls `saveTemplate` with name, target and the templatized body; a main error is shown and the dialog stays open |
| AC-6 | unit | test/renderer/api-templates.test.ts#"orderToTemplate keeps client fields and drops server fields" | From a query-API order: client fields kept; `orderId`, `state`, `cancelState`, `txNr`, `cumQty`, `leavesQty` dropped; `clOrdId`/times are variables; resolved body passes `checkBody` against the repo catalog |
| AC-6 | component | test/renderer/ApiExplorer.followup.test.tsx#"Use as template fills an OrderCreateCmd body from the order" | The follow-up button switches to Commands with the body; the Orders tab's follow-up shows the same button |
| AC-7 | unit | test/renderer/api-templates.test.ts#"starter templates cover every command type and pass the check" | Reads `developer-cockpit/api-templates/*.http`; each catalog command type (from the repo contracts) has a template; each resolves (sample orderId) without unresolved names and with no findings |
| AC-7 | runtime | T-runtime check (built app over CDP, Docker stack) | "INTC limit buy" sent → 201; the follow-up shows the order not REJ (LIVE/FILLED) |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | comply | No contract copies. The templates are request examples, not schemas, and are checked against the contracts in oms-contracts. |
| P-02 | Specification before code, generated models only | comply | Command types, the field lists for Use as template and the body checks all come from the contracts at runtime. AC-7 tests the starter templates against them. |
| P-03 | Never edit generated code | n/a | No generated code involved (TypeScript cockpit only). |
| P-04 | Contracts evolve compatibly | n/a | No contract change. |
| P-05 | Every state change is recorded in the event log | n/a | The cockpit changes no order state; oms-core records every command it receives. |
| P-06 | Kafka only through the transactional outbox | n/a | No Kafka in the cockpit. |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database. |
| P-08 | Concurrency and idempotency are explicit | comply | Saves are append-only from the single main process, with `wx` for new files. Sends aren't retried. `{{$guid}}` for `commandId` is an explicit opt-in (the save switch), and literal ids stay as written, so a duplicate-command test is still possible. |
| P-09 | Commands and queries stay separate | comply | Templates are for commands only. Query blocks in `.http` files are ignored, and the Orders tab is unchanged. |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No transitions implemented here. |
| P-11 | Layering and conventions | comply | As in SPEC-0007: a pure parser in `shared/`, pure logic in `renderer/lib/`, file I/O in a main service behind IPC, state in the zustand store, dialog from `components/ui`. |
| P-12 | Jackson 3 only | n/a | TypeScript only. |
| P-13 | Errors and validation follow the framework specs | comply | Unusable templates, missing sources, unresolved variables and refused saves are each shown with their reason. IPC returns errors and never throws, and oms-core's error bodies are shown as before. |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Every AC is mapped above, with tests written red first. AC-7 also has a runtime check. |
| P-15 | Observability | comply | `[api-explorer]` log line per template save; sends keep their existing log line. |
| P-16 | Security | comply | Main writes only to listed template sources, or to new `*.http` files in `api-templates`: path whitelist, file name pattern, no overwrite. Templates can't change the target host (the URL is ignored; host guard unchanged). No secrets in the starter files. |
| P-17 | Simplicity and dependencies | comply | No new dependency. The REST Client subset is parsed by about 80 lines of our own code, and append-only writes. |
| P-18 | Modules build standalone | comply | developer-cockpit verify (`npm run typecheck`, `npm test`); OMS modules untouched. |
| P-19 | Documentation follows behaviour | comply | Cockpit spec pages updated (below); the starter folder has a short README block in `orders.http`. |

## Knowledge Base Updates

None in `oms-knowledge-base/`, since OMS behaviour doesn't change. Cockpit docs:

- `developer-cockpit/spec/03-features.md`, API Explorer section:
  - templates, sources and variables;
  - Save as template and Use as template.
- `developer-cockpit/spec/04-backend-services.md`:
  - ApiTemplateService;
  - the `apiExplorer:templates`/`saveTemplate` channels;
  - `WatcherService.setExtraPaths`.
- `developer-cockpit/spec/05-data-model.md`:
  - `infrastructure.apiTemplateSources`;
  - the `.http` template format (the supported subset and variables).
