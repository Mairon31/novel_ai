import { expect, test } from '@playwright/test';

const spriteSheet = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAAAgCAYAAACFM/9sAAAAm0lEQVR4nO3QoRHCQBgF4YQKUkZKQFBCBBoVjUZcCSfQ6Ch0REpApISUQQlohpnHDCvZT979z2zTSNL/aj9e1sMzLvaPLn33yynut+Ee98epxP081rgv11vc18s57qeyxP1Yh7f9Lh3rOwNCBoQMCBkQMiBkQMiAkAEhA0IGhAwIGRAyIGRAyICQASEDQgaEDAgZEDIgZEBJ0s9e1qoTMHTLUx0AAAAASUVORK5CYII=',
  'base64');

test('Creator Studio persists canonical DNA and imports five sprite variants',
  async ({ page }) => {
    const created = await page.request.post('/api/v1/stories', { data: {
      title: 'Identidad visual ' + test.info().project.name,
      premise: 'Aira camina por el castillo de cristal.',
      protagonist_name: 'Luna',
    } });
    expect(created.status()).toBe(201);
    const story = await created.json() as { id: string };
    const profile = await page.request.post(
      '/api/v1/stories/' + story.id + '/visual-characters', {
        data: { name: 'Aira', appearance: 'Aira tiene el rostro sereno y cabello largo.',
                outfit: 'Túnica de biblioteca', distinguishing_features: 'Anillo de cristal' },
      });
    expect(profile.status()).toBe(201);
    const visual = await profile.json() as { id: string };
    await page.goto('/#/creator/' + story.id);
    await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
    const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
    if (await setup.isVisible())
      await setup.getByRole('button', { name: /Continue to Model Hub/ }).click();
    await page.getByRole('button', { name: /Characters \(0\)/ }).click();
    await page.getByLabel('NPC name').fill('Aira');
    await page.getByLabel('NPC visual profile').selectOption(visual.id);
    await page.getByLabel('NPC description').fill(
      'Aira protege las llaves del castillo antiguo de cristal.');
    await page.getByLabel('Visual tags').fill('cabello negro, ojos verdes');
    await page.getByLabel('Visual seed').fill('6789');
    await page.getByRole('button', { name: 'Add character' }).click();
    await expect(page.getByText(/Character narrative profile saved/)).toBeVisible();
    await page.locator('.creator-character-list button').filter({ hasText: 'Aira' }).click();
    await expect(page.getByLabel('Visual tags')).toHaveValue(
      'cabello negro, ojos verdes');
    await expect(page.getByLabel('Visual tags')).toBeDisabled();
    await expect(page.getByLabel('Visual seed')).toHaveValue('6789');
    await expect(page.getByLabel('NPC visual profile')).toHaveValue(visual.id);
    const cast = await page.request.get('/api/v1/stories/' + story.id + '/creator/characters');
    expect(cast.status()).toBe(200);
    expect((await cast.json()).characters[0].visual_character_id).toBe(visual.id);
    await page.getByRole('button', { name: /Images/ }).click();
    await page.getByLabel('Expression-sheet character').selectOption({ label: 'Aira' });
    await page.getByLabel('Sheet context').fill('Aira castillo cristal');
    await page.getByLabel('Expression-sheet file').setInputFiles({
      name: 'expressions.png', mimeType: 'image/png', buffer: spriteSheet,
    });
    await page.getByRole('button', { name: 'Import five expressions' }).click();
    await expect(page.getByText(/Imported 5 character expressions/)).toBeVisible();
    await expect(page.locator('.creator-media-card')).toHaveCount(5);
    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-expression-sheet.png',
      fullPage: true,
    });
  });
