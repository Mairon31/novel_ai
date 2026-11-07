import { expect, test } from '@playwright/test';

test('story-first bundled hub installs an independent playable world without a model call',
  async ({ page }) => {
    await page.goto('/#/biblioteca');
    await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
    const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
    if (await setup.isVisible())
      await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();

    const hub = page.getByRole('region', { name: 'Discover playable stories' });
    await expect(hub.getByRole('heading', { name: 'Discover a world to play' })).toBeVisible();
    await expect(hub.getByRole('button', { name: /^View story / })).toHaveCount(3);
    await hub.getByRole('button', { name: 'View story Las mareas de vidrio' }).click();
    await expect(hub.getByRole('heading', { name: 'Las mareas de vidrio' })).toBeVisible();
    await expect(hub.getByText('Lía Monterroso · Tomás Ureña')).toBeVisible();
    await expect(hub.getByText('Opening 3')).toBeVisible();
    await hub.getByLabel('Protagonist name for installed story').fill('Sara');

    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-story-hub.png',
      fullPage: true,
    });

    const installed = page.waitForResponse(response =>
      response.url().includes('/api/v1/story-hub/mareas-de-vidrio/install') &&
      response.request().method() === 'POST');
    await hub.getByRole('button', { name: 'Add to my library' }).click();
    const result = await installed;
    expect(result.status()).toBe(201);
    const body = await result.json() as {
      story: { id: string; protagonist_name: string };
      characters_installed: number; lore_installed: number;
      openings_installed: number;
    };
    expect(body.story.protagonist_name).toBe('Sara');
    expect(body.characters_installed).toBe(4);
    expect(body.lore_installed).toBe(3);
    expect(body.openings_installed).toBe(3);

    const detail = page.getByRole('region', { name: 'Detalle de Las mareas de vidrio' });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { name: /Personajes de este mundo/ })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Elige cómo empieza la historia' })).toBeVisible();
    await expect(detail.getByText('Sara recoge un fragmento de vidrio')).toBeVisible();
    const openings = detail.locator('.noble-detail-opening');
    await expect(openings).toHaveCount(3);
    await openings.nth(1).getByRole('button', { name: 'Comenzar con esta apertura' }).click();
    await expect(page.locator('.noble-reader-layout')).toBeVisible();
    await expect(page).toHaveURL(new RegExp('#/historia/' + body.story.id + '/leer$'));
    const turns = await page.request.get('/api/v1/stories/' + body.story.id + '/turns');
    expect(turns.status()).toBe(200);
    const turnsData = await turns.json() as { turns: Array<{ model: string; assistant_text: string }> };
    expect(turnsData.turns).toHaveLength(1);
    expect(turnsData.turns[0].model).toBe('inicio-del-creador');
    expect(turnsData.turns[0].assistant_text).toContain('Sara');
  });


test('Discover Stories has its own shareable route and installs into the library',
  async ({ page }) => {
    await page.goto('/#/descubrir');
    await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
    const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
    if (await welcome.isVisible())
      await welcome.getByRole('button', { name: /Continuar al Model Hub/ }).click();
    await expect(page).toHaveURL(/#\/descubrir$/);
    await expect(page.getByRole('region', { name: 'Catálogo de historias' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historias para jugar' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Catálogo de historias' })).toBeVisible();
    const hub = page.getByRole('region', { name: 'Discover playable stories' });
    await hub.getByRole('button', { name: 'View story El jardín de las horas rotas' }).click();
    const installed = page.waitForResponse(r =>
      r.url().includes('/api/v1/story-hub/jardin-mecanico/install') &&
      r.request().method() === 'POST');
    await hub.getByRole('button', { name: 'Add to my library' }).click();
    const reply = await installed;
    expect(reply.status()).toBe(201);
    const data = await reply.json() as { story: { id: string } };
    await expect(page).toHaveURL(new RegExp('#/historia/' + data.story.id + '$'));
    await expect(page.getByRole('region', { name: 'Detalle de El jardín de las horas rotas' }))
      .toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Elige cómo empieza la historia' }))
      .toBeVisible();
  });
