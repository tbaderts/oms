---
name: spec-propose
description: Stage 1 of the OMS spec workflow. Write proposal.md for a spec ticket (why, what changes, scope, testable acceptance criteria, impact, open questions) and pass the proposal gate. Use when a ticket is at the proposal stage or the user asks to draft or refine a proposal.
argument-hint: "<ticket id, e.g. SPEC-0003>"
---

# Stage 1: Proposal (why and what)

`spec` means `node specs/tools/spec.mjs`. Ticket: $ARGUMENTS (if empty, `spec list` and pick the
single active ticket, or ask).

The proposal fixes **what success means**. Everything later (design, plan, verification) traces
back to its acceptance criteria, so precision here is what makes autonomy possible later.

## 1. Understand before writing

- `spec status <id>`, then read `ticket.md` → Goal. It is the requester's intent; do not reinterpret it.
- Read what already exists. Do not guess:
  - the relevant concept pages in `oms-knowledge-base/oms-concepts/` and framework specs in
    `oms-knowledge-base/oms-framework/` (grep for the domain terms in the goal);
  - `openwiki/quickstart.md` if it exists;
  - the contracts in `oms-contracts/src/main/openapi/` and `oms-contracts/src/main/avro/`;
  - the code paths involved (controllers in `oms-core/.../api`, processors in
    `.../service/command`, tasks, state machine config, entities).
- Note how the system behaves **today** for the scenario in the goal. The Why section needs that.

## 2. Write `proposal.md`

Replace every `<!-- FILL … -->` marker. Section rules:

- **Why**: problem, who it affects, evidence, cost of doing nothing.
- **What Changes**: observable changes only. Mark **BREAKING** changes and name the consumers.
- **Scope**: be explicit about non-goals; they are what stops gold-plating later.
- **Acceptance Criteria**: the contract. Each one is
  `- **AC-n** — Given <context>, when <action>, then <observable outcome>.`
  - Testable by an automated test with no judgement call; observable from outside (HTTP response,
    row in `orders`/`order_events`, message on a topic, metric).
  - Cover the unhappy paths that matter in an OMS: invalid input, illegal state transition,
    duplicate delivery (idempotency), concurrent update (`txNr`), unknown order.
  - Add non-functional criteria with a number when the change affects latency, throughput or
    observability.
  - Aim for the smallest set that proves the goal; 3–8 is typical.
- **Impact**: fill every row; "none" is a valid answer. Then record the modules:
  `spec set <id> modules oms-contracts,oms-core` (names from `specs/config.json`).
- **Open Questions**: `[open]`, `[resolved] … → answer`, or `[deferred] … → why safe`.
  - Interactive: ask the user the `[open]` ones, all at once, then record the answers.
  - Autopilot: resolve a question yourself only if a reasonable answer is cheap to reverse; record
    it as `[resolved] … → assumption: …`. If the answer changes the goal, the money/risk semantics
    or a public contract, leave it `[open]`. The proposal approval is where a human sees it.

## 3. Gate

```bash
node specs/tools/spec.mjs advance <id>
```

- Exit 1: fix every `ERROR` and re-run. Treat `WARN`s seriously, since a non-GWT AC usually means
  it is not testable.
- Exit 3: the proposal needs human approval (the default). Stop and give the user a short summary:
  the goal, the ACs, scope cut-offs, assumptions made, and any `[open]` items. Ask them to review
  `proposal.md` and run `node specs/tools/spec.mjs approve <id>` in their own terminal (or
  `! node specs/tools/spec.mjs approve <id>` in the Claude Code prompt). **Never run approve
  yourself**; the hook blocks it anyway.
- Exit 0: the ticket is at design. Continue with `spec-design` if on autopilot.
