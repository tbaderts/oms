import { describe, expect, it, vi } from 'vitest';

// The menu module imports electron; the helper under test needs none of it (and a checkout may lack the binary).
vi.mock('electron', () => ({ Menu: {}, shell: { openExternal: vi.fn() }, app: {}, BrowserWindow: {} }));
import { helpLinkItems } from '../../src/main/menu';
import { parseProjectConfig } from '../../src/shared/projectConfig';

describe('Help menu (SPEC-0076)', () => {
  it('helpMenuListsProjectLinks', () => {
    const { config } = parseProjectConfig(
      'links:\n  - { label: Acme Docs, url: "https://docs.acme.test" }\n  - { label: Grafana, url: "http://localhost:3000" }\n',
      '/ws/acme/cockpit.yaml',
    );
    const open = vi.fn();
    const items = helpLinkItems(config.links, open);

    expect(items.map((i) => i.type ?? i.label)).toEqual(['separator', 'Acme Docs', 'Grafana']);
    (items[1].click as () => void)();
    expect(open).toHaveBeenCalledWith('https://docs.acme.test');
  });

  it('a project without links adds nothing', () => {
    expect(helpLinkItems([])).toEqual([]);
  });
});
