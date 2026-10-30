# Storyboards

A storyboard shows how a process actually runs, step by step, for people who do not read code:
operations leads, analysts, new joiners and workshop participants. Each step is a hand-off of
responsibility between lanes (actors, channels, systems and external parties), with prose, an
optional sketch, links to the contracts, data in and out, and alternate paths.

Storyboards are plain files reviewed in git. Open them in the Developer Cockpit (**Knowledge →
Storyboards**) to read, present, edit and export them. This folder is **not** part of the OKF
knowledge-base bundle: `tools/okf-check` skips it, and storyboards have their own check (below).
The full specification is `developer-cockpit/spec/11-storyboards.md` (SPEC-0014).

## Layout

```text
storyboards/
  _templates/story.md, step.md          scaffolds for the cockpit's "New storyboard" and "Insert step"
  _library/oms-storyboard.excalidrawlib shared sketch stencils (person, OMS box, exchange, …)
  <domain>/<storyboard-id>/
    story.md                            id, title, status, lanes and the step order
    story.card.yaml                     optional evidence card (pinned code, KB links, verification)
    steps/<step-id>.md                  one file per step
    assets/<name>.excalidraw.svg        sketches: plain SVGs that reopen in the editor
```

- Ids are slugs (`a-z`, `0-9`, `-`, at most 64 characters). Step order lives only in `story.md`, so
  reordering never renames files. Alternate-path labels such as `3a` are derived, never stored.
- Illustration `src` values are flat file names inside the storyboard's own `assets/` folder.
- Step prose uses three sections: `## What happens` (it must stand alone, because presentation mode
  reads it), `## Business rules` and `## Notes`.

## Checks

```bash
cd developer-cockpit
npm run check:storyboards            # fails on scan errors, structural errors and broken evidence
npm run check:storyboards -- --strict  # also fails on warnings, drift and storyboards without a card
```

## Evidence and drift

`story.card.yaml` pins the code a storyboard describes: `evidence.repos` names a module folder of this
repository and a commit (always quoted), and `evidence.sources` cites files and line ranges. A
storyboard **drifts** when a cited line range changed in a commit after the pinned one; uncommitted
edits never count. After reviewing a drifted storyboard against the new code, update the prose if
needed and **re-pin**: set every `commit` to the current commit and adjust the line ranges.

Add a `verified` entry with a `human:<id>` actor only after a person has walked the process end to
end; it raises the trust tier to *human-verified*.
