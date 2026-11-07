import { expect, test } from '@playwright/test';

test('author can inspect full prepared prompt without running an LLM', async ({ page }) => {
  const title = 'Inspector del palacio ' + test.info().project.name;
  const newStory = await page.request.post('/api/v1/stories', { data: {
    title, premise: 'Una guardiana custodia un mapa oculto en una biblioteca antigua.',
    protagonist_name: 'Luna',
  } });
  expect(newStory.status()).toBe(201);
  const story = await newStory.json();
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Narration', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Inspector de contexto narrativo' });
  await expect(inspector).toBeVisible();
  await inspector.getByLabel('Historia para inspeccionar').selectOption(story.id);
  await inspector.getByLabel('Intervención para inspeccionar').fill(
    'Abro un libro escondido en el palacio.');
  await inspector.getByRole('button', { name: 'Inspeccionar contexto' }).click();
  await expect(inspector.getByText('Presupuesto estimado del prompt')).toBeVisible();
  await expect(inspector.getByText(/tokens aproximados de entrada/)).toBeVisible();
  await inspector.getByText('Ver todos los mensajes enviados al motor').click();
  await expect(inspector.locator('pre').filter({
    hasText: 'El protagonista hace: Abro un libro escondido en el palacio.',
  })).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-context-inspector.png',
    fullPage: true,
  });
});
