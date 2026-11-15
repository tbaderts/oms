import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { KbService } from '../../src/main/services/KbService';
import * as fs from 'fs';
import { createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';
import { REPO_ROOT } from '../fixtures/workspace';

describe('KbService', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('skips the storyboards folder, which is not part of the OKF bundle', async () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    ws.write({
      'oms-knowledge-base/domain/order.md': md({ title: 'Order' }, '\n# Order\n'),
      'oms-knowledge-base/domain/storyboards/not-the-root.md': md({ title: 'Nested name only' }),
    });
    const kb = new KbService(path.join(ws.root, 'oms-knowledge-base'));
    await kb.scan();
    const titles = kb.getCategories().map((c) => c.name);
    expect(titles).toContain('domain');
    expect(titles).not.toContain('storyboards');
    expect(kb.getDocument('domain/order.md')?.title).toBe('Order');
    expect(kb.getDocument('domain/storyboards/not-the-root.md')).toBeDefined();
    expect(kb.search('Request quote')).toEqual([]);
  });

  it('categories are the top-level folders of the real knowledge base (SPEC-0061)', async () => {
    const kbPath = path.join(REPO_ROOT, 'oms-knowledge-base');
    const kb = new KbService(kbPath);
    await kb.scan();
    const hasMarkdown = (dir: string): boolean =>
      fs.readdirSync(dir, { withFileTypes: true }).some((e) =>
        e.isDirectory() ? hasMarkdown(path.join(dir, e.name)) : e.name.endsWith('.md'));
    const folders = fs.readdirSync(kbPath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'storyboards' && !e.name.startsWith('.') && hasMarkdown(path.join(kbPath, e.name)))
      .map((e) => e.name).sort();
    const categories = kb.getCategories().map((c) => c.name).filter((n) => n !== 'root').sort();
    expect(categories).toEqual(folders);
    expect(categories).toEqual(expect.arrayContaining(['architecture', 'capabilities', 'domain', 'framework', 'semantic-layer']));
  });

  it('folders nest at every depth and list only their own documents (SPEC-0061)', async () => {
    ws = createStoryboardWorkspace();
    ws.write({
      'oms-knowledge-base/index.md': '---\nokf_version: "0.2"\n---\n# KB\n',
      'oms-knowledge-base/log.md': '# Log\n',
      'oms-knowledge-base/okf-conventions.md': md({ title: 'Conventions' }),
      'oms-knowledge-base/domain/index.md': '# Domain\n',
      'oms-knowledge-base/domain/model/index.md': '# Model\n',
      'oms-knowledge-base/domain/model/order.md': md({ title: 'Order' }),
      'oms-knowledge-base/domain/concepts/order-lifecycle.md': md({ title: 'Order Lifecycle' }),
      'oms-knowledge-base/capabilities/order-capture.md': md({ title: 'Order Capture' }),
      'oms-knowledge-base/capabilities/use-cases/UC-001-submit-order.md': md({ title: 'Submit an order' }),
      'oms-knowledge-base/archive/old.md': md({ title: 'Old', status: 'deprecated' }),
    });
    const kb = new KbService(path.join(ws.root, 'oms-knowledge-base'));
    await kb.scan();
    const tree = kb.getCategories();
    const domain = tree.find((c) => c.name === 'domain')!;
    expect(domain.id).toBe('domain');
    expect(domain.documentCount).toBe(2); // index.md files are navigation, not documents
    expect(domain.subcategories.map((c) => [c.id, c.name, c.documentCount])).toEqual([
      ['domain/concepts', 'concepts', 1],
      ['domain/model', 'model', 1],
    ]);
    const caps = tree.find((c) => c.name === 'capabilities')!;
    expect(caps.subcategories.map((c) => c.id)).toEqual(['capabilities/use-cases']);
    // documents of a folder are only its own, never its sub-folders'
    expect(kb.getDocuments('domain')).toEqual([]);
    expect(kb.getDocuments('domain/model').map((d) => d.title)).toEqual(['Order']);
    expect(kb.getDocuments('capabilities').map((d) => d.title)).toEqual(['Order Capture']);
    expect(kb.getDocuments('root').map((d) => d.title)).toEqual(['Conventions']);
    expect(tree.map((c) => c.name)).toEqual(['archive', 'capabilities', 'domain', 'root']);
    // navigation files stay searchable and readable
    expect(kb.getDocument('domain/index.md')).toBeDefined();
  });
});
