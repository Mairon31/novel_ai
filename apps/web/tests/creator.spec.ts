import { expect, test } from '@playwright/test';

test('Creator Studio keeps author-only story data separate from reader', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready','yes');
  const setup=page.getByRole('dialog',{name:/Welcome and initial setup/});
  if(await setup.isVisible()) {
    await setup.getByRole('button',{name:/Continue al Model Hub/}).click();
  }
  if(test.info().project.name==='mobile')
    await page.getByRole('button',{name:'Open menu'}).click();
  await page.getByRole('button',{name:'Creator Studio'}).click();
  await expect(page.getByRole('heading',{name:/Construye historias/})).toBeVisible();

  await page.getByRole('button',{name:'Create project',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Create story project'});
  const projectTitle = 'El mundo de Aira '+test.info().project.name;
  await dialog.getByLabel('Título').fill(projectTitle);
  await dialog.getByLabel('World premise').fill(
    'La aventura comienza en una biblioteca secreta bajo una montaña encantada.');
  await dialog.getByLabel('Protagonist').fill('Luna');
  await dialog.getByRole('button',{name:'Create project',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading',{name:projectTitle})).toBeVisible();

  await page.getByLabel('Sinopsis para lectores').fill(
    'Una ciudad repleta de misterios que nadie conoce.');
  await page.getByLabel('Contexto interno de la IA').fill(
    'El antiguo alcalde esconde la llave detrás del castillo.');
  await page.getByLabel('Directrices de narración').fill(
    'No controles las decisiones de Luna; describe las reacciones de los NPC.');
  await page.getByRole('button',{name:'Guardar trama y contexto'}).click();
  await expect(page.getByText(/Contenido del creador guardado/)).toBeVisible();

  await page.getByRole('button',{name:/Characters \(0\)/}).click();
  await page.getByLabel('Nombre de NPC').fill('Aira');
  await page.getByLabel('Descripción de NPC').fill(
    'Una bibliotecaria dedicada que protege los registros secretos de la ciudad.');
  await page.getByLabel('Personalidad de NPC').fill('Sarcástica, reservada y muy observadora.');
  await page.getByRole('button',{name:'Add character'}).click();
  await expect(page.getByText(/Ficha narrativa del personaje guardada/)).toBeVisible();
  await expect(page.getByRole('button',{name:/Characters \(1\)/})).toBeVisible();

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
    await page.getByRole('button',{name:'Open menu'}).click();
  await page.getByRole('button',{name:'Creator Studio'}).click();
  await page.locator('.creator-project').filter({hasText:projectTitle}).first().click();
  await expect(page.getByLabel('Contexto interno de la IA')).toHaveValue(
    'El antiguo alcalde esconde la llave detrás del castillo.');
  await page.getByRole('button',{name:/Characters \(1\)/}).click();
  await expect(page.locator('.creator-character-list button').filter({hasText:'Aira'}).first()).toBeVisible();
});
