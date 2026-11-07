import { expect, test } from '@playwright/test';

test('shareable story URLs survive reload and browser Back/Forward', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Enlace persistente ' + test.info().project.name,
    premise: 'Una exploradora recorre la biblioteca de una antigua ciudad perdida.',
    protagonist_name: 'Aira',
  } });
  expect(created.status()).toBe(201);
  const story = await created.json();
  const branch = await page.request.post('/api/v1/stories/' + story.id + '/fork',
    { data: { until_turn_id: null } });
  expect(branch.status()).toBe(201);
  const child = await branch.json();

  await page.goto('/#/historia/' + story.id);
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  await expect(page.getByRole('region', { name: 'Detalle de ' + story.title }))
    .toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Detalle de ' + story.title }))
    .toBeVisible();

  await page.getByRole('button', { name: /Comenzar historia|Continuar historia/ }).click();
  await expect(page).toHaveURL(new RegExp('#/historia/' + story.id + '/leer$'));
  await expect(page.locator('.noble-reader-chapter')).toContainText(story.title);
  const selector = page.getByRole('combobox', { name: 'Cambiar ruta narrativa' });
  await expect(selector).toBeVisible();
  await selector.selectOption(child.id);
  await expect(page).toHaveURL(new RegExp('#/historia/' + child.id + '/leer$'));
  await expect(page.locator('.noble-reader-chapter')).toContainText(child.title);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp('#/historia/' + story.id + '/leer$'));
  await expect(page.locator('.noble-reader-chapter')).toContainText(story.title);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp('#/historia/' + story.id + '$'));
  await expect(page.getByRole('region', { name: 'Detalle de ' + story.title }))
    .toBeVisible();
  await page.goForward();
  await expect(page.locator('.noble-reader-chapter')).toContainText(story.title);
});

test('Creator and infrastructure routes are bookmarkable and synchronized', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Editor vinculado ' + test.info().project.name,
    premise: 'Una historia que transcurre en las montañas de una isla misteriosa.',
    protagonist_name: 'Nora',
  } });
  expect(created.status()).toBe(201);
  const story = await created.json();
  await page.goto('/#/creator/' + story.id);
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  await expect(page.getByRole('region', { name: 'Estudio de creación de historias' }))
    .toBeVisible();
  await expect(page.getByRole('heading', { name: story.title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: story.title })).toBeVisible();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await expect(page).toHaveURL(/#\/creator$/);
  await expect(page.getByText('Selecciona una historia para editarla')).toBeVisible();

  await page.goto('/#/infraestructura');
  await expect(page.getByRole('heading', { name: /Diagnóstico/ })).toBeVisible();
  await page.goto('/#/biblioteca');
  await expect(page.getByRole('heading', { name: /My stories/ })).toBeVisible();
  await page.goto('/#/modelos');
  await expect(page.getByRole('heading', { name: /Centro de modelos/ })).toBeVisible();
});

test('first-time setup does not discard a bookmarked story URL', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Enlace inicial ' + test.info().project.name,
    premise: 'Una investigadora despierta en un antiguo reino subterráneo.',
    protagonist_name: 'Iris',
  } });
  expect(created.status()).toBe(201);
  const story = await created.json();
  // Simulate a fresh UI profile without mutating the shared backend setting.
  await page.route('**/api/v1/settings', async route => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const settings = await response.json();
    await route.fulfill({ response, json: { ...settings, setup_complete: false } });
  });
  await page.goto('/#/historia/' + story.id);
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  await expect(setup).toBeHidden();
  await expect(page).toHaveURL(new RegExp('#/historia/' + story.id + '$'));
  await expect(page.getByRole('region', { name: 'Detalle de ' + story.title }))
    .toBeVisible();
});
