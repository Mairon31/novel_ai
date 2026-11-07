import { expect, test } from '@playwright/test';

test('bookshelf opens a separate story detail, the reader and the matching creator project', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const wizard = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await wizard.isVisible()) await wizard.getByRole('button', { name: /Continue al Model Hub/ }).click();

  const title = 'El faro de las estrellas ' + test.info().project.name;
  const created = await page.request.post('/api/v1/stories', {
    data: { title, premise: 'Una ciudad al borde del mar esconde un faro antiguo.', protagonist_name: 'Lia' },
  });
  expect(created.status()).toBe(201);
  const storyId = (await created.json() as { id: string }).id;
  const blueprint = await page.request.put('/api/v1/stories/' + storyId + '/creator', {
    data: { synopsis: 'Lia descubre el secreto del faro bajo la tormenta.',
      genre: 'Fantasía', tags: ['misterio', 'aventura'], language: 'es-419' },
  });
  expect(blueprint.ok()).toBeTruthy();

  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Stories to experience/ })).toBeVisible();
  await page.locator('.noble-library-cover').filter({ hasText: title }).click();

  const detail = page.getByRole('region', { name: 'Detalle de ' + title });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { name: title })).toBeVisible();
  await expect(detail.getByText('Lia descubre el secreto del faro bajo la tormenta.')).toBeVisible();
  await expect(detail.getByText('Fantasía')).toBeVisible();
  await expect(detail.getByText('misterio', { exact: true })).toBeVisible();
  await expect(page.locator('.noble-reader-layout')).toHaveCount(0);
  await expect(page.locator('.noble-library-cover-grid')).toHaveCount(0);

  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-story-detail.png', fullPage: true,
  });

  await detail.getByRole('button', { name: 'Editar en Creator Studio' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByLabel('Sinopsis para lectores'))
    .toHaveValue('Lia descubre el secreto del faro bajo la tormenta.');

  await page.getByRole('button', { name: 'Ir a Library' }).click();
  await page.locator('.noble-library-cover').filter({ hasText: title }).click();
  await page.getByRole('button', { name: 'Start story' }).click();
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  await expect(page.locator('.noble-library-cover-grid')).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to library' }).click();
  await expect(page.locator('.noble-story-detail')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /My stories/ })).toBeVisible();
});
