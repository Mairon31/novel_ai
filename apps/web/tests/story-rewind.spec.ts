import { expect, test } from '@playwright/test';

test('safe rewind previews historical facts and creates an independent route', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();

  const title = 'La línea temporal del faro ' + test.info().project.name;
  const created = await page.request.post('/api/v1/stories', {
    data: {
      title,
      premise: 'Una viajera investiga un antiguo faro y el secreto de sus guardianes.',
      protagonist_name: 'Luna',
    },
  });
  expect(created.status()).toBe(201);
  const storyId = (await created.json() as { id: string }).id;
  const base = '/api/v1/stories/' + storyId;
  const originalLore = await page.request.post(base + '/lorebook', {
    data: {
      title: 'El faro original',
      content: 'El faro protege una llave que todavía nadie ha conseguido.',
      keys: ['faro'],
    },
  });
  expect(originalLore.status()).toBe(201);
  const world = await page.request.put(base + '/world-state', {
    data: { expected_revision: 0, state: { location: 'Puerto antiguo' } },
  });
  expect(world.ok()).toBeTruthy();
  const creator = await page.request.put(base + '/creator', {
    data: {
      opening_scenarios: [
        'Luna observa el faro del puerto antes de descubrir el misterio.',
      ],
    },
  });
  expect(creator.ok()).toBeTruthy();
  const opened = await page.request.post(base + '/creator/opening', {
    data: { index: 0 },
  });
  expect(opened.status()).toBe(201);
  const turnId = (await opened.json() as { id: string }).id;

  // Secrets and author edits made AFTER this turn must stay in the original.
  const edit = await page.request.put(
    base + '/lorebook/' + (await originalLore.json() as { id: string }).id, {
      data: {
        title: 'El faro original',
        content: 'El faro pertenece en realidad a la hermana perdida de Luna.',
        keys: ['faro'],
      },
    });
  expect(edit.ok()).toBeTruthy();
  const added = await page.request.post(base + '/lorebook', {
    data: {
      title: 'Revelación del final',
      content: 'La impostora conoce la identidad del enemigo escondido.',
      keys: ['faro'],
    },
  });
  expect(added.status()).toBe(201);

  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('.noble-library-cover').filter({ hasText: title }).first().click();
  await page.getByRole('button', { name: 'Continue story' }).click();
  await page.getByRole('button', { name: 'Open story details' }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Rewind here' }).click();

  const dialog = page.getByRole('dialog', { name: 'Confirm rewind' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Historical Lorebook: 1 entries');
  await expect(dialog).toContainText('World state: Puerto antiguo');
  await expect(dialog).toContainText('original story');
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-rewind-dialog.png',
    fullPage: true,
  });

  // Cancel is a no-op; only explicit confirmation creates a new route.
  await dialog.getByRole('button', { name: 'Stay here' }).click();
  await expect(dialog).toBeHidden();
  type StoryList = { stories: Array<{ id: string; origin_story_id: string | null }> };
  let stories: StoryList = await (await page.request.get('/api/v1/stories')).json();
  expect(stories.stories.filter(item => item.origin_story_id === storyId)).toHaveLength(0);

  await page.getByRole('button', { name: 'Rewind here' }).click();
  await expect(dialog).toContainText('Historical Lorebook: 1 entries');
  await dialog.getByRole('button', { name: 'Create branch from this turn' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.noble-reader-chapter')).toContainText('(rama)');

  stories = await (await page.request.get('/api/v1/stories')).json();
  const branch = stories.stories.find(item => item.origin_story_id === storyId);
  expect(branch?.id).toBeTruthy();
  expect(branch?.id).not.toBe(storyId);
  const oldLore = (await (await page.request.get(base + '/lorebook')).json()) as {
    entries: Array<{ content: string }> };
  const branchedLore = (await (await page.request.get(
    '/api/v1/stories/' + branch!.id + '/lorebook')).json()) as {
      entries: Array<{ content: string }> };
  expect(oldLore.entries).toHaveLength(2);
  expect(oldLore.entries[0].content).toContain('hermana perdida');
  expect(branchedLore.entries).toHaveLength(1);
  expect(branchedLore.entries[0].content).toContain('protege una llave');
  expect(branchedLore.entries[0].content).not.toContain('hermana perdida');
  const branchTurns = (await (await page.request.get(
    '/api/v1/stories/' + branch!.id + '/turns')).json()) as {
      turns: Array<{ id: string }> };
  expect(branchTurns.turns).toHaveLength(1);
  expect(branchTurns.turns[0].id).not.toBe(turnId);
});
