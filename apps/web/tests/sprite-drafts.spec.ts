import { expect, test } from '@playwright/test';

const transparent = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=', 'base64');

test('Creator Studio stages five AI expressions for author review before approval',
  async ({ page }) => {
    const created = await page.request.post('/api/v1/stories', { data: {
      title: 'Hoja generativa ' + test.info().project.name,
      premise: 'Aira cuida los portales del castillo de cristal.',
      protagonist_name: 'Luna',
    } });
    expect(created.status()).toBe(201);
    const story = await created.json() as { id: string };
    const character = await page.request.post(
      '/api/v1/stories/' + story.id + '/creator/characters', { data: {
        name: 'Aira', description: 'Aira posee una espada azul y vive entre flores.',
        visual_dna: { tags: ['cabello azul', 'ojos grises'], seed: 712 },
      } });
    expect(character.status()).toBe(201);
    const npc = await character.json() as { id: string };
    const configured = await page.request.put('/api/v1/images/config', { data: {
      provider: 'comfyui', base_url: 'http://127.0.0.1:8188',
      checkpoint: 'novel.safetensors', width: 256, height: 256,
      steps: 10, cfg: 6.5, negative_prompt: 'watermark',
    } });
    expect(configured.status()).toBe(200);

    await page.goto('/#/creator/' + story.id);
    await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
    const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
    if (await setup.isVisible())
      await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
    await page.getByRole('button', { name: /Imágenes/ }).click();
    await page.getByLabel('NPC para generar expresiones').selectOption(npc.id);
    await page.getByLabel('Contexto de sprites IA').fill('Aira castillo de cristal');
    await page.getByLabel('Estilo visual de sprites IA').fill('watercolor anime');
    await expect(page.getByRole('checkbox', {
      name: 'Usar LoRA del NPC para sprites IA',
    })).not.toBeChecked();
    await page.getByRole('button', { name: 'Preparar borrador de cinco expresiones' }).click();
    await expect(page.getByText(/Borrador creado/)).toBeVisible();
    await expect(page.getByRole('region', {
      name: 'Borrador de sprites Aira',
    }).getByText('Aira · 0/5 expresiones')).toBeVisible();

    const collection = await page.request.get(
      '/api/v1/stories/' + story.id + '/creator/sprite-drafts');
    expect(collection.status()).toBe(200);
    const stored = await collection.json() as {
      drafts: Array<{ id: string; slots: Record<string, unknown>; ready_count: number;
        updated_at: number }>;
    };
    expect(stored.drafts).toHaveLength(1);
    const draft = stored.drafts[0];
    let generated = 0;
    let slots = { ...draft.slots };

    await page.route('**/api/v1/stories/*/creator/sprite-drafts/*/expressions/*/preview*',
      async route => {
        await route.fulfill({ status: 200, contentType: 'image/png', body: transparent });
      });
    await page.route('**/api/v1/stories/*/creator/sprite-drafts/*/expressions/*',
      async route => {
        if (route.request().method() !== 'POST') return route.continue();
        const expression = new URL(route.request().url()).pathname.split('/').at(-1)!;
        generated += 1;
        slots = { ...slots, [expression]: {
          ready: true, quality: { method: 'border_chroma_key', coverage: 0.32,
                                  requires_author_review: true },
          preview_url: '/api/v1/stories/' + story.id + '/creator/sprite-drafts/' +
            draft.id + '/expressions/' + expression + '/preview',
        } };
        await route.fulfill({ status: 200, json: {
          ...draft, story_id: story.id, character_id: npc.id,
          character_name: 'Aira', seed: 712, checkpoint: 'novel.safetensors',
          caption: 'Aira castillo de cristal', pose: 'standing', style: 'watercolor anime',
          use_lora: false, reference_asset_id: null,
          slots, ready_count: generated, updated_at: Date.now() / 1000,
          alignment_warnings: generated === 5
            ? ['joy: posición de silueta muy distinta'] : [],
          alignment_review_needed: generated === 5,
        } });
      });

    const section = page.getByRole('region', { name: 'Borrador de sprites Aira' });
    await expect(section.getByRole('button', { name: 'Aprobar cinco expresiones' })).toBeDisabled();
    await section.getByRole('button', { name: 'Generar expresiones faltantes' }).click();
    await expect(section.getByText('Aira · 5/5 expresiones')).toBeVisible();
    await expect(section.locator('img')).toHaveCount(5);
    expect(generated).toBe(5);
    await expect(section.getByText(/Variaciones importantes de encuadre/)).toBeVisible();
    await expect(section.getByRole('button', {
      name: 'Aprobar cinco expresiones',
    })).toBeDisabled();
    await section.getByRole('checkbox', {
      name: 'I accepted draft differences for Aira',
    }).check();
    await expect(section.getByRole('button', {
      name: 'Aprobar cinco expresiones',
    })).toBeEnabled();
    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-sprite-review.png',
      fullPage: true,
    });

    let approved = false;
    await page.route('**/api/v1/stories/*/creator/sprite-drafts/*/approve',
      async route => {
        approved = true;
        expect(route.request().postDataJSON()).toEqual({
          accept_alignment_warnings: true,
        });
        await route.fulfill({ status: 200, json: {
          approved: true, count: 5, assets: [],
        } });
      });
    await section.getByRole('button', { name: 'Aprobar cinco expresiones' }).click();
    await expect(page.getByText(/Aprobadas 5 expresiones/)).toBeVisible();
    expect(approved).toBe(true);
    // The UI fixture does not create server-side sprite files: cleanup the real draft.
    expect((await page.request.delete(
      '/api/v1/stories/' + story.id + '/creator/sprite-drafts/' + draft.id
    )).status()).toBe(204);
  });
