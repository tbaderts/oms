import { test, expect } from './fixtures';
import { excalidrawChunk, isRemote, seedStoryboard } from './storyboard-seed';

// SPEC-0014 AC-15: browsing and reading never load the drawing editor; opening it loads it from local files only.
test('editor chunk loads only on open and never from remote', async ({ workspace, launch }) => {
  seedStoryboard(workspace);
  const chunk = excalidrawChunk();
  const { page } = await launch();
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  const csp: string[] = [];
  // The e2e instance runs its WebSocket on another port than the CSP allows (see fixtures.ts); that refusal is expected.
  page.on('console', (m) => { if (/Content Security Policy/.test(m.text()) && !/Refused to connect to 'ws:\/\/localhost/.test(m.text())) csp.push(m.text()); });

  // browse and read
  await page.getByRole('button', { name: 'Storyboards', exact: true }).click();
  await page.getByRole('button', { name: /Buy gold/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Buy gold' })).toBeVisible();
  await page.getByRole('button', { name: /^Step 2:/ }).click();
  await expect(page.getByRole('article', { name: 'Step 2' }).getByRole('img', { name: 'Customer taps Buy' })).toBeVisible();
  await page.getByRole('tab', { name: 'Lanes' }).click();
  await page.getByRole('button', { name: 'Present' }).click();
  await page.keyboard.press('Escape');
  expect(requests.filter((u) => u.includes(chunk))).toEqual([]);

  // the illustration is served by the cockpit's own protocol
  expect(requests.some((u) => u.startsWith('storyboard-asset://buy-gold/accept-quote.excalidraw.svg'))).toBe(true);

  // open the editor and the sketch tool
  await page.getByRole('tab', { name: 'Strip' }).click();
  await page.getByRole('button', { name: /^Step 2:/ }).click();
  await page.keyboard.press('e');
  const editor = page.getByRole('region', { name: 'Editing step 2' });
  await expect(editor).toBeVisible();
  expect(requests.filter((u) => u.includes(chunk))).toEqual([]);
  await editor.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  expect(requests.filter((u) => u.includes(chunk))).toHaveLength(1);
  expect(requests.filter((u) => u.includes(chunk))[0]).toMatch(/^file:/);
  expect(requests.filter(isRemote)).toEqual([]);
  expect(csp).toEqual([]);
});
