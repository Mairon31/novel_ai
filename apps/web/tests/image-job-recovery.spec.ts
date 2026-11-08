import { expect, test } from '@playwright/test';

test('Creator Studio restores an interrupted or failed image job without implicit generation', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Durable render queue ' + test.info().project.name,
    premise: 'The sea surrounds a ruined lighthouse under a cloudy sky.',
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json() as {id: string}).id;
  expect((await page.request.put('/api/v1/stories/' + id + '/creator', {
    data: { visual_start: 'cover_background',
      player_plot: 'The empty lighthouse overlooks the fishing harbor.' },
  })).status()).toBe(200);
  let submissions = 0;
  await page.route('**/api/v1/stories/*/image-jobs', async route => {
    if (route.request().method() === 'POST') submissions++;
    await route.continue();
  });

  await page.goto('/#/creator/' + id);
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await page.getByRole('button', { name: /Images \(0\)/ }).click();
  const panel = page.getByRole('region', { name: 'First-scene image preparation' });
  await expect(panel.getByRole('button', { name: 'Generate opening background' })).toBeEnabled();
  expect(submissions).toBe(0);
  await panel.getByRole('button', { name: 'Generate opening background' }).click();
  await expect(panel.getByText('Image generation: Failed')).toBeVisible();
  expect(submissions).toBe(1);
  const jobs = await (await page.request.get('/api/v1/stories/' + id + '/image-jobs')).json();
  expect(jobs.jobs).toHaveLength(1);
  expect(jobs.jobs[0].attempts).toBe(1);
  const seed = jobs.jobs[0].seed;

  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await page.getByRole('button', { name: /Images \(0\)/ }).click();
  await expect(panel.getByText('Image generation: Failed')).toBeVisible();
  await expect(panel.getByText('Saved seed: ' + seed)).toBeVisible();
  expect(submissions).toBe(1);
  await panel.getByRole('button', { name: 'Retry image generation' }).click();
  await expect(panel.getByText('Image generation: Failed')).toBeVisible();
  const after = await (await page.request.get('/api/v1/stories/' + id + '/image-jobs')).json();
  expect(after.jobs[0].id).toBe(jobs.jobs[0].id);
  expect(after.jobs[0].seed).toBe(seed);
  expect(after.jobs[0].attempts).toBe(2);
  expect(submissions).toBe(1);
});
