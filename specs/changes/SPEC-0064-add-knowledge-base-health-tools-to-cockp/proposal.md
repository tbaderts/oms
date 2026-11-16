# Proposal — SPEC-0064: Add knowledge base health tools to cockpit

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The knowledge base is an OKF bundle of about 200 documents, and since SPEC-0061 every document
carries front matter. The front matter holds its type, status, description, tags, `updated`, its
`repo:` sources, aliases and, for requirements, priority and implementation. The Developer
Cockpit's knowledge base explorer does not show any of it.
- `DocumentViewer.tsx` shows only the title, the top-level folder and the file's modification
  date.
- The reader cannot see whether a page is a draft, deprecated, when it was reviewed, or which code
  it describes.

The health of the knowledge base is only visible on the command line:
- `tools/okf-check/okf-check.mjs` reports rule violations, including folder `index.md` files that
  do not link a document (`OKF-INDEX`).
- Nothing fixes those indexes; they are edited by hand.
- Nothing gives an overview: how many documents of each type and status, or how many requirements
  are implemented.
- Nothing warns about content going out of date, such as a page not reviewed for months, or a page
  whose source code changed after the page was last updated.

The checker has a `warnings` list, but no rule produces a warning.

If nothing is done:
- readers keep opening pages without knowing whether they can trust them;
- broken indexes are found only when someone runs the checker;
- outdated pages are found by accident.

The goal asks for exactly these:
- the front matter shown in the explorer;
- a status check;
- an index fix;
- statistics by type;
- warnings for outdated content.

## What Changes

- **Front matter in the explorer.** Opening a document in the cockpit's Knowledge Base view shows
  its metadata above the text:
  - type, status and description;
  - `updated` and tags;
  - sources, with `repo:` paths shown as paths;
  - aliases and `superseded_by`;
  - any other keys, such as a requirement's priority and implementation.

  Deprecated and draft documents are marked so at a glance.
- **Status and statistics (checker).** `okf-check` gains a machine-readable report (`--json`):
  - its errors and warnings;
  - statistics: documents by type, by status, by top-level folder, requirements by implementation
    and priority, and documents by review age.

  The text output and exit codes stay as they are.
- **Outdated-content warnings (checker).** New warning rules, which never fail the check:
  - a document not updated for longer than a review period set in `okf-conventions.md`;
  - a document whose `stale_after` date has passed;
  - a document with a `repo:` source committed later than the document's `updated` (the code
    changed after the page was written);
  - a `deprecated` document outside `archive/`.
- **Index fix (checker).** A fix mode adds the missing links to a folder's `index.md`: each
  concept or sub-folder index the check reports as unlinked gets one list entry with its title and
  description.
  - It never removes or rewrites existing text.
  - A dry run shows the changes first.
  - It creates a missing `index.md` for a folder that holds documents.
- **Health panel (cockpit).** A "Health" panel in the Knowledge Base view shows the report:
  - the statistics;
  - the errors and warnings, grouped by rule, each opening its document;
  - a "Fix indexes" action that previews the index changes, applies them, and re-runs the check.
- **Knowledge base pages** describing the new checker rules and the cockpit features are updated.

No **BREAKING** change. The checker's current output and exit codes are unchanged.

## Scope

### In scope

- `tools/okf-check/`: the JSON report, statistics, warning rules, index fix, and their tests.
- `developer-cockpit`: front matter display, the Health panel with Fix indexes, the IPC to run
  the checker, and tests.
- `oms-knowledge-base`:
  - a review-period setting in `okf-conventions.md`;
  - updated pages: `tools/developer-cockpit.md`, the checker's README or KB page, and
    `semantic-layer` guidance;
  - `log.md`;
  - the result of running the index fix once, if the check reports missing links.

### Out of scope

- Fixing content of out-of-date pages. The warnings point at them; reviewing them is separate
  work.
- Automatic fixes other than index links (front matter, broken links, vocabulary).
- The separate `oms-kb-explorer` web app. The goal names the developer-cockpit explorer.
- Editing front matter from the cockpit.
- Adding the checker to the spec gate configuration (`specs/config.json`). That is human-only and
  tracked as TD-14.

## Acceptance Criteria

Checker criteria are proven by `tools/okf-check` tests (`node --test`) on fixture bundles; cockpit
criteria by the developer-cockpit Vitest suite.

- **AC-1** — Given a document with front matter, when it is opened in the Knowledge Base view, then
  the following are shown:
  - its type, status, description, `updated` (as a date) and tags;
  - every source;
  - aliases and `superseded_by` when present;
  - every other front matter key with its value.

  A `deprecated` or `draft` status is visibly marked. A document without front matter shows no
  metadata block, and no error.
- **AC-2** — Given a bundle, when `okf-check <bundle> --json` runs, then it prints one JSON object
  with `errors`, `warnings` (each with file, rule and message) and `stats`. The exit code equals the
  text mode's. Without `--json`, the output is unchanged.
- **AC-3** — Given a fixture bundle with known contents, when the report is built, then `stats`
  contains these exact counts:
  - documents in total, by `type`, by `status` and by top-level folder;
  - requirements by `implementation` and by `priority`;
  - documents by review age: updated within the review period, older, or without `updated`.

  `index.md` and `log.md` are not counted as documents.
- **AC-4** — Given `review_after_days` in `okf-conventions.md`, when the checker runs on a fixture
  bundle, then it warns as follows, with each rule tested by a fixture that triggers it and one that
  does not:
  - `OMS-AGE`: a non-archived document whose `updated` is older than that many days;
  - `OMS-STALE`: a document whose `stale_after` is in the past;
  - `OMS-DEPRECATED`: a `deprecated` document outside `archive/`;
  - `OMS-DRIFT`: a non-archived document with a `repo:` source whose last git commit is later than
    both the document's `updated` and the document's own last git commit. A page committed
    together with its code, or after it, counts as reviewed. Folder sources use the newest file
    under them.

  Warnings never change the exit code.
- **AC-5** — Given a folder whose `index.md` misses links to concepts or sub-folder indexes, when
  the index fix runs as a dry run, then it lists the entries it would add and changes no file.
  When it is applied:
  - each missing link is added as one list entry with the target's title and description;
  - all existing text is kept byte for byte;
  - a folder with documents but no `index.md` gets one;
  - the check then reports no `OKF-INDEX` error;
  - a second run changes nothing.
- **AC-6** — Given the Knowledge Base view, when the Health panel is opened, then it shows:
  - the statistics from the report;
  - the errors and warnings grouped by rule, with counts.

  Clicking a finding opens its document in the explorer. While the check runs, a loading state is
  shown, and a checker failure is shown as an error message.
- **AC-7** — Given index errors in the report, when "Fix indexes" is chosen, then the planned
  changes are shown before anything is written. After confirmation:
  - the fix is applied;
  - the checker re-runs;
  - the panel and the document tree refresh.

  Cancelling writes nothing.
- **AC-8** — Given the cockpit configuration's workspace and knowledge base path, when the Health
  panel or Fix indexes runs, then the cockpit executes the repository's `tools/okf-check` CLI (one
  implementation of the rules) with that knowledge base path, and does not reimplement any rule.
- **AC-9** — Given the whole change, when the checks run, then all of the following pass:
  - the developer-cockpit verify commands (`npm run typecheck`, `npm test`);
  - the `tools/okf-check` tests;
  - `okf-check oms-knowledge-base`, with 0 errors.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit, tools/okf-check, oms-knowledge-base (settings, docs, index fixes) |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | Anyone running `okf-check`: the same output without `--json`, plus new WARN lines. The MCP server reads front matter, which is unchanged |
| Knowledge base | `okf-conventions.md` (`review_after_days`), `tools/developer-cockpit.md`, the checker documentation, `semantic-layer/knowledge-base-strategy.md` (health and warnings), `log.md` |

## Open Questions

- [resolved] How long is "outdated"? → assumption: `review_after_days: 180` in
  `okf-conventions.md`, so it can be changed without code.
- [resolved] Which documents count as outdated?
  - Assumption: those not updated within the review period, past `stale_after`, or whose `repo:`
    source code was committed after their `updated`.
  - Archived documents are exempt from age and drift warnings, because they are point-in-time by
    design.
- [resolved] **Amended after implementation: when does a page drift?** The first approved wording
  compared the source's last commit with the page's `updated` only.
  - On the real bundle that gave 112 warnings. Most were pages committed in the same commit as
    their code, a few hours after their `updated` stamp.
  - The amended rule also counts the page's own last commit, which leaves 1 warning, a genuine
    one.
  - The trade-off: a later unrelated commit to a page, such as a typo fix, also counts as a
    review, so it can hide drift.
  - The alternative is the original rule compared by calendar day: it keeps those cases, but
    flags every page whose code was committed on a later day than its review.
  - Assumption: the amended rule. Reject this proposal with a note if you prefer the
    original or by-day rule; both are a one-line change.
- [resolved] Should warnings fail the checker? → assumption: no. They are signals for review, and
  the checker's exit code keeps meaning "rule violations".
- [resolved] How far may "fix directory index" go? → assumption: only add missing links (and
  create a missing `index.md`). Never remove, reorder or reword existing text: index pages carry
  hand-written prose.
- [resolved] Should the cockpit reimplement the checks? → assumption: no. Like the spec workflow
  (`SpecCli`), it calls the repository CLI, so the cockpit and the command line always agree.
- [resolved] Which explorer? → assumption: the developer-cockpit Knowledge Base view, as the goal
  says. `oms-kb-explorer` is untouched.
