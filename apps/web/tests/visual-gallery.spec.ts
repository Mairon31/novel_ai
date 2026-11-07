import { expect, test } from '@playwright/test';

const first = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=', 'base64');
const second = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO8AAAAASUVORK5CYII=', 'base64');

test('persistent visual characters, gallery versions and prompt preview (real API)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const setup = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await setup.isVisible())
    await setup.getByRole('button', { name: /Continue al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'New story' }).click();
  const creation = page.getByRole('dialog', { name: 'Create a new story' });
  await creation.getByLabel('Title').fill('Gallery y personajes');
  await creation.getByLabel('World premise').fill(
    'Una hechicera visita un pueblo escondido entre montañas y ríos.');
  await creation.getByRole('button', { name: 'Choose protagonist' }).click();
  await creation.getByLabel('Protagonist name').fill('Luna');
  await creation.getByRole('button', { name: 'Start story' }).click();
  await expect(creation).toBeHidden();

  await page.getByRole('button', { name: 'Open story details' }).click();
  await page.getByLabel('Visual name').fill('Aira');
  await page.getByLabel('Visual appearance').fill('Cabello plateado largo, ojos verdes intensos.');
  await page.getByLabel('Visual outfit').fill('Túnica azul oscura');
  await page.getByLabel('Visual traits').fill('Cicatriz bajo el ojo derecho');
  await page.getByRole('button', { name: 'Add character visual' }).click();
  await expect(page.getByRole('button', { name: /Aira.*Revision 1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.getByLabel('Lugar actual').fill('Library antigua');
  await page.getByRole('button', { name: 'Confirm scene' }).click();
  await expect(page.getByText('Escenas registradas: 2.')).toBeVisible();
  await page.getByLabel('Describe la escena que quieres ilustrar')
    .fill('Aira en la biblioteca iluminada por velas antiguas');
  await page.getByRole('button', { name: 'View complete prompt and profiles' }).click();
  await expect(page.getByText(/Cabello plateado largo, ojos verdes intensos/)).toBeVisible();

  const upload = page.getByLabel('Upload scene illustration');
  await upload.setInputFiles({ name: 'primera.png', mimeType: 'image/png', buffer: first });
  await expect(page.getByText('Versioned gallery (1)')).toBeVisible();
  await upload.setInputFiles({ name: 'segunda.png', mimeType: 'image/png', buffer: second });
  await expect(page.getByText('Versioned gallery (2)')).toBeVisible();
  const restore = page.getByRole('button', { name: 'Use this version' });
  await expect(restore).toHaveCount(1);
  await restore.click();
  await expect(page.getByText('Versioned gallery (2)')).toBeVisible();
  // Existing art can be used as actual img2img input without losing the original.
  const reference = page.getByRole('combobox', { name: 'Visual reference' });
  const referenceId = await reference.locator('option').nth(1).getAttribute('value');
  expect(referenceId).toBeTruthy();
  await reference.selectOption(referenceId!);
  await expect(page.getByRole('slider', { name: 'Transformation strength' })).toBeVisible();
  // A named character can own a canonical image reference for planned scenes.
  await page.getByRole('button', { name: 'Summary', exact: true }).click();
  await page.getByRole('button', { name: /Aira.*Revision 1/ }).click();
  await page.getByLabel('Referencia del personaje').selectOption(referenceId!);
  await page.getByRole('button', { name: 'Save visual reference' }).click();
  await expect(page.getByRole('button', { name: /Aira.*Revision 2/ })).toBeVisible();
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Personaje visible Aira' }).check();
  await page.getByRole('combobox', { name: 'Scene shot' }).selectOption('closeup');
  await page.getByRole('combobox', { name: 'Scene lighting' }).selectOption('sunset');
  await page.getByLabel('Atmósfera visual').fill('misterio y esperanza');
  await page.getByLabel('Dirección de escena').fill('Aira levanta el medallón.');
  const focus = page.getByRole('combobox', { name: 'Foco visual' });
  const airaValue = await focus.locator('option').nth(1).getAttribute('value');
  expect(airaValue).toBeTruthy();
  await focus.selectOption(airaValue!);
  await page.getByRole('button', { name: 'Save scene plan' }).click();
  await expect(page.getByText(/Plan de escena guardado/)).toBeVisible();
  await page.getByRole('button', { name: 'View complete prompt and profiles' }).click();
  await expect(page.getByText(/Plano: primer plano/)).toBeVisible();
  await expect(page.getByText(/luz cálida del atardecer/)).toBeVisible();
  await page.getByLabel('Image seed').fill('1739');
  await expect(page.getByRole('checkbox', { name: 'Apply character LoRAs' }))
    .not.toBeChecked();
  await page.route('**/api/v1/images/loras', async route => {
    await route.fulfill({
      status: 200, json: { online: true, loras: ['aira.safetensors'], error: null },
    });
  });
  await page.getByRole('button', { name: 'View installed LoRAs' }).click();
  await expect(page.getByText(/1 LoRAs disponibles en ComfyUI/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Apply character LoRAs' }).check();
  let observedReference = false;
  await page.route('**/api/v1/stories/*/illustrate', async route => {
    const payload = route.request().postDataJSON() as {
      reference_asset_id?: string; denoise?: number; seed?: number;
      allow_low_vram?: boolean; apply_character_loras?: boolean;
    };
    expect(payload.reference_asset_id).toBe(referenceId);
    expect(payload.denoise).toBeGreaterThanOrEqual(0.2);
    expect(payload.denoise).toBeLessThanOrEqual(0.95);
    expect(payload.seed).toBe(1739);
    expect(payload.allow_low_vram).toBe(false);
    expect(payload.apply_character_loras).toBe(true);
    observedReference = true;
    await route.fulfill({ status: 503, json: { detail: 'Motor ComfyUI no disponible en la prueba' } });
  });
  await page.getByRole('button', { name: 'Illustrate scene with ComfyUI' }).click();
  await expect(page.getByRole('alert').getByText(/Motor ComfyUI no disponible/)).toBeVisible();
  expect(observedReference).toBeTruthy();
  await expect(page.getByText('Versioned gallery (2)')).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-visual-version-gallery.png', fullPage: true });
});
