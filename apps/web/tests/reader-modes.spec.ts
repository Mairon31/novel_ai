import { expect, test } from '@playwright/test';

test.afterEach(async ({ request }) => {
  await request.patch('/api/v1/workspace/preferences', {
    data: { reader_layout: 'immersive' },
  });
});

async function openIllustratedReader(page: import('@playwright/test').Page, project: string) {
  const title = 'Lectura con backlog ' + project;
  const created = await page.request.post('/api/v1/stories', { data: {
    title,
    premise: 'Una investigadora cruza el jardín prohibido y encuentra un diario.',
    protagonist_name: 'Mika',
  }});
  expect(created.status()).toBe(201);
  const story = await created.json() as { id: string };
  const author = await page.request.put('/api/v1/stories/' + story.id + '/creator', {
    data: { opening_scenarios: [
      'Mika encuentra un diario violeta bajo un árbol del jardín prohibido.',
    ] },
  });
  expect(author.status()).toBe(200);
  const first = await page.request.post('/api/v1/stories/' + story.id + '/creator/opening',
    { data: { index: 0 } });
  expect(first.status()).toBe(201);
  await page.request.patch('/api/v1/workspace/preferences', {
    data: { reader_layout: 'immersive', shortcuts_enabled: true },
  });
  await page.goto('/#/historia/' + story.id + '/leer');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();
  await expect(page.locator('.noble-reader-chapter')).toContainText(title);
  await expect(page.locator('.noble-reading-turn')).toHaveCount(1);
  return { title, id: story.id };
}

test('VN, book and chat keep the same scene and persist preference after reload',
  async ({ page }) => {
    const { title } = await openIllustratedReader(page, test.info().project.name);
    const reader = page.locator('.noble-reader-layout');
    await expect(reader).toHaveAttribute('data-reader-mode', 'immersive');
    await page.getByRole('button', { name: 'Open story details' }).click();
    const inspector = page.locator('.noble-reader-inspector.is-open');
    await inspector.getByRole('button', { name: 'UI/UX' }).click();
    await inspector.getByRole('button', { name: 'Book', exact: true }).click();
    await expect(reader).toHaveAttribute('data-reader-mode', 'classic');
    await expect(reader.locator('.noble-scene-panel')).toBeHidden();
    await inspector.getByRole('button', { name: 'Chat', exact: true }).click();
    await expect(reader).toHaveAttribute('data-reader-mode', 'chat');
    await expect(reader.locator('.noble-scene-panel')).toBeHidden();
    await expect(reader.locator('.noble-reading-turn')).toHaveCount(1);
    await page.getByRole('button', { name: 'Close details', exact: true }).click();
    await page.reload();
    await expect(reader).toHaveAttribute('data-reader-mode', 'chat');
    await expect(reader.locator('.noble-reading-turn')).toHaveCount(1);
    await expect(page.locator('.noble-reader-chapter')).toContainText(title);
    const pref = await page.request.get('/api/v1/workspace/preferences');
    expect((await pref.json()).reader_layout).toBe('chat');
    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-reader-chat.png',
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Open backlog' }).click();
    const backlog = page.getByRole('dialog', { name: 'Story backlog' });
    await expect(backlog).toBeVisible();
    await expect(backlog).toContainText('Mika encuentra un diario violeta');
    await backlog.getByRole('searchbox', { name: 'Search backlog' }).fill('sin coincidencia');
    await expect(backlog.getByText('No matches in the loaded scenes.'))
      .toBeVisible();
    await backlog.getByRole('searchbox', { name: 'Search backlog' }).fill('diario violeta');
    await expect(backlog.getByRole('button', { name: 'Go to scene' })).toBeVisible();
    await backlog.getByRole('button', { name: 'Go to scene' }).click();
    await expect(backlog).toBeHidden();
    await expect(reader.locator('.noble-reading-turn')).toHaveCount(1);
  });

test('backlog and HUD shortcuts restore controls without changing saved turns',
  async ({ page }) => {
    const { id } = await openIllustratedReader(page, test.info().project.name);
    const reader = page.locator('.noble-reader-layout');
    await page.locator('.noble-reader-chapter').click();
    await page.keyboard.press('Alt+h');
    await expect(reader).toHaveClass(/is-hud-hidden/);
    await expect(page.getByRole('button', { name: 'Show reader interface' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Your input in the story' }))
      .toBeHidden();
    await page.keyboard.press('Alt+h');
    await expect(reader).not.toHaveClass(/is-hud-hidden/);
    await expect(page.getByRole('textbox', { name: 'Your input in the story' }))
      .toBeVisible();
    await page.keyboard.press('Alt+b');
    const backlog = page.getByRole('dialog', { name: 'Story backlog' });
    await expect(backlog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(backlog).toBeHidden();

    await page.keyboard.press('Alt+2');
    await expect(reader).toHaveAttribute('data-reader-mode', 'classic');
    await page.keyboard.press('Alt+3');
    await expect(reader).toHaveAttribute('data-reader-mode', 'chat');
    await page.keyboard.press('Alt+1');
    await expect(reader).toHaveAttribute('data-reader-mode', 'immersive');
    const turns = await page.request.get('/api/v1/stories/' + id + '/turns');
    expect((await turns.json()).turns).toHaveLength(1);
    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-reader-vn-hud.png',
      fullPage: true,
    });
  });
