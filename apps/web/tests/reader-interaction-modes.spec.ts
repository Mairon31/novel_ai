import { expect, test } from '@playwright/test';

test('reader exposes six accessible interaction modes with distinct input guidance', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Interaction mode reader ' + test.info().project.name,
    premise: 'A skeptical guardian watches the harbor from the lighthouse.',
    protagonist_name: 'Lia',
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json() as { id: string }).id;

  await page.goto('/#/historia/' + id + '/leer');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  const composer = page.locator('.noble-reader-compose');
  const controls = composer.getByRole('group', { name: 'Narration mode' });
  for (const name of ['Speak', 'Act', 'Think', 'Observe', 'Interact', 'Narrate']) {
    await expect(controls.getByRole('button', { name, exact: true })).toBeVisible();
  }
  const message = composer.getByLabel('Your input in the story');
  const think = controls.getByRole('button', { name: 'Think' });
  await think.click();
  await expect(think).toHaveAttribute('aria-pressed', 'true');
  await expect(message).toHaveAttribute('placeholder', /privately think/i);
  await expect(composer.getByText(/NPCs cannot hear it/i)).toBeVisible();

  await controls.getByRole('button', { name: 'Observe' }).click();
  await expect(message).toHaveAttribute('placeholder', /examine or pay attention/i);
  await controls.getByRole('button', { name: 'Interact' }).click();
  await expect(message).toHaveAttribute('placeholder', /attempt to interact/i);
  await controls.getByRole('button', { name: 'Speak' }).click();
  await expect(controls.getByRole('button', { name: 'Speak' }))
    .toHaveAttribute('aria-pressed', 'true');
  expect((await (await page.request.get('/api/v1/stories/' + id + '/turns')).json())
    .turns).toHaveLength(0);
});
