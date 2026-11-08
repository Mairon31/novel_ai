import { expect, test } from '@playwright/test';

test('reader settings update only the selected story freedom and survive reload', async ({ page }) => {
  async function create(title: string) {
    const res = await page.request.post('/api/v1/stories', { data: {
      title, premise: 'A guardian watches an ancient lighthouse near a coastal village.',
    } });
    expect(res.status()).toBe(201);
    return (await res.json() as { id: string }).id;
  }
  const first = await create('Reader setting A ' + test.info().project.name);
  const second = await create('Reader setting B ' + test.info().project.name);

  async function storySettings(storyId: string) {
    await page.goto('/#/historia/' + storyId + '/leer');
    await expect(page.locator('.noble-reader-layout')).toBeVisible();
    await page.getByRole('button', { name: 'Open story details' }).click();
    await page.locator('.noble-inspector-tabs').getByRole('button', { name: 'UI/UX' }).click();
    const area = page.getByRole('region', { name: 'Story settings' });
    await expect(area).toBeVisible();
    return area.getByLabel('Narrative freedom');
  }

  const freedom = await storySettings(first);
  await expect(freedom).toHaveValue('flexible');
  await freedom.selectOption('strict');
  await expect(page.getByText('Story setting saved.')).toBeVisible();
  expect((await (await page.request.get('/api/v1/stories/' + first + '/creator')).json())
    .freedom_mode).toBe('strict');

  const secondFreedom = await storySettings(second);
  await expect(secondFreedom).toHaveValue('flexible');
  await page.reload();
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  await page.getByRole('button', { name: 'Open story details' }).click();
  await page.locator('.noble-inspector-tabs').getByRole('button', { name: 'UI/UX' }).click();
  await expect(page.getByLabel('Narrative freedom')).toHaveValue('flexible');
  const firstAgain = await storySettings(first);
  await expect(firstAgain).toHaveValue('strict');
});
