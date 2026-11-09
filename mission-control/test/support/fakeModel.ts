import type { LanguageModel } from 'ai';

/*
 * `ai` 7 ships no mock model, so — as in developer-cockpit's AiService tests — this is a
 * hand-rolled v4 LanguageModel. Each doStream call plays the next script, one per agent step.
 */
export function fakeModel(steps: unknown[][], calls: unknown[] = []): LanguageModel {
  let i = 0;
  return {
    specificationVersion: 'v4',
    provider: 'fake',
    modelId: 'fake-model',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('doGenerate not used');
    },
    doStream: async (options: unknown) => {
      calls.push(options);
      const script = steps[Math.min(i++, steps.length - 1)];
      return {
        stream: new ReadableStream({
          start(c) {
            for (const p of script) c.enqueue(p);
            c.close();
          },
        }),
      };
    },
  } as unknown as LanguageModel;
}

export const finish = (unified: 'stop' | 'tool-calls') => ({
  type: 'finish',
  finishReason: { unified, raw: unified },
  usage: { inputTokens: { total: 10 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
});

export const textStep = (text: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: text },
  { type: 'text-end', id: 't' },
  finish('stop'),
];

export const toolStep = (toolName: string, input: unknown, id: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'tool-input-start', id, toolName },
  { type: 'tool-input-delta', id, delta: JSON.stringify(input) },
  { type: 'tool-input-end', id },
  { type: 'tool-call', toolCallId: id, toolName, input: JSON.stringify(input) },
  finish('tool-calls'),
];
