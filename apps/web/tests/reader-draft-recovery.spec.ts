import { expect, test } from '@playwright/test';

test('reader preserves unsent input and selected mode per story without creating turns', async ({ page }) => {
  async function create(title: string) {
    const result = await page.request.post('/api/v1/stories', { data: {
      title, premise: 'An old lighthouse protects a mysterious coastal city.',
      protagonist_name: 'Lia',
    } });
    expect(result.status()).toBe(201);
    return (await result.json() as { id: string }).id;
  }
  const a = await create('Local draft A ' + test.info().project.name);
  const b = await create('Local draft B ' + test.info().project.name);
  await page.goto('/#/historia/' + a + '/leer');
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  const toolbar = page.getByRole('group', { name: 'Narration mode' });
  const message = page.getByLabel('Your input in the story');
  await toolbar.getByRole('button', { name: 'Think' }).click();
  await message.fill('Maybe the keeper is hiding the second map.');
  await expect(message).toHaveValue('Maybe the keeper is hiding the second map.');

  await page.goto('/#/historia/' + b + '/leer');
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  await expect(message).toHaveValue('');
  await expect(toolbar.getByRole('button', { name: 'Act' })).toHaveAttribute('aria-pressed', 'true');
  await toolbar.getByRole('button', { name: 'Observe' }).click();
  await message.fill('Examine the lantern and the worn marks on the wall.');

  await page.reload();
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  await expect(message).toHaveValue('Examine the lantern and the worn marks on the wall.');
  await expect(toolbar.getByRole('button', { name: 'Observe' }))
    .toHaveAttribute('aria-pressed', 'true');

  await page.goto('/#/historia/' + a + '/leer');
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  await expect(message).toHaveValue('Maybe the keeper is hiding the second map.');
  await expect(toolbar.getByRole('button', { name: 'Think' }))
    .toHaveAttribute('aria-pressed', 'true');
  for (const id of [a, b]) {
    const history = await (await page.request.get('/api/v1/stories/' + id + '/turns')).json();
    expect(history.turns).toHaveLength(0);
  }
});

test('reader rejects expired or corrupted local drafts without blocking stories', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Corrupt reader draft ' + test.info().project.name,
    premise: 'The harbor is covered in fog on the first morning.',
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json() as { id: string }).id;
  await page.goto('/#/historia/' + id + '/leer');
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  const key = 'noble-ai-reader-draft-v1:' + id;
  await page.evaluate(({ key }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1, savedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      mode: 'say', text: 'Expired draft should never reappear',
    }));
  }, { key });
  await page.reload();
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  await expect(page.getByLabel('Your input in the story')).toHaveValue('');
  expect(await page.evaluate(({ key }) => localStorage.getItem(key), { key })).toBeNull();
  await page.evaluate(({ key }) => localStorage.setItem(key, '{not valid JSON'), { key });
  await page.reload();
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  await expect(page.getByLabel('Your input in the story')).toHaveValue('');
  expect(await page.evaluate(({ key }) => localStorage.getItem(key), { key })).toBeNull();
});
