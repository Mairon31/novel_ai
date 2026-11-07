import { expect, test } from '@playwright/test';

test('Creator Studio keeps author-only story data separate from reader', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready','yes');
  const setup=page.getByRole('dialog',{name:/Welcome and initial setup/});
  if(await setup.isVisible()) {
    await setup.getByRole('button',{name:/Continue to Model Hub/}).click();
  }
  if(test.info().project.name==='mobile')
    await page.getByRole('button',{name:'Open menu'}).click();
  await page.getByRole('button',{name:'Creator Studio'}).click();
  await expect(page.getByRole('heading',{name:/Construye historias/})).toBeVisible();

  await page.getByRole('button',{name:'Create project',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Create story project'});
  const projectTitle = 'El mundo de Aira '+test.info().project.name;
  await dialog.getByLabel('Title').fill(projectTitle);
  await dialog.getByLabel('World premise').fill(
    'La aventura comienza en una biblioteca secreta bajo una montaña encantada.');
  await dialog.getByLabel('Protagonist').fill('Luna');
  await dialog.getByRole('button',{name:'Create project',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading',{name:projectTitle})).toBeVisible();

  await page.getByLabel('Reader synopsis').fill(
    'Una ciudad repleta de misterios que nadie conoce.');
  await page.getByLabel('Private AI context').fill(
    'El antiguo alcalde esconde la llave detrás del castillo.');
  await page.getByLabel('Narration guidelines').fill(
    'No controles las decisiones de Luna; describe las reacciones de los NPC.');
  await page.getByRole('button',{name:'Save plot and context'}).click();
  await expect(page.getByText(/Creator content saved/)).toBeVisible();

  await page.getByRole('button',{name:/Characters \(0\)/}).click();
  await page.getByLabel('NPC name').fill('Aira');
  await page.getByLabel('NPC description').fill(
    'Una bibliotecaria dedicada que protege los registros secretos de la ciudad.');
  await page.getByLabel('NPC personality').fill('Sarcástica, reservada y muy observadora.');
  await page.getByRole('button',{name:'Add character'}).click();
  await expect(page.getByText(/Character narrative profile saved/)).toBeVisible();
  await expect(page.getByRole('button',{name:/Characters \(1\)/})).toBeVisible();

  await page.getByRole('button',{name:'Aperturas'}).click();
  await page.getByLabel('New opening').fill(
    '{{user}} despierta en una biblioteca y escucha los pasos del bibliotecario.');
  await page.getByRole('button',{name:'Add opening'}).click();
  await page.getByRole('button',{name:'Save openings'}).click();
  await expect(page.getByRole('button',{name:'Use as story opening'})).toBeVisible();

  await page.getByRole('button',{name:'Plot and context'}).click();
  await expect(page.getByLabel('Private AI context')).toHaveValue(
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
  await expect(page.getByLabel('Private AI context')).toHaveValue(
    'El antiguo alcalde esconde la llave detrás del castillo.');
  await page.getByRole('button',{name:/Characters \(1\)/}).click();
  await expect(page.locator('.creator-character-list button').filter({hasText:'Aira'}).first()).toBeVisible();
});
