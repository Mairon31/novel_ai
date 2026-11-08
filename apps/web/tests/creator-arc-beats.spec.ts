import { expect, test } from '@playwright/test';

test('Creator Studio saves and resolves narrative arc milestones without generating turns', async ({ page }) => {
  const created = await page.request.post('/api/v1/stories', { data: {
    title: 'Arc milestones ' + test.info().project.name,
    premise: 'The ruined lighthouse hides a secret map of the archipelago.',
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json() as { id: string }).id;
  await page.goto('/#/creator/' + id);
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const arcs = page.getByRole('region', { name: 'Narrative arc milestones' });
  await expect(arcs).toBeVisible();
  await arcs.getByRole('button', { name: 'Add milestone' }).click();
  await arcs.getByLabel('Arc goal 1').fill('Discover the sealed harbor map');
  await arcs.getByLabel('Intended development 1')
    .fill('Find a witness who can explain the missing navigation charts.');
  await arcs.getByLabel('Milestone status 1').selectOption('active');
  await page.getByRole('button', { name: 'Save plot and context' }).click();
  await expect(page.getByText(/Creator content saved/)).toBeVisible();
  let saved = await (await page.request.get('/api/v1/stories/' + id + '/creator')).json();
  expect(saved.arc_beats).toHaveLength(1);
  expect(saved.arc_beats[0].status).toBe('active');

  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await expect(arcs.getByLabel('Arc goal 1')).toHaveValue('Discover the sealed harbor map');
  await arcs.getByLabel('Milestone status 1').selectOption('resolved');
  await page.getByRole('button', { name: 'Save plot and context' }).click();
  saved = await (await page.request.get('/api/v1/stories/' + id + '/creator')).json();
  expect(saved.arc_beats[0].status).toBe('resolved');
  const history = await (await page.request.get('/api/v1/stories/' + id + '/turns')).json();
  expect(history.turns).toHaveLength(0);
});
