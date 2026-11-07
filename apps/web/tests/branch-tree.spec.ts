import { expect, test } from '@playwright/test';

test('story detail shows a non-destructive branch tree and reader switches route', async ({ page }) => {
  const title = 'Mapa de rutas ' + test.info().project.name;
  const original = await page.request.post('/api/v1/stories', {data: {
    title, premise: 'Dos caminantes descubren una biblioteca perdida en el desierto.',
    protagonist_name: 'Nora',
  }});
  expect(original.status()).toBe(201);
  const story = await original.json();
  const left = await page.request.post('/api/v1/stories/' + story.id + '/fork',
    { data: { until_turn_id: null } });
  expect(left.status()).toBe(201);
  const child = await left.json();
  const next = await page.request.post('/api/v1/stories/' + child.id + '/fork',
    { data: { until_turn_id: null } });
  expect(next.status()).toBe(201);
  const grandson = await next.json();

  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('.noble-library-cover').filter({
    has: page.locator('.noble-library-cover-copy strong').getByText(title, { exact: true }),
  }).click();
  const region = page.getByRole('region', { name: 'Narrative branch tree' });
  await expect(region).toBeVisible();
  await expect(region.locator('.noble-route-node')).toHaveCount(3);
  await expect(region.getByText('Main story')).toBeVisible();
  await region.getByRole('button', { name: 'Abrir ruta ' + grandson.title }).click();
  await expect(page.getByRole('heading', { name: grandson.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Start story|Continue historia/ }).click();
  const selector = page.getByRole('combobox', { name: 'Switch narrative branch' });
  await expect(selector).toBeVisible();
  await expect(selector.locator('option')).toHaveCount(3);
  await selector.selectOption(story.id);
  await expect(page.locator('.noble-reader-chapter')).toContainText(title);
  const family = await page.request.get('/api/v1/stories/' + story.id + '/branches');
  expect(family.status()).toBe(200);
  expect((await family.json()).branches).toHaveLength(3);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-branch-map.png',
    fullPage: true,
  });
});
