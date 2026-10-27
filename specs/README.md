# Spec-Driven Development for OMS

A lightweight, dependency-free workflow, modelled on OpenSpec, for taking a change from intent to
verified result. It is built from Markdown documents, one Node script (`specs/tools/spec.mjs`, no
npm packages), Claude Code skills and two hooks.

```
 ticket (goal)
     │
     ▼
 ┌──────────┐ gate ┌──────────┐ gate ┌──────────┐ gate ┌───────────┐ gate ┌──────────┐ gate
 │ proposal │─────▶│  design  │─────▶│   plan   │─────▶│ implement │─────▶│  verify  │─────▶ done ─▶ archive
 └──────────┘  ▲   └──────────┘      └──────────┘      └───────────┘      └──────────┘
   why & what  │    how + policy      ordered,          test-first,        evidence: tests,
   + ACs       │    compliance        traceable tasks   tick on verify     policies, review,
               │                                                           verdict
        human approval (default)
```

## Layout

```
specs/
├── README.md                     this file
├── config.json                   approvals, autopilot limits, git behaviour, per-module verify commands
├── policies/
│   ├── architecture-policies.md  P-01…P-19, the rules every design and verification is judged by
│   └── rules.json                machine-checkable rules behind those policies
├── templates/                    ticket, proposal, design, tasks, verification
├── tools/spec.mjs                CLI, gates and hooks
├── changes/SPEC-NNNN-slug/       active tickets
└── archive/SPEC-NNNN-slug/       finished tickets (the decision record)

.claude/skills/spec-*/SKILL.md    the agent's playbook for each stage
.claude/agents/spec-reviewer.md   independent read-only reviewer used at verify
.claude/settings.json             hook registration
.github/workflows/spec-gates.yml  the same checks on every pull request
```

## Quick start

In Claude Code:

| Command | What happens |
|---|---|
| `/spec-new <what you want>` | creates `specs/changes/SPEC-NNNN-…/` with your goal in `ticket.md` |
| `/spec-run SPEC-NNNN` | autopilot: drafts the proposal, stops for your approval, then designs, plans, implements and verifies to done |
| `/spec-propose`, `/spec-design`, `/spec-plan`, `/spec-implement`, `/spec-verify` | run one stage at a time, reviewing as you go |
| `/spec-archive SPEC-NNNN` | close out, update the knowledge base, draft the PR text |

From any terminal:

```bash
node specs/tools/spec.mjs list
node specs/tools/spec.mjs status SPEC-0003
node specs/tools/spec.mjs approve SPEC-0003        # humans only, the hook blocks agents
node specs/tools/spec.mjs check --all              # audit the whole repo against rules.json
```

`node specs/tools/spec.mjs help` lists every command.

`list`, `status` and `gate` also take `--json` (put it last) for tools that read the workflow. The
text output and exit codes stay the same:

```bash
node specs/tools/spec.mjs list --all --json        # { user, types, tickets: [...], errors: [{ dir, error }] }
node specs/tools/spec.mjs status SPEC-0003 --json  # ticket + goal, log, taskList, gate, evidence { fresh }, next
node specs/tools/spec.mjs gate SPEC-0003 --json    # { stage, pass, errors, warnings, exceptions }
```

`gate` also takes `--draft <file>` (one of `proposal.md`, `design.md`, `tasks.md`,
`verification.md`): it gates as if that document contained the text read from stdin, and writes
nothing. Editors use it to show gate results while you type:

```bash
cat my-draft.md | node specs/tools/spec.mjs gate SPEC-0003 proposal --draft proposal.md --json
```

### In the Developer Cockpit

The cockpit (`developer-cockpit/`) has a **Spec Tickets** view and a spec-workflow overview on its
Dashboard. They show your tickets (owner = `git config user.name`), stage, gate result, task and AC
progress, evidence freshness and the documents, and refresh live when files under `specs/` change.
The current stage's document can be edited there, with the gate re-checked as you type
(`gate --draft`), and tasks can be ticked at the implement stage; `ticket.md` stays CLI-only.
Its buttons run the same CLI commands (new, advance, reopen, block/unblock, note, autopilot,
approve), so every rule above applies unchanged. **Approve** there is a human action: it asks for
confirmation, is only offered while a stage is awaiting approval, and records the git user as
approver. The cockpit's WebSocket and AI features cannot trigger it. See
`developer-cockpit/spec/03-features.md` §1.

## The documents

| File | Stage | Owner | Gate checks |
|---|---|---|---|
| `ticket.md` | — | requester + CLI | Goal is stated. Frontmatter holds status, modules, approvals; the body ends with an audit log |
| `proposal.md` | 1 | agent | all sections filled; ≥1 `**AC-n**`; no `[open]` questions; modules set |
| `design.md` | 2 | agent | all sections; every AC in Test Strategy; every policy ruled `comply`/`n/a`/`exception` with justification |
| `tasks.md` | 3 | agent | every task has `verify:`; every AC covered by a task |
| *(implementation)* | — | agent | all tasks ticked; policy check on the diff passes |
| `verification.md` | 4 | agent + reviewer | every AC PASS with evidence; every policy reviewed; fresh `evidence/last-run.json` that passed; `Verdict: GOAL MET` |

All gates also fail while any `<!-- FILL … -->` marker remains.

## How "done" is established

Most automated workflows stop at "the agent says it's done". This one requires four independent
pieces of evidence before `done`:

1. **Machine evidence.** `spec verify` runs the policy rules and every affected module's build and
   tests, including the consumers of a changed contract (`impacts` in `config.json`). The result
   is stored with a content fingerprint of those modules. Any later code change makes it stale and
   the gate refuses it.
2. **Traceability.** Each AC traces from proposal → design Test Strategy → task → passing test,
   and the agent must cite the test that proves it.
3. **Independent review.** The `spec-reviewer` agent, with fresh context, a read-only toolset and
   a brief to find reasons it is not done, judges goal, ACs and policies.
4. **Goal assessment.** The result is compared with the requester's original words in `ticket.md`,
   not only with the ACs the agent wrote.

## Human gates and autonomy

You choose how much autonomy to give in `specs/config.json`:

- `approvals.<stage>: true` means the ticket stops after that stage's gate passes until a human runs
  `spec approve`. The default asks only for **proposal** approval, the one place where a human
  confirms *what* is being built. Everything after that is checked by evidence. Set
  `"verify": true` as well if you want to sign off on every result.
- A design that declares a policy `exception` **always** requires approval, whatever the config says.
- `autopilot.maxIdleStops`: how often the Stop hook may push a stalled agent before it gives up and
  switches autopilot off.
- `autopilot.maxGateAttempts` / `maxVerifyAttempts`: when the agent should block instead of
  retrying.
- `git.branchPerTicket`: create `spec/<id>-…` when implementation starts. `git.commitPerTask`:
  commit after each task (off by default; CLAUDE.md asks for human review before committing).

## Hooks (`.claude/settings.json`)

| Hook | Always | Only while a ticket is on autopilot |
|---|---|---|
| PreToolUse | blocks edits to `build/generated*` (P-03), to stray `src/main/{openapi,avro}` outside oms-contracts (P-01), to `ticket.md` and `evidence/`; blocks `spec approve` from the agent | blocks code edits in `oms-*` modules before the plan gate passes; blocks edits to policies, templates, tools and config |
| Stop | — | refuses to let the agent stop before the ticket is done, awaiting approval or blocked |

The hooks are guardrails against an agent drifting, not a security boundary. A determined shell
command can still change files.

`specs/tools/settings-hooks.json` is the reference registration (it also allows
`node specs/tools/spec.mjs` without permission prompts). Copy it to `.claude/settings.json` to
enable the hooks, merging with any settings already there.

## Policies

`policies/architecture-policies.md` is the single list of architecture rules. Designs rule on each
policy and verifications review each one. Policies with a mechanical check have a rule in
`rules.json`:

| Rule type | Meaning |
|---|---|
| `forbid-path` | no file matching `paths` may exist in the change |
| `forbid-pattern` | no **added line** in matching files may match `pattern` |
| `immutable` | matching files may not be modified, deleted or renamed (e.g. applied changelogs) |
| `warn-on-change` | flag changes to matching files for review |
| `require-change` | if `paths` change in a module, something matching `then` must change too (`{module}` placeholder) |

`spec check` looks only at the change since the base branch, so existing debt does not block a
ticket. `spec check --all` audits the whole repository. Today it reports the Jackson 2
`ObjectMapper` in `JsonHelper` and `ddl-auto: create-drop` in `application-dev.yml`.

## Extending

- **New policy:** add a `### P-NN — Title` section to `architecture-policies.md`, plus a rule in
  `rules.json` if it can be automated. New tickets get the row automatically.
- **New module:** add it to `config.json` → `modules` with its `verify` commands (and `cwd` if the
  build does not run from the module root).
- **Different tracker:** `ticket.md` has a `beads` field; `spec set <id> beads <id>` links an issue.
