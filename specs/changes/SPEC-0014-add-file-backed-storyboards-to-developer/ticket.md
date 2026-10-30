---
id: SPEC-0014
title: Add file-backed storyboards to developer cockpit
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-29
blocked_from:
blocked_reason:
---

# SPEC-0014 — Add file-backed storyboards to developer cockpit

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Developer Cockpit can discover, read, validate, author, present and export file-backed storyboards
as described in `source-spec.md` (the version already implemented and tested on another platform),
adapted to this repo and reconciled with `developer-cockpit/spec/11-storyboards.md`. Done when
storyboards stored as plain files in the repo open in the cockpit even if they have defects, every
edit is a reviewable file diff, nothing from the browser is used as a filesystem path, and both the
normal and strict content checks pass on the repository's storyboards.

## Log

- 2026-10-29 created
- 2026-10-29 08:51 — proposal gate passed; awaiting human approval
- 2026-10-29 08:51 — proposal approved by Toni Badertscher
- 2026-10-29 08:51 — proposal → design
- 2026-10-29 09:12 — design → plan
- 2026-10-29 09:14 — plan → implement
- 2026-10-29 11:18 — verify run: pass
- 2026-10-29 11:19 — implement → verify
- 2026-10-29 14:10 — verify run: pass
- 2026-10-29 14:11 — reopened at implement: AC-1/AC-7 file-symlink cases are skipped on Windows without Developer Mode; add OS-independent tests that simulate a symlinked story.md and asset via lstat
- 2026-10-29 14:11 — implement → verify
- 2026-10-29 14:12 — verify run: pass
- 2026-10-29 14:23 — reopened at implement: Independent review: linked steps/ and assets/ folders escape the storyboard on write/delete (blocking); step editor rewrites untouched keys; svgSafety misses external refs in presentation attributes, quoted CSS, escapes, image-set, xml:base; plus minor front-matter patching, regex, IPC error and test-coverage findings
- 2026-10-29 14:34 — implement → verify
- 2026-10-29 14:35 — verify run: fail
- 2026-10-29 14:36 — verify run: pass
- 2026-10-29 14:39 — reopened at implement: Re-review: create() writes through a linked domain folder outside the root
- 2026-10-29 14:39 — implement → verify
- 2026-10-29 14:40 — verify run: pass
- 2026-10-29 14:44 — verify → done
