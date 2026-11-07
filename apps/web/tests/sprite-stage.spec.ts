import { expect, test } from '@playwright/test';

const spritePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABgAAAAgCAYAAAAIXrg4AAAAOUlEQVR4nGNgGAUDDRixCbann3hGjmGVMy2k0MWYyDGIFDBqwagFoxaMWjBqwagFoxaMWjBqwXABAP2ABDQL2lh0AAAAAElFTkSuQmCC',
  'base64');

test('VN scene composites three owned transparent NPC sprites with focus and subtitle',
  async ({ page }) => {
    const title = 'Escena VN multicapa ' + test.info().project.name;
    const created = await page.request.post('/api/v1/stories', { data: {
      title, premise: 'La protagonista visita un castillo de cristal.',
      protagonist_name: 'Luna',
    } });
    expect(created.status()).toBe(201);
    const story = await created.json() as { id: string };
    const base = '/api/v1/stories/' + story.id;
    for (const name of ['Bel', 'Cora', 'Aira']) {
      const npc = await page.request.post(base + '/creator/characters', { data: {
        name, description: name + ' es habitante del castillo de cristal.',
        personality: 'Amable y observador.', dialogue_examples: '',
      } });
      expect(npc.status()).toBe(201);
      const character = await npc.json() as { id: string };
      const sprite = await page.request.post(base + '/creator/assets', {
        multipart: {
          kind: 'foreground', label: name + ' retrato',
          caption: name + ' castillo cristal', character_id: character.id,
          expression: name === 'Aira' ? 'joy' : 'neutral',
          pose: name === 'Aira' ? 'waving' : 'standing',
          file: { name: name + '.png', mimeType: 'image/png', buffer: spritePng },
        },
      });
      expect(sprite.status()).toBe(201);
    }
    const bg = await page.request.post(base + '/creator/assets', {
      multipart: {
        kind: 'background', label: 'Castillo', caption: 'castillo cristal paisaje',
        file: { name: 'castle.png', mimeType: 'image/png', buffer: spritePng },
      },
    });
    expect(bg.status()).toBe(201);
    const blueprint = await page.request.put(base + '/creator', {
      data: { opening_scenarios: [
        'Desde el castillo cristal paisaje, Bel observa los vitrales. ' +
        'Cora consulta el mapa. Aira dice: «Hola». Aira sonríe en el castillo.',
      ] },
    });
    expect(blueprint.ok()).toBeTruthy();
    const opening = await page.request.post(base + '/creator/opening',
      { data: { index: 0 } });
    expect(opening.status()).toBe(201);

    const prefs = await page.request.patch('/api/v1/workspace/preferences', {
      data: { reader_layout: 'immersive' },
    });
    expect(prefs.status()).toBe(200);
    await page.goto('/#/historia/' + story.id + '/leer');
    await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
    const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
    if (await setup.isVisible())
      await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();

    const stage = page.locator('.noble-sprite-stage');
    await expect(stage).toHaveAttribute('data-sprite-count', '3');
    await expect(stage.locator('img')).toHaveCount(3);
    await expect(stage.locator('img[data-expression="joy"][data-pose="waving"]'))
      .toHaveCount(1);
    await expect(stage.locator('img[data-speaker="true"]')).toHaveCount(1);
    await expect(stage.locator('img[data-speaker="true"]'))
      .toHaveAttribute('alt', /Aira/);
    await expect(page.locator('.noble-vn-subtitle')).toContainText('Aira');
    await expect(page.locator('.noble-vn-subtitle')).toContainText('sonríe');
    await expect(page.locator('.noble-scene-background')).toBeVisible();
    const animationName = await page.locator('.noble-scene-background')
      .evaluate(el => getComputedStyle(el).animationName);
    expect(animationName).toContain('noble-vn-background-enter');

    for (const src of await stage.locator('img').evaluateAll(images =>
      images.map(element => (element as HTMLImageElement).src))) {
      const asset = await page.request.get(src);
      expect(asset.status()).toBe(200);
      expect(asset.headers()['content-type']).toContain('image/png');
    }
    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-vn-three-sprites.png',
      fullPage: true,
    });

    // Reusing the SPA reader for another story must never expose the former
    // story's background during the new route's asynchronous media load.
    const other = await page.request.post('/api/v1/stories', { data: {
      title: 'Otra ruta visual ' + test.info().project.name,
      premise: 'Una casa solitaria bajo una lluvia de estrellas.',
      protagonist_name: 'Nora',
    } });
    expect(other.status()).toBe(201);
    const second = await other.json() as { id: string };
    const uploaded = await page.request.post(
      '/api/v1/stories/' + second.id + '/scene-image', {
        multipart: {
          file: { name: 'other.png', mimeType: 'image/png', buffer: spritePng },
        },
      });
    expect(uploaded.status()).toBe(200);
    await page.evaluate(id => {
      window.location.hash = '#/historia/' + id + '/leer';
    }, second.id);
    await expect(page.locator('.noble-reader-chapter')).toContainText('Otra ruta visual');
    await expect(page.locator('.noble-scene-background.is-current'))
      .toHaveCSS('background-image', new RegExp(second.id));
    await expect(page.locator('.noble-scene-background.is-previous'))
      .toHaveCount(0);
  });
