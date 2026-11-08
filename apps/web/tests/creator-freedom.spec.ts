import { expect, test } from '@playwright/test';

test('Creator Studio persists story-specific narrative freedom and restores the selected mode', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Freedom mode ' + test.info().project.name,
    premise: 'A guardian has sworn to protect an abandoned lighthouse.',
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json() as {id: string}).id;
  await page.goto('/#/creator/' + id);
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const freedom = page.getByLabel('Narrative freedom');
  await expect(freedom).toHaveValue('flexible');
  await freedom.selectOption('strict');
  await page.getByRole('button', { name: 'Save plot and context' }).click();
  await expect(page.getByText(/Creator content saved/)).toBeVisible();
  expect((await (await page.request.get('/api/v1/stories/' + id + '/creator')).json())
    .freedom_mode).toBe('strict');
  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await expect(page.getByLabel('Narrative freedom')).toHaveValue('strict');
  await page.getByLabel('Narrative freedom').selectOption('guided');
  await page.getByRole('button', { name: 'Save plot and context' }).click();
  await expect(page.getByLabel('Narrative freedom')).toHaveValue('guided');
  expect((await (await page.request.get('/api/v1/stories/' + id + '/creator')).json())
    .freedom_mode).toBe('guided');
});
