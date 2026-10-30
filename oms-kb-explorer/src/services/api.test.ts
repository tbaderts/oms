import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kbApi } from './api.ts';

function captureFetch(body: unknown = []): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return urls;
}

test('search functions send filterType and filterTag', async () => {
  const urls = captureFetch();
  await kbApi.searchKeyword('orders', 20, { type: 'Capability', tag: 'intake' });
  await kbApi.searchSemantic('orders', 20, { type: 'Requirement' });
  await kbApi.searchHybrid('orders', 20, { tag: 'fix' });
  await kbApi.searchHybrid('orders', 20);
  assert.match(urls[0], /\/search\/keyword\?query=orders&topK=20&filterType=Capability&filterTag=intake$/);
  assert.match(urls[1], /\/search\/semantic\?query=orders&topK=20&filterType=Requirement$/);
  assert.match(urls[2], /\/search\/hybrid\?query=orders&topK=20&filterTag=fix$/);
  assert.match(urls[3], /\/search\/hybrid\?query=orders&topK=20$/);
});

test('getLinks asks the links endpoint for the document', async () => {
  const urls = captureFetch({ outgoing: [{ target: 'a.md', exists: true }], backlinks: ['b.md'] });
  const links = await kbApi.getLinks('oms-knowledge-base/capabilities/order capture.md');
  assert.match(urls[0], /\/documents\/links\?path=oms-knowledge-base%2Fcapabilities%2Forder\+capture\.md$/);
  assert.deepEqual(links.backlinks, ['b.md']);
});
