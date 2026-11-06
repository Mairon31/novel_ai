import { expect, test } from '@playwright/test';

test('AI Creator previews a whole world before an explicit local install', async ({ page }) => {
  const title = 'La bahía de las memorias - ' + test.info().project.name;
  const draft = {
    title,
    synopsis: 'La memoria de una bahía depende de tres faros que nadie recuerda haber encendido.',
    player_plot: 'Cada noche un faro se enciende solo y parte de los habitantes pierde recuerdos. Se necesita investigar sin dejar que otros elijan por el protagonista.',
    ai_plot: 'La guardiana conoce el secreto del faro original. Los tres faros son sellos de una antigua promesa. Si se apagan todos, la bahía volverá al tiempo real, pero alguien deberá asumir el coste. Los NPC tienen motivos contradictorios.',
    guidelines: 'No decidir nunca por {{user}}. Ofrecer pistas antes de revelaciones y respetar consecuencias, continuidad, ubicación y testigos.',
    reminder: 'Cada faro cambia la memoria de alguien que vive en la bahía.',
    genre: 'Fantasía', tags: ['faro', 'memoria'],
    protagonist_name: 'Luna',
    openings: [
      '{{user}} llega a la bahía al atardecer y descubre una nota sobre los faros. En ese instante, una luz desconocida ilumina el antiguo muelle.',
      '{{user}} encuentra una llave de bronce bajo una puerta cerrada. Una desconocida espera afuera y pregunta quién encendió el faro durante la noche.',
      '{{user}} despierta en una habitación que no reconoce y escucha una campana a través de la niebla. Una carta en la mesa pide ayuda urgentemente.',
    ],
    characters: ['Sara', 'Elio', 'Mara', 'Nico'].map(name => ({
      name,
      description: name + ' protege un recuerdo antiguo de la bahía y conoce una pista importante sobre el estado de los faros.',
      personality: 'Observador, prudente y leal a su interpretación de los hechos.',
      dialogue_examples: 'Antes de encender el faro debemos buscar una salida segura.',
    })),
    lore: [
      { title: 'El primer faro', content: 'El primer faro controla las mareas y conserva antiguos recuerdos de la comunidad pesquera.', keys: ['faro'] },
      { title: 'La bahía', content: 'La bahía quedó detenida en el tiempo durante una tormenta de hace muchos años.', keys: ['bahía'] },
      { title: 'La campana', content: 'La campana anuncia cada cambio y altera el recuerdo de quienes la escuchan.', keys: ['campana'] },
    ],
  };
  await page.route('**/api/v1/creator/assistant/draft', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ draft, saved: false, stages_completed: 3, model: 'test-mock' }),
    });
  });
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Bienvenida y configuración inicial/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continuar al Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.getByRole('button', { name: 'Crear con IA' }).click();
  await expect(page.getByRole('heading', { name: 'Construye un mundo con IA' })).toBeVisible();
  await page.getByLabel('Idea para generar historia').fill(
    'En una bahía costera, tres faros guardan los recuerdos de sus habitantes. Las decisiones cambian la memoria del lugar y el destino de sus vecinos.'
  );
  await page.getByLabel('Protagonista de historia IA').fill('Luna');
  await page.getByRole('button', { name: 'Generar propuesta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa el mundo antes de crearlo' })).toBeVisible();
  await expect(page.getByText('Modelo: test-mock')).toBeVisible();
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  await expect(page.getByText('Personajes (4)', { exact: true })).toBeVisible();
  await expect(page.getByText('Lorebook (3)', { exact: true })).toBeVisible();
  await page.getByLabel('Sinopsis generada editable').fill(
    'Una bahía sin memoria espera que alguien resuelva el secreto de los faros y sus guardianes.'
  );
  await page.getByLabel('Etiquetas generadas editables').fill('faro, memoria, secretos');
  await expect(page.getByLabel('Etiquetas generadas editables')).toHaveValue('faro, memoria, secretos');
  await page.getByText('El primer faro · Editar conocimiento').click();
  await page.getByLabel('Activadores Lorebook 1').fill('faro, luz antigua');
  await expect(page.getByLabel('Activadores Lorebook 1')).toHaveValue('faro, luz antigua');
  await page.getByText('Sara · Editar ficha').click();
  await page.getByLabel('Descripción NPC 1').fill(
    'Sara conoce los antiguos pactos del puerto, guarda una llave y duda de su misión como guardiana.');
  await page.getByLabel('Apertura generada 1').fill(
    '{{user}} llega al muelle y descubre la carta del farero. Una extraña silueta aparece frente a una campana al otro lado de la bahía.');
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-creator-ai-preview.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Crear historia con esta propuesta' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: /Personajes \(4\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lorebook \(3\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Trama y contexto', exact: true }).click();
  await expect(page.getByLabel('Sinopsis para lectores')).toHaveValue(
    'Una bahía sin memoria espera que alguien resuelva el secreto de los faros y sus guardianes.'
  );
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-creator-ai-installed.png',
    fullPage: true,
  });
});
