import { expect, test } from '@playwright/test';

test('illustrated story cannot start silently and explicit text-only choice survives reload', async ({ page }) => {
  const title = 'Visual preflight ' + test.info().project.name + ' ' + Date.now();
  const created = await page.request.post('/api/v1/stories', { data: {
    title, protagonist_name: 'Lia',
    premise: 'An illustrated coastal world with a lighthouse and missing art.',
  } });
  expect(created.status()).toBe(201);
  const storyId = (await created.json() as { id: string }).id;
  const prefix = '/api/v1/stories/' + storyId;
  const saved = await page.request.put(prefix + '/creator', { data: {
    visual_start: 'cover_background',
    opening_scenarios: [
      'The lighthouse bell rings as Lia arrives at the harbor and meets a stranger.',
    ],
  } });
  expect(saved.status()).toBe(200);
  const rejected = await page.request.post(prefix + '/creator/opening', {
    data: { index: 0 },
  });
  expect(rejected.status()).toBe(422);
  expect((await (await page.request.get(prefix + '/turns')).json()).turns).toHaveLength(0);

  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('.noble-library-cover').filter({ hasText: title }).click();
  await expect(page.getByRole('region', { name: 'Prepare visuals before starting' })).toBeVisible();
  await expect(page.getByText('Select an uploaded cover image.')).toBeVisible();
  await expect(page.getByText('Add a scene background or select a saved scene illustration.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with text only' })).toBeVisible();

  // First turn remains unwritten until the player explicitly makes this choice.
  expect((await (await page.request.get(prefix + '/turns')).json()).turns).toHaveLength(0);
  await page.getByRole('button', { name: 'Continue with text only' }).click();
  await expect(page.getByRole('region', { name: 'Prepare visuals before starting' })).toHaveCount(0);
  const state = await (await page.request.get(prefix + '/visual-preflight')).json();
  expect(state.text_only).toBe(true);
  expect(state.ready).toBe(true);

  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await expect(page.getByRole('region', { name: 'Prepare visuals before starting' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start opening' }).click();
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  expect((await (await page.request.get(prefix + '/turns')).json()).turns).toHaveLength(1);
});
