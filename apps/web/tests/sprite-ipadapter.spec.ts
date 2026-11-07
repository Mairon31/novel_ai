import { expect, test } from '@playwright/test';

const transparentSprite = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMklEQVR4nO3OQQEAMAjEsGO6EIZYxEwGn9RAU9Oby97pHQAAAAAAAAAAAAAAAAAAIMkHRDEB0BVmfGUAAAAASUVORK5CYII=',
  'base64');

test('Creator Studio selects an approved NPC sprite as IPAdapter reference without automatic GPU calls',
  async ({ page }) => {
    const created = await page.request.post('/api/v1/stories', { data: {
      title: 'IPAdapter visual ' + test.info().project.name,
      premise: 'Aira protege la entrada de un castillo bajo la luna.',
      protagonist_name: 'Luna',
    } });
    expect(created.status()).toBe(201);
    const story = (await created.json() as {id: string}).id;
    const character = await page.request.post(
      '/api/v1/stories/' + story + '/creator/characters', { data: {
        name: 'Aira', description: 'Aira vive en el castillo, tiene cabello oscuro y ojos verdes.',
      } });
    expect(character.status()).toBe(201);
    const npc = (await character.json() as {id: string}).id;
    const asset = await page.request.post(
      '/api/v1/stories/' + story + '/creator/assets',
      { multipart: {
        kind: 'foreground', label: 'Aira original', caption: 'Aira en el castillo',
        character_id: npc, expression: 'neutral', pose: 'standing',
        file: { name: 'aira.png', mimeType: 'image/png', buffer: transparentSprite },
      } });
    expect(asset.status()).toBe(201);
    const sprite = (await asset.json() as {id: string}).id;
    const configured = await page.request.put('/api/v1/images/config', { data: {
      provider: 'comfyui', base_url: 'http://127.0.0.1:8188',
      checkpoint: 'novel.safetensors', width: 256, height: 256, steps: 14,
      cfg: 6, negative_prompt: 'bad anatomy',
    } });
    expect(configured.status()).toBe(200);

    await page.route('**/api/v1/images/matting/status', async route => {
      await route.fulfill({ status: 200, json: {
        neural_available: true, modes: [
          { mode: 'chroma_green', model: null, node: null, ready: true,
            reason: '' },
          { mode: 'neural_rmbg2', model: 'RMBG-2.0', node: 'RMBG', ready: true,
            reason: '' },
          { mode: 'neural_birefnet_portrait', model: 'BiRefNet-portrait',
            node: 'BiRefNetRMBG', ready: true, reason: '' },
          { mode: 'neural_birefnet_matting', model: 'BiRefNet-matting',
            node: 'BiRefNetRMBG', ready: true, reason: '' },
        ],
      } });
    });
    await page.route('**/api/v1/images/identity-adapter/status', async route => {
      await route.fulfill({ status: 200, json: {
        available: true, presets: [
          'STANDARD (medium strength)', 'PLUS FACE (portraits)'],
        model_count: 2, clip_vision_count: 1, error: null,
      } });
    });
    await page.goto('/#/creator/' + story);
    await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
    const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
    if (await setup.isVisible())
      await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();

    await page.getByRole('button', { name: /Images/ }).click();
    await page.getByLabel('NPC for expression generation').selectOption(npc);
    await page.getByLabel('AI sprite context').fill('Aira cuidando el castillo');
    await page.getByLabel('AI reference mode').selectOption('ipadapter');
    await expect(page.getByRole('button', {
      name: 'Prepare five-expression draft',
    })).toBeDisabled();
    await page.getByLabel('AI reference sprite').selectOption(sprite);
    await page.getByLabel('AI sprite background removal')
      .selectOption('neural_birefnet_portrait');
    await page.getByRole('button', { name: 'Check cutout models' }).click();
    await expect(page.getByText('BiRefNet-portrait: Ready')).toBeVisible();
    await page.getByLabel('Sprite IPAdapter preset').selectOption(
      'STANDARD (medium strength)');
    await page.getByLabel('Sprite IPAdapter strength').fill('0.9');
    await page.getByRole('button', { name: 'Check installed IPAdapter' }).click();
    await expect(page.getByText(/IPAdapter available · 2 models/)).toBeVisible();
    await page.getByRole('button', { name: 'Prepare five-expression draft' }).click();
    await expect(page.getByText(/Draft created/)).toBeVisible();
    const response = await page.request.get(
      '/api/v1/stories/' + story + '/creator/sprite-drafts');
    expect(response.status()).toBe(200);
    const items = (await response.json() as {drafts: Array<{
      reference_sprite_asset_id: string;
      reference_mode: string; ipadapter_preset: string;
      cutout_mode: string;
      ipadapter_weight: number; ready_count: number;
    }>}).drafts;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      reference_sprite_asset_id: sprite, reference_mode: 'ipadapter',
      cutout_mode: 'neural_birefnet_portrait',
      ipadapter_preset: 'STANDARD (medium strength)',
      ipadapter_weight: 0.9, ready_count: 0,
    });
    await expect(page.getByText(/IPAdapter STANDARD \(medium strength\) \(0.9\)/))
      .toBeVisible();
    await expect(page.getByText(/Cutout: BiRefNet portraits/)).toBeVisible();
    const media = await page.request.get(
      '/api/v1/stories/' + story + '/creator/assets');
    expect((await media.json() as {assets: unknown[]}).assets).toHaveLength(1);
    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-ipadapter-studio.png',
      fullPage: true,
    });
  });
