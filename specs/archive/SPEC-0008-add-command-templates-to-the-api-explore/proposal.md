# Proposal — SPEC-0008: Add command templates to the API Explorer

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The API Explorer (SPEC-0007) gives a schema skeleton per command type: required fields only, with
empty or first-enum values. To create an order that oms-core accepts and the exchange simulator
fills, a developer still has to type about twenty fields: `sessionId` (required by oms-core but not
by the contract), a symbol and a price inside the simulator's band, `securityId` and the venue fields.
The working bodies already exist, but only in `oms-core/rest.http`, for the VS Code REST Client,
and nothing in the cockpit can read them.

Bodies kept by hand also go stale. A restored or copied body repeats its `clOrdId` and its old
`sendingTime`/`transactTime`. Lifecycle commands need the current `orderId` pasted in (rest.http uses
`<orderId>` placeholders). On 2026-10-27 an order created from rest.http was rejected because a field
had been mistyped (`"symbol": "SELL"`). This is the kind of slip that ready, tested templates
prevent.

If nothing is done, the Explorer is slower to use than the REST Client file it was meant to
replace, and every developer keeps their own private copy of the bodies.

## What Changes

- **Templates are `.http` files** in REST Client format, so the same file works in VS Code and in
  the cockpit. Each `POST …/api/command/execute` block with a JSON body is one template. Its name
  comes from `# @name`, or from the comment line above the request.
- **Template sources.** The default is a new folder `developer-cockpit/api-templates/`, shipped with
  starter templates. Further `.http` files, such as `oms-core/rest.http`, can be added as sources in
  Settings. They are read in place, not copied, which is how ".http import" works.
- **The Commands tab lists templates** under each command type, next to the existing schema
  skeleton. Picking one loads its body into the editor. The list reloads when a source file changes.
- **Variables are resolved at send time**, in REST Client syntax:
  - `{{$guid}}`, `{{$datetime iso8601}}`, `{{$timestamp}}` and `{{$randomInt min max}}`;
  - file variables (`@name = value`) declared in the same file;
  - `{{orderId}}`, which is the order currently followed in the Explorer.

  The body check and the sent body use the resolved text, and History stores the resolved body.
- **Save as template** writes the current editor body as a new named block, appended to a chosen
  template file. When saving, `clOrdId` and the time fields can be replaced with variables.
  History entries and orders gain the same action:
  - **Restore**, then save;
  - **Use as template** on an order builds an `OrderCreateCmd` body from the order's client
    fields.
- No **BREAKING** changes. oms-core, the contracts and other modules are unchanged.

## Scope

### In scope

- Reading templates from `.http` files: parsing requests, names, comments and file variables. Only
  command-execute requests become templates.
- The template list in the Commands tab, the live reload, and the template sources setting.
- Resolving the variables listed above at send time, and reporting unresolved ones.
- Save as template from the editor, from History (through Restore) and from an order (Use as
  template).
- Starter templates in `developer-cockpit/api-templates/`:
  - for every command type in the catalog;
  - the `OrderCreateCmd` ones use symbols and prices that the exchange simulator accepts.

### Out of scope

- Simulator-aware pre-send warnings (unknown symbol, price outside the band). These come in a
  separate ticket.
- Multi-step scenarios (create → accept → fill as one run).
- Templates for GET/query requests. The Orders tab keeps its own filter builder, and non-command
  blocks in a `.http` file are skipped.
- Editing or deleting existing template blocks from the cockpit. Users edit the file in their
  editor; the cockpit only appends.
- REST Client features beyond the listed variables: environments, `{{$dotenv}}`, request
  variables from responses, `{{$processEnv}}`.
- Changing `oms-core/rest.http`, and the `sessionId` contract mismatch (SPEC-0007 follow-up 1).

## Acceptance Criteria

- **AC-1** — Given a template source `.http` file with several requests, when the Commands tab
  loads, then each `POST` to `/api/command/execute` whose JSON body has a `type` that is a catalog
  command type appears under that type with its `# @name` (or the comment line above it, otherwise
  `<type> #n`). Other requests (GET, other paths) are not listed. A command block whose body is not
  valid JSON or names an unknown type is listed as unusable, with the reason.
- **AC-2** — Given a template source file, when it is changed, added or removed on disk, then the
  Commands tab's template list reflects the change without restarting the app. A source configured
  in Settings that does not exist shows as missing, and the other sources still load.
- **AC-3** — Given a template whose body uses `{{$guid}}`, `{{$datetime iso8601}}`, `{{$timestamp}}`,
  `{{$randomInt 1 100}}`, a file variable `{{account}}` declared as `@account = account-01`, and
  `{{orderId}}` while an order is followed, when it is sent twice, then oms-core receives bodies with
  every variable replaced: `{{$guid}}` gives a different UUID per send, the time is the send time in
  UTC ISO-8601, the file variable has its value, and `orderId` is the followed order's id. The
  History entry stores the resolved body.
- **AC-4** — Given a body that uses an undeclared variable, or `{{orderId}}` with no followed order,
  when the user tries to send it, then no request is made. A finding names each unresolved variable.
- **AC-5** — Given a body in the editor, when the user saves it as a template named N into a source
  file, then that file gains one block (`###`, `# @name N`, the execute request and the body), and
  every byte that was in the file before is unchanged. If the user chose to, `clOrdId` and
  `sendingTime`/`transactTime` are written as `{{$guid}}` and `{{$datetime iso8601}}`. Reading the file
  back gives a template N with that body. A name already used in that file is refused, and the
  file is not written.
- **AC-6** — Given an order shown in the follow-up or in the Orders tab, when the user chooses
  **Use as template**, then the editor holds an `OrderCreateCmd` body with the order's client fields.
  Server-assigned fields (`orderId`, `state`, `cancelState`, `txNr`, `cumQty`, `leavesQty`, `avgPx`,
  and the like) are dropped, `clOrdId` and the times are fresh, and the body passes the body check.
- **AC-7** — Given the starter templates in `developer-cockpit/api-templates/`, when they are parsed
  and resolved (with a sample `orderId`), then each catalog command type has at least one template
  and every one passes the body check against the repository's contracts. Against a running stack,
  the `OrderCreateCmd` starter for INTC is answered 201 by oms-core and is not rejected by the
  exchange simulator.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit only (main: template source reading/writing and watching; renderer: Commands tab, follow-up, Orders, Settings) |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none in the OMS. New repo files `developer-cockpit/api-templates/*.http`; a new cockpit config key for extra template sources |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none. The starter `.http` files are also usable directly in VS Code REST Client |
| Knowledge base | developer-cockpit/spec/03-features.md (API Explorer: templates), 04-backend-services.md, 05-data-model.md (template file format, config key) |

## Open Questions

- [resolved] Should templates have their own JSON format, or use `.http` files? → `.http` files in
  REST Client syntax. One format serves both tools, and "import" becomes "add the file as a
  source". It is cheap to reverse, because the parser and writer sit behind one service.
- [resolved] Where do shared templates live? → assumption: `developer-cockpit/api-templates/`
  (in git, shared with the team); extra files come through Settings. They could move to a
  repository-root folder later without other changes.
- [resolved] Which host do templates send to? → assumption: the request URL in a template is
  ignored, and the cockpit always sends to its configured oms-core URL, so the SPEC-0007 host guard
  still applies. Saved blocks use `{{baseUrl}}` with `@baseUrl` declared in the file, so they also
  run in VS Code.
- [resolved] Is `oms-core/rest.http` a default source? → No, because its `<orderId>` placeholders are
  not variables. The starter templates cover its bodies with variables instead. A user can still add
  it in Settings.
- [deferred] Simulator-aware pre-send warnings → separate ticket. Templates make the common case
  correct already.
