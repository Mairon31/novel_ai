import { expect, test } from '@playwright/test';

test('Creator Studio previews missing visuals without automatically triggering ComfyUI', async ({ page }) => {
  const title = 'Visual preparation ' + test.info().project.name;
  const created = await page.request.post('/api/v1/stories', { data: {
    title, protagonist_name: 'Lia',
    premise: 'A village near a lighthouse is surrounded by blue fog every evening.',
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json() as {id: string}).id;
  expect((await page.request.put('/api/v1/stories/' + id + '/creator', {
    data: { visual_start: 'cover_background',
      player_plot: 'The lighthouse on the coast is hidden by blue fog.' },
  })).status()).toBe(200);

  let generatedCalls = 0;
  await page.route('**/api/v1/stories/*/image-jobs', async route => {
    if (route.request().method() === 'POST') generatedCalls += 1;
    await route.continue();
  });
  await page.goto('/#/creator/' + id);
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await page.getByRole('button', { name: /Images \(0\)/ }).click();
  const panel = page.getByRole('region', { name: 'First-scene image preparation' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Cover', { exact: true })).toBeVisible();
  await expect(panel.getByText('Opening background', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Editable opening-background prompt')).toHaveValue(/blue fog/);
  await panel.getByRole('button', { name: 'Refresh checklist' }).click();
  await expect(panel.getByText('Opening background', { exact: true })).toBeVisible();
  expect(generatedCalls).toBe(0);
  await panel.getByRole('button', { name: 'Generate opening background' }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  expect(generatedCalls).toBe(1);
});
