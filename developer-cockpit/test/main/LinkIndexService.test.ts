import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LinkIndexService } from '../../src/main/storyboards/LinkIndexService';
import { createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';
import { REPO_ROOT } from '../fixtures/workspace';

const CMD_API = `openapi: 3.0.3
paths:
  /execute:
    post:
      operationId: executeCommand
  /ping:
    get:
      operationId: ping
components:
  schemas:
    Command:
      discriminator:
        propertyName: type
        mapping:
          OrderCreateCmd: '#/components/schemas/OrderCreateCmd'
          OrderAcceptCmd: '#/components/schemas/OrderAcceptCmd'
`;

const ORDER_STATE = `# Order states

\`\`\`mermaid
stateDiagram-v2
  [*] --> NEW
  NEW --> UNACK: OrderCreateCmd
  UNACK --> LIVE: OrderAcceptCmd
  FILLED --> CLOSED
\`\`\`
`;

function writeSources(ws: StoryboardWorkspace) {
  ws.write({
    'oms-contracts/src/main/openapi/oms-cmd-api.yml': CMD_API,
    'oms-contracts/src/main/openapi/oms-query-api.yaml': 'paths:\n  /orders:\n    get:\n      operationId: searchOrders\n',
    'oms-contracts/src/main/openapi/broken.yml': 'paths: [unclosed',
    'oms-contracts/src/main/avro/OrderMessage.avsc': JSON.stringify({ type: 'record', name: 'OrderMessage', fields: [] }),
    'oms-contracts/src/main/avro/Side.avsc': JSON.stringify({ type: 'enum', name: 'Side', symbols: ['BUY'] }),
    'oms-contracts/src/main/avro/Pair.avsc': JSON.stringify([{ type: 'record', name: 'Left', fields: [] }, { type: 'record', name: 'Right', fields: [] }]),
    'oms-knowledge-base/domain/order-state.md': ORDER_STATE,
    'oms-knowledge-base/functional-requirements/FR-001-accept.md': md({ id: 'FR-001', title: 'Accept' }),
    'oms-knowledge-base/functional-requirements/FR-002-no-front-matter-id.md': md({ title: 'No id' }),
    'oms-knowledge-base/non-functional-requirements/NFR-001-idempotent.md': md({ id: 'NFR-001', title: 'Idempotent' }),
    'oms-knowledge-base/functional-requirements/index.md': '# Index\n',
  });
}

function service(ws: StoryboardWorkspace) {
  return new LinkIndexService({
    workspaceRoot: ws.root,
    kbPath: path.join(ws.root, 'oms-knowledge-base'),
    openApiPaths: ['oms-contracts/src/main/openapi'],
    avroPaths: ['oms-contracts/src/main/avro'],
  });
}

describe('LinkIndexService', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('indexes operation ids, command types, avro records, state transitions and requirement ids', () => {
    ws = createStoryboardWorkspace();
    writeSources(ws);
    expect(service(ws).get()).toEqual({
      api: ['oms-cmd-api#OrderAcceptCmd', 'oms-cmd-api#OrderCreateCmd', 'oms-cmd-api#executeCommand', 'oms-cmd-api#ping', 'oms-query-api#searchOrders'],
      events: ['Left', 'OrderMessage', 'Right'],
      states: ['FILLED -> CLOSED', 'NEW -> UNACK', 'UNACK -> LIVE'],
      requirements: ['FR-001', 'FR-002', 'NFR-001'],
    });
  });

  it('caches until invalidated, and knows which paths invalidate it', () => {
    ws = createStoryboardWorkspace();
    writeSources(ws);
    const svc = service(ws);
    const first = svc.get();
    ws.write({ 'oms-knowledge-base/functional-requirements/FR-003-new.md': md({ id: 'FR-003', title: 'New' }) });
    expect(svc.get()).toBe(first);
    expect(svc.isSource(path.join(ws.root, 'oms-knowledge-base/functional-requirements/FR-003-new.md'))).toBe(true);
    expect(svc.isSource(path.join(ws.root, 'oms-contracts/src/main/avro/X.avsc'))).toBe(true);
    expect(svc.isSource(path.join(ws.root, 'oms-knowledge-base/domain/order-state.md'))).toBe(true);
    expect(svc.isSource(path.join(ws.root, 'oms-knowledge-base/domain/order.md'))).toBe(false);
    svc.invalidate();
    expect(svc.get().requirements).toContain('FR-003');
  });

  it('returns empty categories when sources are absent', () => {
    ws = createStoryboardWorkspace();
    expect(service(ws).get()).toEqual({ api: [], events: [], states: [], requirements: [] });
  });

  it('reads the real repository contracts and knowledge base', () => {
    const index = new LinkIndexService({
      workspaceRoot: REPO_ROOT,
      kbPath: path.join(REPO_ROOT, 'oms-knowledge-base'),
      openApiPaths: ['oms-contracts/src/main/openapi'],
      avroPaths: ['oms-contracts/src/main/avro'],
    }).get();
    expect(index.api).toEqual(expect.arrayContaining(['oms-cmd-api#executeCommand', 'oms-cmd-api#OrderCreateCmd', 'oms-query-api#searchOrders']));
    expect(index.events).toEqual(expect.arrayContaining(['OrderMessage', 'Execution']));
    expect(index.states).toEqual(expect.arrayContaining(['NEW -> UNACK', 'UNACK -> LIVE']));
    expect(index.requirements).toEqual(expect.arrayContaining(['FR-001', 'NFR-001']));
  });
});
