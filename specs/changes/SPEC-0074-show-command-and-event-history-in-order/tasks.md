# Tasks — SPEC-0074: Show command and event history in order detail

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Write failing `OMSApiService.test.ts` cases for `getOrderEvents` / `getOrderCommands` (paths, encoded orderId, null body → []), then add the `OrderEventEntry` / `CommandLogEntry` types and the two methods (AC-1)
  - files: oms-ui/frontend/src/services/OMSApiService.test.ts, oms-ui/frontend/src/services/OMSApiService.ts, oms-ui/frontend/src/types/types.ts
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/services/OMSApiService.test.ts` passes
- [x] **T-2** Write failing `orderHistory.test.ts` (join by eventVersion and the commandId fallback; refused and failed commands placed by receivedAt; versions in order), then implement `buildTimeline` (AC-2, AC-3)
  - files: oms-ui/frontend/src/services/orderHistory.test.ts, oms-ui/frontend/src/services/orderHistory.ts
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/services/orderHistory.test.ts` passes
- [x] **T-3** Extract `formatValue` from `DetailPanel` into a `FieldValue` component with identical output; the existing DetailPanel tests stay green (AC-4)
  - files: oms-ui/frontend/src/components/FieldValue.tsx, oms-ui/frontend/src/components/DetailPanel.tsx
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/components/DetailPanel` passes
- [x] **T-4** Write failing `JsonTree.test.tsx` (typed leaves, collapsed until expanded, Enter and Space toggle with `aria-expanded`, copy puts the raw JSON on the clipboard), then implement `JsonTree` and its styles (AC-5)
  - files: oms-ui/frontend/src/components/JsonTree.test.tsx, oms-ui/frontend/src/components/JsonTree.tsx, oms-ui/frontend/src/components/JsonTree.scss
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/components/JsonTree.test.tsx` passes
- [x] **T-5** Write failing `OrderHistory.test.tsx` (events with their metadata in order, the causing command on its event, refused entries, the changes list, error with retry, empty state, refresh), then implement `OrderHistory` and its styles (AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8)
  - files: oms-ui/frontend/src/components/OrderHistory.test.tsx, oms-ui/frontend/src/components/OrderHistory.tsx, oms-ui/frontend/src/components/OrderHistory.scss
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/components/OrderHistory.test.tsx` passes
- [x] **T-6** Write failing `DetailModal.test.tsx` cases (no history fetched until the History tab is selected; no tabs for an execution), then add the Details and History tabs to `DetailModal` for orders (AC-8, AC-9)
  - files: oms-ui/frontend/src/components/DetailModal.test.tsx, oms-ui/frontend/src/components/DetailModal.tsx, oms-ui/frontend/src/components/DetailModal.scss
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/components/DetailModal.test.tsx` passes
- [x] **T-7** Knowledge base: an order History view section in `ui/admin-ui.md` (AC-10)
  - files: oms-knowledge-base/ui/admin-ui.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-8** Run spec verify (all ACs)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0074` exits 0

- [x] **T-9** Review fixes. Tests: a real Enter and Space key test, a failed commands request and a network error, Details working after a history error, `from: null` and timestamp changes. Code: a cleared value shows "—", string leaves are escaped, refresh keeps the list, the unused `FieldValue` component is dropped (AC-4, AC-5, AC-6, AC-8)
  - files: oms-ui/frontend/src/components/{JsonTree,OrderHistory,DetailModal}.test.tsx, oms-ui/frontend/src/components/{JsonTree,OrderHistory,FieldValue}.tsx
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false src/components` passes

## Notes

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->
- **First `spec verify` failed** on two SPEC-0058 style rules: the `font` shorthand, and outcome classes built with template strings. Both were fixed (design, Changed during implementation), and the second run passed: 313 of 313.
- **The `docker-compose.yml` warning (R10)** comes from the peer session's uncommitted SPEC-0073 work in the same tree, not from this ticket.
