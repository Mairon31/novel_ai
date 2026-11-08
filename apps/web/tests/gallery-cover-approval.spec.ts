import { expect, test } from '@playwright/test';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAATElEQVR4nO3OMQHAIADAMMDKpGAD/zr27+nJjkRB5rPP+JN1O/AlVISKUBEqQkWoCBWhIlSEilARKkJFqAgVoSJUhIpQESpCRagIlRfOSgEi0uxxugAAAABJRU5ErkJggg==', 'base64');

test('author explicitly approves saved scene gallery illustration as editorial cover', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Approved gallery cover ' + test.info().project.name,
    premise: 'A medieval town has a lighthouse near the coastal harbor.',
  } });
  expect(created.status()).toBe(201);
  const sid = (await created.json() as {id: string}).id;
  expect((await page.request.put('/api/v1/stories/' + sid + '/creator', {
    data: { visual_start: 'cover_background' },
  })).status()).toBe(200);
  const uploaded = await page.request.post('/api/v1/stories/' + sid + '/scene-image', {
    multipart: { file: { name: 'scene.png', mimeType: 'image/png', buffer: image } },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(200);

  await page.goto('/#/creator/' + sid);
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await page.getByRole('button', { name: /Images \(0\)/ }).click();
  const panel = page.getByRole('region', { name: 'First-scene image preparation' });
  await expect(panel.getByText('Cover', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Gallery illustration to review')).toBeVisible();
  await expect(panel.getByRole('img', { name: 'Selected illustration for cover review' })).toBeVisible();
  await panel.getByLabel('Editorial cover description').fill('A carefully reviewed coastal town artwork');
  await panel.getByRole('button', { name: 'Approve and use as cover' }).click();
  await expect(panel.getByText('The reviewed illustration was saved and selected as the story cover.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Images \(1\)/ })).toBeVisible();

  const story = await (await page.request.get('/api/v1/stories/' + sid)).json();
  expect(story.cover_asset_id).toBeTruthy();
  expect(story.cover_image_url).toContain('/creator/assets/');
  const gallery = await (await page.request.get('/api/v1/stories/' + sid + '/visual-state')).json();
  expect(gallery.assets).toHaveLength(1);
  const ready = await (await page.request.get('/api/v1/stories/' + sid + '/visual-preflight')).json();
  expect(ready.ready).toBe(true);
  expect(ready.missing).toHaveLength(0);
});
