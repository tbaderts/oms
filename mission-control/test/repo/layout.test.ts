import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

describe('AC-9: the prototype is gone and the module is registered', () => {
  it('no prototype remains and the module is registered', () => {
    for (const gone of ['packages', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'turbo.json']) {
      expect(existsSync(resolve(root, gone)), `${gone} must not exist`).toBe(false);
    }

    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => d.startsWith('@mastra/') || d === 'mastra')).toEqual([]);

    const config = JSON.parse(readFileSync(resolve(root, '../specs/config.json'), 'utf8'));
    const mod = config.modules?.['mission-control'];
    expect(mod, 'specs/config.json modules["mission-control"]').toBeDefined();
    expect(mod.cwd).toBe('mission-control');
    expect(mod.verify).toEqual(expect.arrayContaining(['npm run typecheck', 'npm test']));
  });
});
