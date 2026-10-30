import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import { KbService } from '../../src/main/services/KbService';
import { createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';

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
});
