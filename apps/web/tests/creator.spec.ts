import { expect, test } from '@playwright/test';

test('Creator Studio keeps author-only story data separate from reader', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready','yes');
  const setup=page.getByRole('dialog',{name:/Bienvenida y configuración inicial/});
  if(await setup.isVisible()) {
    await setup.getByRole('button',{name:/Continuar al Model Hub/}).click();
  }
  if(test.info().project.name==='mobile')
    await page.getByRole('button',{name:'Abrir menú'}).click();
  await page.getByRole('button',{name:'Creator Studio'}).click();
  await expect(page.getByRole('heading',{name:/Construye historias/})).toBeVisible();

  await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Crear proyecto narrativo'});
  await dialog.getByLabel('Título').fill('El mundo de Aira');
  await dialog.getByLabel('Premisa del mundo').fill(
    'La aventura comienza en una biblioteca secreta bajo una montaña encantada.');
  await dialog.getByLabel('Protagonista').fill('Luna');
  await dialog.getByRole('button',{name:'Crear proyecto',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading',{name:'El mundo de Aira'})).toBeVisible();

  await page.getByLabel('Sinopsis para lectores').fill(
    'Una ciudad repleta de misterios que nadie conoce.');
  await page.getByLabel('Contexto interno de la IA').fill(
    'El antiguo alcalde esconde la llave detrás del castillo.');
  await page.getByLabel('Directrices de narración').fill(
    'No controles las decisiones de Luna; describe las reacciones de los NPC.');
  await page.getByRole('button',{name:'Guardar trama y contexto'}).click();
  await expect(page.getByText(/Contenido del creador guardado/)).toBeVisible();

  await page.getByRole('button',{name:/Personajes \(0\)/}).click();
  await page.getByLabel('Nombre de NPC').fill('Aira');
  await page.getByLabel('Descripción de NPC').fill(
    'Una bibliotecaria dedicada que protege los registros secretos de la ciudad.');
  await page.getByLabel('Personalidad de NPC').fill('Sarcástica, reservada y muy observadora.');
  await page.getByRole('button',{name:'Añadir personaje'}).click();
  await expect(page.getByText(/Ficha narrativa del personaje guardada/)).toBeVisible();
  await expect(page.getByRole('button',{name:/Personajes \(1\)/})).toBeVisible();

  await page.getByRole('button',{name:'Aperturas'}).click();
  await page.getByLabel('Nueva apertura').fill(
    '{{user}} despierta en una biblioteca y escucha los pasos del bibliotecario.');
  await page.getByRole('button',{name:'Añadir apertura'}).click();
  await page.getByRole('button',{name:'Guardar aperturas'}).click();
  await expect(page.getByRole('button',{name:'Utilizar como inicio de esta historia'})).toBeVisible();

  await page.getByRole('button',{name:'Trama y contexto'}).click();
  await expect(page.getByLabel('Contexto interno de la IA')).toHaveValue(
    'El antiguo alcalde esconde la llave detrás del castillo.');
  await page.screenshot({
    path:'test-results/'+test.info().project.name+'-creator-studio.png',fullPage:true,
  });

  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready','yes');
  if(test.info().project.name==='mobile')
    await page.getByRole('button',{name:'Abrir menú'}).click();
  await page.getByRole('button',{name:'Creator Studio'}).click();
  await page.getByRole('button',{name:/El mundo de Aira/}).click();
  await expect(page.getByLabel('Contexto interno de la IA')).toHaveValue(
    'El antiguo alcalde esconde la llave detrás del castillo.');
  await page.getByRole('button',{name:/Personajes \(1\)/}).click();
  await expect(page.getByText('Aira')).toBeVisible();
});
