import { expect, test } from '@playwright/test';

test('Creator Studio Lorebook creates trigger, previews it and persists locally', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();

  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create story project' });
  const title = 'Archivo de los mapas ' + test.info().project.name;
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('World premise').fill(
    'Una exploradora visita las ruinas perdidas en un reino lleno de secretos.');
  await dialog.getByLabel('Protagonist').fill('Luna');
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: /Lorebook \(0\)/ }).click();
  await page.getByLabel('Lorebook title').fill('Mapa de las ruinas');
  await page.getByLabel('Lorebook content').fill(
    'Las ruinas esconden una puerta que solo Luna puede abrir con el mapa antiguo.');
  await page.getByLabel('Lorebook keys').fill('ruinas, mapa');
  await page.getByLabel('Lorebook priority').fill('95');
  await page.getByRole('button', { name: 'Create Lorebook entry' }).click();
  await expect(page.getByText(/Entrada de Lorebook guardada/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Lorebook \(1\)/ })).toBeVisible();

  await page.getByLabel('Simulate Lorebook activation').fill('Entro en las ruinas.');
  await page.getByRole('button', { name: 'Preview Lorebook' }).click();
  await expect(page.getByText('1 entrada(s) activada(s)')).toBeVisible();
  await expect(page.locator('.creator-hint[role="status"]').getByText(
    'Mapa de las ruinas · prioridad 95')).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-lorebook.png', fullPage: true,
  });

  await page.getByLabel('Simulate Lorebook activation').fill('Camino por el puerto.');
  await page.getByRole('button', { name: 'Preview Lorebook' }).click();
  await expect(page.getByText('0 entrada(s) activada(s)')).toBeVisible();

  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.locator('.creator-project').filter({ hasText: title }).first().click();
  await page.getByRole('button', { name: /Lorebook \(1\)/ }).click();
  await expect(page.getByText('Mapa de las ruinas · prioridad 95')).toBeVisible();
});

test('Private Lorebook is restricted to present NPC witnesses on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible())
    await welcome.getByRole('button', { name: /Continue al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();

  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const creation = page.getByRole('dialog', { name: 'Create story project' });
  const title = 'Testigo del sello ' + test.info().project.name;
  await creation.getByLabel('Title').fill(title);
  await creation.getByLabel('World premise').fill(
    'Dos personajes exploran una ciudad donde solo uno conoce un antiguo secreto.');
  await creation.getByLabel('Protagonist').fill('Luna');
  await creation.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(creation).toBeHidden();

  await page.getByRole('button', { name: /Characters \(0\)/ }).click();
  await page.getByLabel('Name de NPC').fill('Aira');
  await page.getByLabel('Descripción de NPC').fill(
    'Aira conoce los senderos del reino, aunque evita hablar con viajeros.');
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(page.getByRole('button', { name: /Characters \(1\)/ })).toBeVisible();

  await page.getByRole('button', { name: /Lorebook \(0\)/ }).click();
  await page.getByLabel('Lorebook title').fill('El secreto del sello');
  await page.getByLabel('Lorebook content').fill(
    'La última llave del sello permanece bajo una estatua en el palacio.');
  await page.getByLabel('Lorebook keys').fill('sello');
  await page.getByLabel('Visibilidad de Lorebook').selectOption('witnesses');
  await page.getByRole('checkbox', { name: 'Testigo Aira' }).check();
  await page.getByRole('button', { name: 'Create Lorebook entry' }).click();
  await expect(page.getByText(/Entrada de Lorebook guardada/)).toBeVisible();
  await page.getByLabel('Simulate Lorebook activation').fill('Busco el sello con Aira.');
  await page.getByRole('button', { name: 'Preview Lorebook' }).click();
  await expect(page.getByText('0 entrada(s) activada(s)')).toBeVisible();
  await expect(page.getByText(/1 sin testigos presentes/)).toBeVisible();

  const list = await page.request.get('/api/v1/stories');
  expect(list.ok()).toBeTruthy();
  const story = (await list.json()).stories.find((entry: { title: string }) => entry.title === title);
  expect(story).toBeTruthy();
  const castResponse = await page.request.get('/api/v1/stories/' + story.id + '/creator/characters');
  expect(castResponse.ok()).toBeTruthy();
  const aira = (await castResponse.json()).characters.find(
    (npc: { name: string }) => npc.name === 'Aira');
  expect(aira).toBeTruthy();
  const worldEndpoint = '/api/v1/stories/' + story.id + '/world-state';
  const worldResponse = await page.request.get(worldEndpoint);
  expect(worldResponse.ok()).toBeTruthy();
  const world = await worldResponse.json();
  const update = await page.request.put(worldEndpoint, { data: {
    expected_revision: world.revision,
    state: { ...world.state, present_character_ids: [aira.id] },
  } });
  expect(update.ok()).toBeTruthy();

  await page.getByRole('button', { name: 'Preview Lorebook' }).click();
  await expect(page.getByText('1 entrada(s) activada(s)')).toBeVisible();
  await expect(page.getByText('0 sin testigos presentes')).toBeVisible();
  await expect(page.locator('.creator-hint[role="status"]').getByText(
    'El secreto del sello · prioridad 50')).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-lorebook-witness.png',
    fullPage: true,
  });
});
