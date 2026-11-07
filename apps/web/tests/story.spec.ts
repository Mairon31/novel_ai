import { expect, test } from '@playwright/test';

test('create a story and render SSE turn with the real UI (mocked LLM response)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible()) {
    await setup.getByRole('button', { name: /Continue al Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Stories to experience/ })).toBeVisible();

  await page.getByRole('button', { name: 'New story' }).click();
  const creator = page.getByRole('dialog', { name: 'Create a new story' });
  const title = 'Prueba visual de la torre '+test.info().project.name;
  await creator.getByLabel('Title').fill(title);
  await creator.getByLabel('World premise').fill(
    'En una biblioteca encantada, una hechicera protege el mapa perdido de los reinos.'
  );
  await creator.getByRole('button', { name: 'Choose protagonist' }).click();
  await creator.getByLabel('Protagonist name').fill('Joel');
  await creator.getByRole('button', { name: 'Start story' }).click();
  await expect(creator).toBeHidden();
  await expect(page.locator('.noble-reader-chapter')).toContainText(title);

  await page.route('**/api/v1/stories/*/generate', async route => {
    const path = new URL(route.request().url()).pathname;
    const storyId = path.split('/')[4];
    const input = route.request().postDataJSON() as {
      input_text: string; request_id: string; mode: 'do';
    };
    const text = 'Una hechicera abre la puerta y señala un libro antiguo.';
    const turn = {
      id: 'd4dff873-461d-4ccd-b5e4-fad14cadcafe',
      story_id: storyId, request_id: input.request_id,
      mode: input.mode, input_text: input.input_text,
      assistant_text: text, model: 'visual-qa-fixture', created_at: 1793820000,
    };
    await route.fulfill({
      status: 200, contentType: 'text/event-stream',
      body: 'event: delta\ndata: ' + JSON.stringify({ text }) +
        '\n\nevent: done\ndata: ' + JSON.stringify({ turn, replayed: false }) + '\n\n',
    });
  });
  await page.getByRole('textbox', { name: 'Your input in the story' })
    .fill('Abro el libro que hay sobre el mostrador.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.noble-reader-prose').getByText('Una hechicera abre la puerta y señala un libro antiguo.')).toBeVisible();
  await expect(page.getByText('Abro el libro que hay sobre el mostrador.')).toBeVisible();
  await page.getByRole('button', { name: 'Open story details' }).click();
  const inspector = page.locator('.noble-reader-inspector.is-open');
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveCSS('position', 'fixed');
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page.locator('.noble-reader-inspector.is-open')).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-story-reader.png',
    fullPage: true,
  });
  // Reader is its own experience, with no nested bookshelf above it.
  await expect(page.locator('.noble-library-cover-grid')).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to library' }).click();
  await expect(page.locator('.noble-reader-layout')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /My stories/ })).toBeVisible();
  await expect(page.locator('.noble-library-cover').filter({ hasText: title }).first()).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-bookshelf.png',
    fullPage: true,
  });
});
