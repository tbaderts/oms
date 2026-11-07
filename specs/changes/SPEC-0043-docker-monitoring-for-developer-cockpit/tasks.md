# Tasks — SPEC-0043: Docker monitoring for developer-cockpit

## Tasks

- [x] **T-1** Add shared Docker types (`DockerContainer`, `DockerStats`, `DockerLogs`) and extend `CockpitAPI` + `InfrastructureConfig` (AC-1, AC-3, AC-7)
  - files: developer-cockpit/src/shared/types/docker.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/src/shared/types/config.ts
  - verify: `cd developer-cockpit && npm run typecheck` exits 0

- [x] **T-2** Implement `DockerService` with injected `execFile` (AC-1, AC-2, AC-3, AC-5, AC-7, AC-8)
  - files: developer-cockpit/src/main/services/DockerService.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/DockerService.test.ts` passes (7 tests)

- [x] **T-3** Write `DockerService` tests (test-first for AC-1, AC-2, AC-3, AC-5, AC-7) (AC-1, AC-2, AC-3, AC-5, AC-7)
  - files: developer-cockpit/test/main/DockerService.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/DockerService.test.ts` passes (7 tests)

- [x] **T-4** Implement `registerDockerIpc` and wire it into `preload.ts` + `index.ts` (AC-3, AC-7, AC-8)
  - files: developer-cockpit/src/main/ipc/docker.ipc.ts, developer-cockpit/src/main/preload.ts, developer-cockpit/src/main/index.ts
  - verify: `cd developer-cockpit && npm run typecheck` exits 0

- [x] **T-5** Write `docker.ipc` tests (test-first for AC-7) (AC-7)
  - files: developer-cockpit/test/main/docker.ipc.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/docker.ipc.test.ts` passes (3 tests)

- [x] **T-6** Implement the `DockerView` renderer component + `docker` Zustand store (AC-1, AC-2, AC-4, AC-6, AC-8)
  - files: developer-cockpit/src/renderer/views/docker/DockerView.tsx, developer-cockpit/src/renderer/stores/docker.ts, developer-cockpit/src/renderer/components/layout/ContentArea.tsx
  - verify: `cd developer-cockpit && npm run typecheck` exits 0

- [x] **T-7** Write `DockerView` tests (test-first for AC-4, AC-6, AC-8) (AC-4, AC-6, AC-8)
  - files: developer-cockpit/test/renderer/DockerView.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/DockerView.test.tsx` passes (3 tests)

- [x] **T-8** Add Docker settings to `SettingsView` (refresh interval, CLI path) (AC-4)
  - files: developer-cockpit/src/renderer/views/settings/SettingsView.tsx
  - verify: `cd developer-cockpit && npm run typecheck` exits 0 and `npx vitest run test/renderer/SettingsView.test.tsx` passes

- [x] **T-9** Update `NFR-007-observability.md` with the new cockpit Docker monitoring note (P-19)
  - files: oms-knowledge-base/non-functional-requirements/NFR-007-observability.md
  - verify: `cat oms-knowledge-base/non-functional-requirements/NFR-007-observability.md | grep -q "developer-cockpit"` and the new paragraph mentions the Docker view

- [x] **T-10** Run full test suite + typecheck, then `spec verify` (all ACs)
  - files: (none — verification only)
  - verify: `cd developer-cockpit && npm run typecheck && npm test` exits 0 and `node specs/tools/spec.mjs verify SPEC-0043` exits 0
