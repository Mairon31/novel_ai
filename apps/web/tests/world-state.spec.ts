import { expect, test } from '@playwright/test';

test('Creator world-state saves witnesses and restores an immutable turn snapshot', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();

  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create story project' });
  const title = 'El mapa y los testigos ' + test.info().project.name;
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('World premise').fill(
    'Una exploradora descubre un secreto antiguo oculto bajo el puerto de la ciudad.');
  await dialog.getByLabel('Protagonist').fill('Luna');
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: /Characters \(0\)/ }).click();
  await page.getByLabel('NPC name').fill('Aira');
  await page.getByLabel('NPC description').fill(
    'Aira es la protectora del faro que conoce los secretos de la ciudad.');
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(page.getByRole('button', { name: /Characters \(1\)/ })).toBeVisible();
  await page.getByLabel('NPC name').fill('Beto');
  await page.getByLabel('NPC description').fill(
    'Beto es un viajero que se encuentra por primera vez con la guardiana.');
  await page.getByRole('button', { name: 'Add character' }).click();
  await expect(page.getByRole('button', { name: /Characters \(2\)/ })).toBeVisible();

  await page.getByRole('button', { name: 'World state' }).click();
  await page.getByLabel('World location').fill('Puerto de niebla');
  await page.getByLabel('World time of day').fill('Anochecer');
  await page.getByLabel('World weather').fill('Lluvia intensa');
  await page.getByLabel('World inventory').fill('Mapa del faro\nLlave oxidada');
  await page.getByRole('checkbox', { name: 'Present Aira' }).check();
  await page.getByLabel('Relationship with Aira').fill('Aliada de Luna');

  await page.getByLabel('New flag name').fill('faro_encendido');
  await page.getByRole('button', { name: 'Add flag' }).click();
  await page.getByRole('checkbox', { name: 'Flag faro_encendido' }).check();

  await page.getByRole('button', { name: 'Add fact' }).click();
  await page.getByLabel('Fact text 1').fill(
    'La llave secreta del rey está escondida bajo el faro.');
  await page.getByRole('checkbox', { name: 'Public fact 1' }).uncheck();
  await page.getByRole('checkbox', { name: 'Witness Aira for fact 1' }).check();
  await page.getByRole('button', { name: 'Save world state' }).click();
  await expect(page.locator('.world-state-editor .narrative-saved[role="status"]')).toContainText('State confirmed.');

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

  await page.getByLabel('World location').fill('Bosque del futuro');
  await page.getByRole('button', { name: 'Save world state' }).click();
  await expect(page.locator('.world-state-editor .narrative-saved[role="status"]')).toContainText('State confirmed.');
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
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.locator('.creator-project').filter({ hasText: title }).first().click();
  await page.getByRole('button', { name: 'World state' }).click();
  await expect(page.getByLabel('World location')).toHaveValue('Bosque del futuro');
  await page.getByText('Turn snapshot history').click();
  await page.getByLabel('Historical world turn').selectOption(turnId);
  await page.getByRole('button', { name: 'View snapshot' }).click();
  await expect(page.getByText('Location: Puerto de niebla')).toBeVisible();
});
