import { expect, test } from '@playwright/test';

test('author can inspect full prepared prompt without running an LLM', async ({ page }) => {
  const title = 'Inspector del palacio ' + test.info().project.name;
  const newStory = await page.request.post('/api/v1/stories', { data: {
    title, premise: 'Una guardiana custodia un mapa oculto en una biblioteca antigua.',
    protagonist_name: 'Luna',
  } });
  expect(newStory.status()).toBe(201);
  const story = await newStory.json();
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Narration', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Narrative context inspector' });
  await expect(inspector).toBeVisible();
  await inspector.getByLabel('Story to inspect').selectOption(story.id);
  await inspector.getByLabel('Input to inspect').fill(
    'Abro un libro escondido en el palacio.');
  await inspector.getByRole('button', { name: 'Inspect context' }).click();
  await expect(inspector.getByText('Estimated prompt budget')).toBeVisible();
  await expect(inspector.getByText(/estimated input tokens/)).toBeVisible();
  await inspector.getByText('View all messages sent to the engine').click();
  await expect(inspector.locator('pre').filter({
    hasText: 'The protagonist does: Abro un libro escondido en el palacio.',
  })).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-context-inspector.png',
    fullPage: true,
  });
});
