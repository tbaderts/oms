import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { RequirementsService } from '../../src/main/services/RequirementsService';
import { COCKPIT_ROOT } from '../fixtures/workspace';

/** Top-level folders of the knowledge base before SPEC-0061, spelled in parts so reference checks do not flag this file. */
const LEGACY = ['concepts', 'framework', 'methodolgy'].map((s) => `oms-${s}`);

/** A throw-away knowledge base in the SPEC-0061 layout. */
function kb(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-kb-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

const FIXTURE = {
  'capabilities/index.md': '# Capabilities\n',
  'capabilities/order-capture.md': `---
type: Capability
title: "Order Capture"
description: "Taking new orders in."
tags: [orders]
status: draft
maturity: implemented
commands: [OrderCreateCmd]
---
# Order Capture

## Use cases

- [UC-001 Submit an order](use-cases/UC-001-submit-order.md)

## Requirements

- [FR-001 Accept new orders](functional-requirements/FR-001-accept-new-orders.md)
- [NFR-001 Idempotent commands](non-functional-requirements/NFR-001-idempotent.md)
`,
  'capabilities/use-cases/index.md': '# Use cases\n',
  'capabilities/use-cases/UC-001-submit-order.md': `---
type: Use Case
title: "Submit an order"
description: "A trader submits a new order."
tags: [orders]
status: draft
id: UC-001
actors: [/capabilities/actors/trader.md, /capabilities/actors/venue.md]
capability: /capabilities/order-capture.md
---
# UC-001 Submit an order

## Preconditions

- The trader is connected.

## Main Flow

1. The trader sends the order.
2. The OMS validates and stores it.

## Alternative Flows

- Validation fails: the order is rejected.

## Postconditions

- The order is UNACK.

## Requirements

- [FR-001](../functional-requirements/FR-001-accept-new-orders.md)
- [NFR-001](../non-functional-requirements/NFR-001-idempotent.md)
`,
  'capabilities/actors/trader.md': `---
type: Actor
title: "Trader"
description: "Enters and manages client orders."
tags: [actor]
status: draft
kind: human
---
# Trader

## Responsibilities

- Enters orders.
- Cancels orders.
`,
  'capabilities/actors/venue.md': `---
type: Actor
title: "Venue"
description: "The exchange."
tags: [actor]
status: draft
kind: external
---
# Venue
`,
  'capabilities/functional-requirements/FR-001-accept-new-orders.md': `---
type: Requirement
title: "Accept new orders"
description: "The OMS accepts new orders."
tags: [orders]
status: draft
id: FR-001
priority: must
implementation: partial
capability: /capabilities/order-capture.md
---
# FR-001 Accept new orders
`,
  'capabilities/non-functional-requirements/NFR-001-idempotent.md': `---
type: Requirement
title: "Idempotent commands"
description: "Commands are idempotent."
tags: [quality]
status: stable
id: NFR-001
priority: must
implementation: implemented
capability: /capabilities/order-capture.md
category: reliability
metric: "duplicates applied"
target: "0"
---
# NFR-001
`,
  // legacy locations are no longer read
  [`${LEGACY[0]}/use-cases/UC-999-legacy.md`]: '---\ntype: Use Case\nid: UC-999\ntitle: Legacy\n---\n',
};

const roots: string[] = [];
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});
function fixture(): RequirementsService {
  const root = kb(FIXTURE);
  roots.push(root);
  return new RequirementsService(root);
}

describe('RequirementsService (SPEC-0061 layout)', () => {
  it('lists capabilities with maturity, commands and linked use cases and requirements', () => {
    const [cap] = fixture().getCapabilities();
    expect(cap).toMatchObject({
      id: 'order-capture',
      title: 'Order Capture',
      description: 'Taking new orders in.',
      maturity: 'implemented',
      commands: ['OrderCreateCmd'],
      useCases: ['UC-001'],
      requirements: ['FR-001', 'NFR-001'],
    });
    expect(fixture().getCapabilities()).toHaveLength(1); // index.md is not a capability
  });

  it('reads use cases from capabilities/use-cases with actors, capability, flows and requirements', () => {
    const useCases = fixture().getUseCases();
    expect(useCases.map((u) => u.id)).toEqual(['UC-001']);
    expect(useCases[0]).toMatchObject({
      title: 'Submit an order',
      actors: ['Trader', 'Venue'],
      capability: 'order-capture',
      preconditions: ['The trader is connected.'],
      mainFlow: ['The trader sends the order.', 'The OMS validates and stores it.'],
      alternativeFlows: ['Validation fails: the order is rejected.'],
      postconditions: ['The order is UNACK.'],
      requirements: ['FR-001', 'NFR-001'],
    });
  });

  it('maps FR implementation and OKF status separately', () => {
    const [fr] = fixture().getFunctionalRequirements();
    expect(fr).toMatchObject({ id: 'FR-001', priority: 'must', implementation: 'partial', status: 'draft', capability: 'order-capture' });
    const [nfr] = fixture().getNonFunctionalRequirements();
    expect(nfr).toMatchObject({ id: 'NFR-001', category: 'reliability', metric: 'duplicates applied', target: '0', implementation: 'implemented' });
  });

  it('maps actor kind (not the OKF type) and responsibilities', () => {
    const actors = fixture().getActors();
    expect(actors.map((a) => [a.id, a.name, a.kind])).toEqual([['trader', 'Trader', 'human'], ['venue', 'Venue', 'external']]);
    expect(actors[0].responsibilities).toEqual(['Enters orders.', 'Cancels orders.']);
  });

  it('no legacy knowledge base folder names remain in src/', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (LEGACY.some((name) => fs.readFileSync(p, 'utf8').includes(name))) offenders.push(path.relative(COCKPIT_ROOT, p));
      }
    };
    walk(path.join(COCKPIT_ROOT, 'src'));
    expect(offenders).toEqual([]);
  });

  it('reads the real knowledge base: every FR and NFR file, and at least one capability, use case and actor', () => {
    const kbPath = path.join(COCKPIT_ROOT, '..', 'oms-knowledge-base');
    const files = (dir: string, prefix: string) =>
      fs.readdirSync(path.join(kbPath, dir)).filter((f) => f.startsWith(prefix) && f.endsWith('.md'));
    const svc = new RequirementsService(kbPath);
    const frs = svc.getFunctionalRequirements();
    const nfrs = svc.getNonFunctionalRequirements();
    expect(frs).toHaveLength(files('capabilities/functional-requirements', 'FR-').length);
    expect(nfrs).toHaveLength(files('capabilities/non-functional-requirements', 'NFR-').length);
    expect(frs.every((r) => ['implemented', 'partial', 'not-implemented'].includes(r.implementation))).toBe(true);
    const caps = svc.getCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((c) => c.useCases.length > 0 && c.requirements.length > 0)).toBe(true);
    expect(svc.getUseCases().length).toBeGreaterThan(0);
    expect(svc.getActors().length).toBeGreaterThan(0);
  });
});
