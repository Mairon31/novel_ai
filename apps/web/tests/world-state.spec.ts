import { expect, test } from '@playwright/test';

test('Creator world-state saves witnesses and restores an immutable turn snapshot', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();

  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Crear proyecto narrativo' });
  const title = 'El mapa y los testigos ' + test.info().project.name;
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel('Premisa del mundo').fill(
    'Una exploradora descubre un secreto antiguo oculto bajo el puerto de la ciudad.');
  await dialog.getByLabel('Protagonista').fill('Luna');
  await dialog.getByRole('button', { name: 'Crear proyecto', exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: /Personajes \(0\)/ }).click();
  await page.getByLabel('Nombre de NPC').fill('Aira');
  await page.getByLabel('Descripción de NPC').fill(
    'Aira es la protectora del faro que conoce los secretos de la ciudad.');
  await page.getByRole('button', { name: 'Añadir personaje' }).click();
  await expect(page.getByRole('button', { name: /Personajes \(1\)/ })).toBeVisible();
  await page.getByLabel('Nombre de NPC').fill('Beto');
  await page.getByLabel('Descripción de NPC').fill(
    'Beto es un viajero que se encuentra por primera vez con la guardiana.');
  await page.getByRole('button', { name: 'Añadir personaje' }).click();
  await expect(page.getByRole('button', { name: /Personajes \(2\)/ })).toBeVisible();

  await page.getByRole('button', { name: 'Estado del mundo' }).click();
  await page.getByLabel('Lugar del mundo').fill('Puerto de niebla');
  await page.getByLabel('Momento del mundo').fill('Anochecer');
  await page.getByLabel('Clima del mundo').fill('Lluvia intensa');
  await page.getByLabel('Inventario del mundo').fill('Mapa del faro\nLlave oxidada');
  await page.getByRole('checkbox', { name: 'Presente Aira' }).check();
  await page.getByLabel('Relación con Aira').fill('Aliada de Luna');

  await page.getByLabel('Nombre de indicador nuevo').fill('faro_encendido');
  await page.getByRole('button', { name: 'Añadir indicador' }).click();
  await page.getByRole('checkbox', { name: 'Indicador faro_encendido' }).check();

  await page.getByRole('button', { name: 'Añadir hecho' }).click();
  await page.getByLabel('Texto del hecho 1').fill(
    'La llave secreta del rey está escondida bajo el faro.');
  await page.getByRole('checkbox', { name: 'Hecho público 1' }).uncheck();
  await page.getByRole('checkbox', { name: 'Testigo Aira del hecho 1' }).check();
  await page.getByRole('button', { name: 'Guardar estado del mundo' }).click();
  await expect(page.locator('.world-state-editor .narrative-saved[role="status"]')).toContainText('Estado confirmado.');

  const response = await page.request.get('/api/v1/stories');
  expect(response.ok()).toBeTruthy();
  const stories = (await response.json()) as { stories: Array<{ id: string; title: string }> };
  const storyId = stories.stories.find(item => item.title === title)?.id;
  expect(storyId).toBeTruthy();
  const base = '/api/v1/stories/' + storyId;
  const world = await (await page.request.get(base + '/world-state')).json();
  expect(world.revision).toBe(1);
  expect(world.state.location).toBe('Puerto de niebla');
  expect(world.state.flags.faro_encendido).toBe(true);
  expect(world.state.present_character_ids).toHaveLength(1);
  expect(world.state.facts[0].witness_character_ids).toEqual(
    world.state.present_character_ids);

  const blueprint = await page.request.put(base + '/creator', { data: {
    opening_scenarios: [
      'Luna despierta en el puerto y descubre las luces del faro lejano.',
    ],
  } });
  expect(blueprint.ok()).toBeTruthy();
  const opening = await page.request.post(base + '/creator/opening', {
    data: { index: 0 },
  });
  expect(opening.ok()).toBeTruthy();
  const turnId = (await opening.json() as { id: string }).id;

  await page.getByLabel('Lugar del mundo').fill('Bosque del futuro');
  await page.getByRole('button', { name: 'Guardar estado del mundo' }).click();
  await expect(page.locator('.world-state-editor .narrative-saved[role="status"]')).toContainText('Estado confirmado.');
  const archived = await page.request.get(base + '/world-state/turns/' + turnId);
  expect(archived.ok()).toBeTruthy();
  expect((await archived.json()).state.location).toBe('Puerto de niebla');

  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-world-state.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.locator('.creator-project').filter({ hasText: title }).first().click();
  await page.getByRole('button', { name: 'Estado del mundo' }).click();
  await expect(page.getByLabel('Lugar del mundo')).toHaveValue('Bosque del futuro');
  await page.getByText('Historial de instantáneas por turno').click();
  await page.getByLabel('Turno histórico del mundo').selectOption(turnId);
  await page.getByRole('button', { name: 'Ver instantánea' }).click();
  await expect(page.getByText('Lugar: Puerto de niebla')).toBeVisible();
});
