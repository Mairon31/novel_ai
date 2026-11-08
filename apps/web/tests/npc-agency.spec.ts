import { expect, test } from '@playwright/test';

test('Creator Studio keeps NPC independent goals and refusal conditions across a reload', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'NPC motives ' + test.info().project.name,
    premise: 'A port librarian protects the history of a lighthouse.',
  } });
  expect(created.status()).toBe(201);
  const sid = (await created.json() as {id: string}).id;
  await page.goto('/#/creator/' + sid);
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await page.getByRole('button', { name: /Characters \(0\)/ }).click();
  await page.getByLabel('NPC name').fill('Mira');
  await page.getByLabel('NPC description')
    .fill('A lighthouse keeper who protects the maps of the harbor.');
  await page.getByLabel('NPC goals and incentives')
    .fill('Protect the lighthouse maps and save the harbor.');
  await page.getByLabel('NPC refusal conditions and limits')
    .fill('Never give protected charts to a stranger without proof.');
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(page.getByText(/Character narrative profile saved/)).toBeVisible();

  const response = await page.request.get('/api/v1/stories/' + sid + '/creator/characters');
  expect(response.status()).toBe(200);
  const record = (await response.json()).characters[0];
  expect(record.goals).toContain('save the harbor');
  expect(record.boundaries).toContain('without proof');

  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await page.getByRole('button', { name: /Characters \(1\)/ }).click();
  await page.locator('.creator-character-list button').filter({ hasText: 'Mira' }).click();
  await expect(page.getByLabel('NPC goals and incentives'))
    .toHaveValue('Protect the lighthouse maps and save the harbor.');
  await expect(page.getByLabel('NPC refusal conditions and limits'))
    .toHaveValue('Never give protected charts to a stranger without proof.');
});
