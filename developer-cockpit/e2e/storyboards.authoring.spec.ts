import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { STORYBOARDS, isRemote } from './storyboard-seed';

const ID = 'place-and-fill-order';

async function typeInMonaco(page: Page, scope: ReturnType<Page['getByRole']>, text: string) {
  await scope.locator('.monaco-editor').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

async function drawRectangle(page: Page) {
  const canvas = page.locator('canvas.interactive');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const box = (await canvas.boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 150, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 330, box.y + 260, { steps: 8 });
  await page.mouse.up();
}

// SPEC-0014 AC-16: wizard → prose and hand-offs → sketch → data and alternate path → reorder → reload.
test('wizard to export round trip', async ({ workspace, launch }) => {
  fs.mkdirSync(path.join(workspace, STORYBOARDS), { recursive: true });
  const { page } = await launch();
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.getByRole('button', { name: 'Storyboards', exact: true }).click();

  // 1. the wizard
  await page.getByRole('button', { name: 'New storyboard' }).click();
  const wizard = page.getByRole('region', { name: 'New storyboard' });
  await wizard.getByRole('textbox', { name: 'Domain' }).fill('order-lifecycle');
  await wizard.getByRole('textbox', { name: 'Title', exact: true }).fill('Place and fill order');
  await wizard.getByRole('textbox', { name: 'Lane 1 label' }).fill('Trader');
  await wizard.getByRole('textbox', { name: 'Lane 2 label' }).fill('OMS');
  await wizard.getByRole('button', { name: 'Add lane' }).click();
  await wizard.getByRole('textbox', { name: 'Lane 3 label' }).fill('Exchange');
  await wizard.getByRole('textbox', { name: 'Lane 3 id' }).fill('exchange');
  await wizard.getByRole('combobox', { name: 'Lane 3 kind' }).selectOption('external');
  await wizard.getByRole('textbox', { name: 'Step 1 title' }).fill('Submit order');
  await wizard.getByRole('button', { name: 'Add step' }).click();
  await wizard.getByRole('textbox', { name: 'Step 2 title' }).fill('Fill arrives');
  await wizard.getByRole('button', { name: 'Add step' }).click();
  await wizard.getByRole('textbox', { name: 'Step 3 title' }).fill('Book trade');
  await wizard.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Place and fill order' })).toBeVisible();

  // 2. prose and hand-off for step 1, with an output
  await page.getByRole('button', { name: /^Step 1:/ }).click();
  await page.keyboard.press('e');
  let editor = page.getByRole('region', { name: 'Editing step 1' });
  await editor.getByRole('combobox', { name: 'From lane' }).selectOption('trader');
  await editor.getByRole('combobox', { name: 'To lane' }).selectOption('oms');
  await typeInMonaco(page, editor, '## What happens\n\nThe trader submits an order.\n');
  await editor.getByRole('region', { name: 'Data editor' }).getByRole('button', { name: 'Output', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Output name' }).fill('Order');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Step 1' }).getByText('The trader submits an order.')).toBeVisible();

  // 3. step 2: hand-off, a sketch, an input from step 1 and an alternate path
  await page.getByRole('button', { name: /^Step 2:/ }).click();
  await page.keyboard.press('e');
  editor = page.getByRole('region', { name: 'Editing step 2' });
  await editor.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('external');
  await editor.getByRole('combobox', { name: 'From lane' }).selectOption('exchange');
  await editor.getByRole('combobox', { name: 'To lane' }).selectOption('oms');
  await editor.getByRole('region', { name: 'Data editor' }).getByRole('combobox', { name: 'Add input from an earlier output' }).selectOption({ label: 'Order (step 1)' });
  await editor.getByRole('button', { name: 'Add alternate path' }).click();
  const alt = editor.getByRole('group', { name: 'Alternate path 1' });
  await alt.getByRole('textbox', { name: 'Alternate path id' }).fill('venue-rejects');
  await alt.getByRole('textbox', { name: 'When' }).fill('The venue rejects the order');
  await alt.getByRole('textbox', { name: 'Then' }).fill('OMS rejects the order');
  await editor.getByRole('region', { name: 'Illustrations' }).first().getByRole('button', { name: 'Draw sketch' }).click();
  await drawRectangle(page);
  await page.getByRole('button', { name: 'Save sketch' }).click();
  editor = page.getByRole('region', { name: 'Editing step 2' });
  await expect(editor.getByText('fill-arrives.excalidraw.svg')).toBeVisible();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Step 2' })).toBeVisible();

  // 4. reorder: drag "Book trade" onto "Submit order"
  await page.getByRole('button', { name: /^Step 3:/ }).dragTo(page.getByRole('button', { name: /^Step 1:/ }));
  await expect(page.getByRole('button', { name: /^Step 1: Book trade/ })).toBeVisible();

  // 5. reload and check the reader
  await page.reload();
  await page.getByRole('button', { name: 'Storyboards', exact: true }).click();
  await page.getByRole('button', { name: /Place and fill order/ }).click();
  await expect(page.getByRole('button', { name: /^Step 1: Book trade/ })).toBeVisible();
  await page.getByRole('button', { name: /^Step 3: Fill arrives/ }).click();
  const step3 = page.getByRole('article', { name: 'Step 3' });
  await expect(step3.getByTestId('handoff')).toHaveText('Exchange → OMS · external step');
  await expect(step3.getByRole('region', { name: 'Alternate paths' }).getByText('3a')).toBeVisible();
  // the data annotation: the input of step 3 comes from step 2 (submit-order, after the reorder)
  await expect(step3.getByRole('region', { name: 'Data' })).toContainText('Order');
  await expect(step3.getByRole('region', { name: 'Data' })).toContainText('from step 2');
  await expect(step3.getByRole('img').first()).toBeVisible();

  // 6. the source files
  const dir = path.join(workspace, STORYBOARDS, 'order-lifecycle', ID);
  const story = fs.readFileSync(path.join(dir, 'story.md'), 'utf8');
  expect(story).toContain('steps:\n  - book-trade\n  - submit-order\n  - fill-arrives\n');
  const fill = fs.readFileSync(path.join(dir, 'steps', 'fill-arrives.md'), 'utf8');
  expect(fill).toContain('from: exchange');
  expect(fill).toContain('src: fill-arrives.excalidraw.svg');
  expect(fill).toContain('id: venue-rejects');
  expect(fill).toContain('ref: submit-order');
  expect(fs.readFileSync(path.join(dir, 'steps', 'submit-order.md'), 'utf8')).toContain('The trader submits an order.');
  expect(fs.readFileSync(path.join(dir, 'assets', 'fill-arrives.excalidraw.svg'), 'utf8')).toContain('payload-type:application/vnd.excalidraw+json');

  // 7. Mermaid and HTML exports reflect the edits
  const mermaid = await page.evaluate((id) => window.cockpit.storyboards.exportMermaid(id, true, false), ID);
  expect(mermaid.ok && mermaid.source).toContain('exchange-->>oms: 3. Fill arrives');
  expect(mermaid.ok && mermaid.source).toContain('opt 3a The venue rejects the order');
  const html = await page.evaluate((id) => window.cockpit.storyboards.exportHtml(id, undefined, false), ID);
  expect(html.ok && html.html).toContain('The trader submits an order.');
  expect(html.ok && html.html).toContain('The venue rejects the order');
  expect(html.ok && html.html).toMatch(/<td>in<\/td><td>Order<\/td><td><\/td><td>step 2 \(Submit order\)<\/td>/);
  expect(html.ok && html.html).toMatch(/<td>out<\/td><td>Order<\/td>/);
  expect(html.ok && html.html).toContain('payload-type:application/vnd.excalidraw+json');

  // 8. the sketch reopens in the editor with its scene
  await page.keyboard.press('e');
  editor = page.getByRole('region', { name: 'Editing step 3' });
  await editor.getByRole('region', { name: 'Illustrations' }).first().getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/no embedded Excalidraw scene/)).toHaveCount(0);

  expect(requests.filter(isRemote)).toEqual([]);
});
