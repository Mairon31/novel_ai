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
    await setup.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva historia' }).click();
  const creation = page.getByRole('dialog', { name: 'Crear una nueva historia' });
  await creation.getByLabel('Título').fill('Galería y personajes');
  await creation.getByLabel('Premisa del mundo').fill(
    'Una hechicera visita un pueblo escondido entre montañas y ríos.');
  await creation.getByRole('button', { name: 'Elegir protagonista' }).click();
  await creation.getByLabel('Nombre del protagonista').fill('Luna');
  await creation.getByRole('button', { name: 'Empezar historia' }).click();
  await expect(creation).toBeHidden();

  await page.getByRole('button', { name: 'Open story details' }).click();
  await page.getByLabel('Nombre visual').fill('Aira');
  await page.getByLabel('Apariencia visual').fill('Cabello plateado largo, ojos verdes intensos.');
  await page.getByLabel('Vestuario visual').fill('Túnica azul oscura');
  await page.getByLabel('Rasgos visuales').fill('Cicatriz bajo el ojo derecho');
  await page.getByRole('button', { name: 'Añadir personaje visual' }).click();
  await expect(page.getByRole('button', { name: /Aira.*Revisión 1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Galería', exact: true }).click();
  await page.getByLabel('Lugar actual').fill('Biblioteca antigua');
  await page.getByRole('button', { name: 'Confirmar escenario' }).click();
  await expect(page.getByText('Escenas registradas: 2.')).toBeVisible();
  await page.getByLabel('Describe la escena que quieres ilustrar')
    .fill('Aira en la biblioteca iluminada por velas antiguas');
  await page.getByRole('button', { name: 'Ver prompt completo y fichas' }).click();
  await expect(page.getByText(/Cabello plateado largo, ojos verdes intensos/)).toBeVisible();

  const upload = page.getByLabel('Subir ilustración de escena');
  await upload.setInputFiles({ name: 'primera.png', mimeType: 'image/png', buffer: first });
  await expect(page.getByText('Versioned gallery (1)')).toBeVisible();
  await upload.setInputFiles({ name: 'segunda.png', mimeType: 'image/png', buffer: second });
  await expect(page.getByText('Versioned gallery (2)')).toBeVisible();
  const restore = page.getByRole('button', { name: 'Usar esta versión' });
  await expect(restore).toHaveCount(1);
  await restore.click();
  await expect(page.getByText('Versioned gallery (2)')).toBeVisible();
  // Existing art can be used as actual img2img input without losing the original.
  const reference = page.getByRole('combobox', { name: 'Referencia visual' });
  const referenceId = await reference.locator('option').nth(1).getAttribute('value');
  expect(referenceId).toBeTruthy();
  await reference.selectOption(referenceId!);
  await expect(page.getByRole('slider', { name: 'Intensidad de transformación' })).toBeVisible();
  // A named character can own a canonical image reference for planned scenes.
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await page.getByRole('button', { name: /Aira.*Revisión 1/ }).click();
  await page.getByLabel('Referencia del personaje').selectOption(referenceId!);
  await page.getByRole('button', { name: 'Guardar referencia visual' }).click();
  await expect(page.getByRole('button', { name: /Aira.*Revisión 2/ })).toBeVisible();
  await page.getByRole('button', { name: 'Galería', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Personaje visible Aira' }).check();
  await page.getByRole('combobox', { name: 'Plano de escena' }).selectOption('closeup');
  await page.getByRole('combobox', { name: 'Luz de escena' }).selectOption('sunset');
  await page.getByLabel('Atmósfera visual').fill('misterio y esperanza');
  await page.getByLabel('Dirección de escena').fill('Aira levanta el medallón.');
  const focus = page.getByRole('combobox', { name: 'Foco visual' });
  const airaValue = await focus.locator('option').nth(1).getAttribute('value');
  expect(airaValue).toBeTruthy();
  await focus.selectOption(airaValue!);
  await page.getByRole('button', { name: 'Guardar plan de escena' }).click();
  await expect(page.getByText(/Plan de escena guardado/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver prompt completo y fichas' }).click();
  await expect(page.getByText(/Plano: primer plano/)).toBeVisible();
  await expect(page.getByText(/luz cálida del atardecer/)).toBeVisible();
  await page.getByLabel('Semilla de imagen').fill('1739');
  await expect(page.getByRole('checkbox', { name: 'Aplicar LoRAs de personajes' }))
    .not.toBeChecked();
  await page.route('**/api/v1/images/loras', async route => {
    await route.fulfill({
      status: 200, json: { online: true, loras: ['aira.safetensors'], error: null },
    });
  });
  await page.getByRole('button', { name: 'Ver LoRAs instalados' }).click();
  await expect(page.getByText(/1 LoRAs disponibles en ComfyUI/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Aplicar LoRAs de personajes' }).check();
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
  await page.getByRole('button', { name: 'Ilustrar escena con ComfyUI' }).click();
  await expect(page.getByRole('alert').getByText(/Motor ComfyUI no disponible/)).toBeVisible();
  expect(observedReference).toBeTruthy();
  await expect(page.getByText('Versioned gallery (2)')).toBeVisible();
  await page.screenshot({ path: 'test-results/' + test.info().project.name +
    '-visual-version-gallery.png', fullPage: true });
});
