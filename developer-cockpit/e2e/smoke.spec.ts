import { test, expect } from './fixtures';

test('the cockpit opens on the temporary workspace', async ({ launch }) => {
  const { page } = await launch();
  await expect(page.getByText('Dashboard').first()).toBeVisible();
});
