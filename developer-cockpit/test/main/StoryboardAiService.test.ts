import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { AnthropicAdapter, type AiAdapter, type AiRequest } from '../../src/main/storyboards/ai/AiAdapter';
import { StoryboardAiService, MAX_CONTEXT_CHARS, aiAvailable } from '../../src/main/storyboards/StoryboardAiService';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_CONFIG } from '../../src/shared/types/config';
import { DEFAULT_STORYBOARDS_CONFIG, type LinkIndex } from '../../src/shared/types/storyboards';
import { COCKPIT_ROOT } from '../fixtures/workspace';
import { createStoryboardWorkspace, type StoryboardWorkspace } from '../fixtures/storyboards';

const ID = 'buy-gold-mobile';
const index: LinkIndex = {
  api: ['oms-cmd-api#executeCommand', 'oms-cmd-api#OrderCreateCmd'],
  events: ['OrderMessage', 'Execution'],
  states: ['NEW -> UNACK', 'UNACK -> LIVE', 'LIVE -> REJ'],
  requirements: ['FR-001', 'FR-011'],
};

class FakeAdapter implements AiAdapter {
  requests: AiRequest[] = [];
  constructor(private reply: string) {}
  async complete(req: AiRequest): Promise<string> {
    this.requests.push(req);
    return this.reply;
  }
}

function setup(reply: string, extract: (ref: string) => string | null = () => null) {
  const ws = createStoryboardWorkspace();
  ws.writeExample();
  const svc = new StoryboardService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), config: DEFAULT_STORYBOARDS_CONFIG, linkIndex: { get: () => index } });
  svc.scan();
  const adapter = new FakeAdapter(reply);
  const ai = new StoryboardAiService({ adapter, storyboards: svc, linkIndex: { get: () => index }, extract });
  return { ws, svc, adapter, ai };
}

describe('StoryboardAiService', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('suggestLinks keeps only values that exist in the link index', async () => {
    let ai: StoryboardAiService;
    ({ ws, ai } = setup('Here you go:\n```json\n{"api":["oms-cmd-api#OrderCreateCmd","oms-cmd-api#inventedOp"],"events":["OrderMessage","MadeUpEvent"],"states":["NEW -> UNACK","NEW -> MOON"],"requirements":["FR-011","FR-999"]}\n```'));
    const r = await ai.assist('suggestLinks', ID, 'route-to-market');
    expect(r).toEqual({
      ok: true,
      proposal: { kind: 'suggestLinks', links: { api: ['oms-cmd-api#OrderCreateCmd'], events: ['OrderMessage'], states: ['NEW -> UNACK'], requirements: ['FR-011'] } },
    });
  });

  it('bounds the prompt and sends only what the assist needs', async () => {
    let ai: StoryboardAiService;
    let adapter: FakeAdapter;
    ({ ws, ai, adapter } = setup('## What happens\n\nx\n', () => 'requirement text '.repeat(5000)));
    await ai.assist('draftProse', ID, 'route-to-market');
    const req = adapter.requests[0];
    expect(req.user.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    expect(req.user).toContain('Route order to market');
    expect(req.user).toContain('OMS');
    expect(req.user).toContain('FR-001');
    expect(req.user).not.toContain(ws.root);
    expect(req.user).not.toContain('oms-knowledge-base/storyboards');
    // extracts are cut to 2000 characters each
    const extract = req.user.split('requirement text').length - 1;
    expect(extract).toBeLessThanOrEqual(Math.ceil(2000 / 'requirement text '.length) + 1);
  });

  it('draftProse returns Markdown as a proposal and writes nothing', async () => {
    let ai: StoryboardAiService;
    ({ ws, ai } = setup('```markdown\n## What happens\n\nOMS submits.\n\n## Business rules\n\n- One.\n\n## Notes\n\n- None.\n```'));
    const before = fs.readFileSync(path.join(ws.storyboards, 'precious-metals', ID, 'steps', 'route-to-market.md'), 'utf8');
    const r = await ai.assist('draftProse', ID, 'route-to-market');
    expect(r).toMatchObject({ ok: true, proposal: { kind: 'draftProse', markdown: expect.stringMatching(/^## What happens/) } });
    expect(fs.readFileSync(path.join(ws.storyboards, 'precious-metals', ID, 'steps', 'route-to-market.md'), 'utf8')).toBe(before);
  });

  it('reviewExtensions drops malformed suggestions and backward jumps', async () => {
    let ai: StoryboardAiService;
    ({ ws, ai } = setup(JSON.stringify([
      { when: 'Quote expired', then: 'Re-quote', continueAt: { kind: 'stay' } },
      { when: 'Venue down', then: 'Retry later', continueAt: { kind: 'step', step: 'request-quote' } },
      { when: 'No funds', then: 'Stop', continueAt: { kind: 'end' } },
      { when: 'Missing then' },
      'not even an object',
    ])));
    const r = await ai.assist('reviewExtensions', ID, 'accept-quote');
    expect(r).toEqual({
      ok: true,
      proposal: {
        kind: 'reviewExtensions',
        extensions: [
          { when: 'Quote expired', then: 'Re-quote', continueAt: { kind: 'stay' } },
          { when: 'No funds', then: 'Stop', continueAt: { kind: 'end' } },
        ],
      },
    });
  });

  it('refuses unknown storyboards and steps, and reports adapter failures', async () => {
    let ai: StoryboardAiService;
    let svc: StoryboardService;
    ({ ws, ai, svc } = setup('{}'));
    expect(await ai.assist('suggestLinks', 'nope', 'x')).toMatchObject({ ok: false, code: 'not-found' });
    expect(await ai.assist('suggestLinks', ID, 'ghost')).toMatchObject({ ok: false, code: 'not-found' });
    expect(await ai.assist('bogus' as never, ID, 'route-to-market')).toMatchObject({ ok: false, code: 'invalid' });
    const failing = new StoryboardAiService({ adapter: { complete: async () => { throw new Error('boom'); } }, storyboards: svc, linkIndex: { get: () => index }, extract: () => null });
    expect(await failing.assist('suggestLinks', ID, 'route-to-market')).toMatchObject({ ok: false, code: 'invalid', message: expect.stringContaining('boom') });
  });

  it('is unavailable without the API key, and with another provider', () => {
    expect(aiAvailable(DEFAULT_CONFIG.ai, {})).toBe(false);
    expect(aiAvailable(DEFAULT_CONFIG.ai, { ANTHROPIC_API_KEY: '' })).toBe(false);
    expect(aiAvailable(DEFAULT_CONFIG.ai, { ANTHROPIC_API_KEY: 'k' })).toBe(true);
    expect(aiAvailable({ ...DEFAULT_CONFIG.ai, provider: 'openai' }, { ANTHROPIC_API_KEY: 'k' })).toBe(false);
  });

  it('has no file-system dependency: the service and adapter never import fs', () => {
    for (const file of ['src/main/storyboards/StoryboardAiService.ts', 'src/main/storyboards/ai/AiAdapter.ts']) {
      const source = fs.readFileSync(path.join(COCKPIT_ROOT, file), 'utf8');
      expect(source).not.toMatch(/from ['"](node:)?fs['"]|require\(['"](node:)?fs['"]\)/);
    }
  });
});

describe('AnthropicAdapter', () => {
  it('posts one Messages API request with the configured model and the key from the env var', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'hello' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = new AnthropicAdapter(DEFAULT_CONFIG.ai, { ANTHROPIC_API_KEY: 'secret' }, fakeFetch);
    expect(await adapter.complete({ system: 's', user: 'u', maxTokens: 100 })).toBe('hello');
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('secret');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: DEFAULT_CONFIG.ai.model, max_tokens: 100, system: 's', messages: [{ role: 'user', content: 'u' }] });
  });

  it('turns an error response into an error', async () => {
    const fakeFetch = (async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })) as unknown as typeof fetch;
    await expect(new AnthropicAdapter(DEFAULT_CONFIG.ai, { ANTHROPIC_API_KEY: 'x' }, fakeFetch).complete({ system: 's', user: 'u', maxTokens: 10 })).rejects.toThrow(/401/);
  });
});
