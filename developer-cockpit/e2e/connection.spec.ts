import { test, expect } from './fixtures';

// SPEC-0036: the renderer reaches the event server on 127.0.0.1 (random COCKPIT_WS_PORT, so the
// CSP must allow it) and stays connected across more than two 3 s reconnect intervals.
test('status bar shows Connected and stays connected', async ({ launch }) => {
  const { page } = await launch();
  const connected = page.getByText('Connected', { exact: true });

  await expect(connected).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(7_000);
  await expect(connected).toBeVisible();
  await expect(page.getByText('Disconnected', { exact: true })).toHaveCount(0);
});
