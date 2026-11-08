import { expect, test } from '@playwright/test';

const background = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGN0S2lioCVgoqnpoxaMWjBqwagFoxaMWjBqwagFoxaMWjBqARUBAMPtAWyW7XNMAAAAAElFTkSuQmCC', 'base64');
const portrait = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMklEQVR4nO3OQQEAMAjEsGO6EIZYxEwGn9RAU9Oby97pHQAAAAAAAAAAAAAAAAAAIMkHRDEB0BVmfGUAAAAASUVORK5CYII=', 'base64');

test('editorial detail shows cast and visuals, then persists the chosen opening once', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const wizard = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await wizard.isVisible())
    await wizard.getByRole('button', { name: /Continue to Model Hub/ }).click();

  const title = 'El observatorio editorial ' + test.info().project.name;
  const created = await page.request.post('/api/v1/stories', {
    data: { title, premise: 'Una ciudad nevada alberga un observatorio lleno de secretos.',
      protagonist_name: 'Nora' },
  });
  expect(created.status()).toBe(201);
  const storyId = (await created.json() as { id: string }).id;
  const prefix = '/api/v1/stories/' + storyId;

  const blueprint = await page.request.put(prefix + '/creator', {
    data: {
      synopsis: 'Dos caminos llevan al antiguo observatorio.',
      player_plot: 'Nora llega a la ciudad durante una tormenta de nieve.',
      genre: 'Misterio', tags: ['fantasía'], language: 'es-419',
      ai_plot: 'El guardia oculta un secreto que el jugador todavía no conoce.',
      opening_scenarios: [
        'Un faro lejano ilumina la nieve mientras {{user}} cruza el puente.',
        'Las puertas del observatorio se abren para {{user}} al sonar una campana.',
      ],
    },
  });
  expect(blueprint.ok()).toBeTruthy();
  const npc = await page.request.post(prefix + '/creator/characters', {
    data: {
      name: 'Iria', description: 'La guardiana del observatorio protege sus mapas estelares.',
      personality: 'Sabe mucho más de lo que dice.', dialogue_examples: '',
      visual_character_id: null, voice_id: '',
    },
  });
  expect(npc.status()).toBe(201);
  const characterId = (await npc.json() as { id: string }).id;
  const assets = [
    { kind: 'background', label: 'Observatorio nevado',
      caption: 'Observatorio bajo una tormenta de nieve', file: background },
    { kind: 'foreground', label: 'Iria',
      caption: 'Iria frente al observatorio', file: portrait, character_id: characterId },
  ];
  for (const asset of assets) {
    const res = await page.request.post(prefix + '/creator/assets', {
      multipart: {
        kind: asset.kind, label: asset.label, caption: asset.caption,
        ...(asset.character_id ? { character_id: asset.character_id } : {}),
        file: { name: asset.label + '.png', mimeType: 'image/png', buffer: asset.file },
      },
    });
    expect(res.status()).toBe(201);
  }

  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('.noble-library-cover').filter({ hasText: title }).click();
  const detail = page.getByRole('region', { name: 'Details of ' + title });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Dos caminos llevan al antiguo observatorio.')).toBeVisible();
  await expect(detail.getByText('Nora llega a la ciudad durante una tormenta de nieve.')).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Characters in this world' })).toBeVisible();
  await expect(detail.getByRole('img', { name: 'Portrait of Iria' })).toBeVisible();
  await expect(detail.getByRole('img', { name: 'Observatorio nevado' })).toBeVisible();
  await expect(detail.getByText(/El guardia oculta un secreto/)).toHaveCount(0);

  const openings = detail.getByRole('region', { name: 'Opening scenes' });
  await expect(openings.getByText(/Las puertas del observatorio se abren para Nora/)).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-story-editorial.png', fullPage: true });
  await openings.getByRole('button', { name: 'Start with this opening' }).nth(1).click();
  await expect(page.locator('.noble-reader-layout')).toBeVisible();
  await expect(page.locator('.noble-reader-layout')).toContainText(
    'Las puertas del observatorio se abren para Nora');

  const turnsResponse = await page.request.get(prefix + '/turns');
  expect(turnsResponse.ok()).toBeTruthy();
  const turns = (await turnsResponse.json() as { turns: Array<{ assistant_text: string }> }).turns;
  expect(turns).toHaveLength(1);
  expect(turns[0].assistant_text).toBe(
    'Las puertas del observatorio se abren para Nora al sonar una campana.');

  await page.getByRole('button', { name: 'Return to library' }).click();
  await page.locator('.noble-library-cover').filter({ hasText: title }).click();
  await expect(detail.getByRole('button', { name: 'Continue story' })).toBeVisible();
  await expect(detail.getByRole('region', { name: 'Opening scenes' })).toHaveCount(0);
});
