import * as fs from 'fs';
import * as path from 'path';
import type { ElectronApplication } from '@playwright/test';
import { test, expect } from './fixtures';
import { seedStoryboard } from './storyboard-seed';

/** Answers the native save dialog with `file` without showing it. */
async function saveTo(app: ElectronApplication, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as typeof dialog.showSaveDialog;
  }, file);
}

// SPEC-0014 AC-10: the PDF export of the standalone HTML is a real, non-empty PDF.
test('pdf export', async ({ workspace, launch }) => {
  seedStoryboard(workspace);
  const { app, page } = await launch();
  const pdf = path.join(workspace, 'out', 'buy-gold.pdf');
  await saveTo(app, pdf);

  await page.getByRole('button', { name: 'Storyboards', exact: true }).click();
  await page.getByRole('button', { name: /Buy gold/ }).click();
  await page.getByRole('button', { name: 'PDF' }).click();
  await expect.poll(() => fs.existsSync(pdf) && fs.statSync(pdf).size, { timeout: 30_000 }).toBeGreaterThan(1000);
  expect(fs.readFileSync(pdf).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});

// SPEC-0014 AC-10: the HTML button exports the diagram as inline SVG (it passes the SVG check), with no remote reference.
test('html export from the reader', async ({ workspace, launch }) => {
  seedStoryboard(workspace);
  const { app, page } = await launch();
  const out = path.join(workspace, 'out', 'buy-gold.html');
  await saveTo(app, out);

  await page.getByRole('button', { name: 'Storyboards', exact: true }).click();
  await page.getByRole('button', { name: /Buy gold/ }).click();
  await page.getByRole('button', { name: 'HTML' }).click();
  await expect.poll(() => fs.existsSync(out), { timeout: 30_000 }).toBe(true);
  const html = fs.readFileSync(out, 'utf8');
  expect(html).toMatch(/<div class="sequence"><svg/);
  expect(html).not.toContain('class="mermaid-source"');
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/(src|href)\s*=\s*["']?\s*(https?:|storyboard-asset:|file:)/i);
  expect(html).toContain('payload-type:application/vnd.excalidraw+json');
});
