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
  await page.route('**/api/v1/creator/assistant/regenerate', async route => {
    const request = route.request().postDataJSON();
    const updated = request.section === 'plot' ? { ...request.draft,
      synopsis: 'Los guardianes de la bahía empiezan a revelar una conspiración que amenaza sus recuerdos.',
      player_plot: 'El muelle ha sido cerrado tras un nuevo encendido del faro, mientras los ciudadanos recuerdan hechos contradictorios.',
      ai_plot: 'La guardiana ha ocultado que los sellos contienen las promesas de los fundadores. El último encendido quebrará el pacto. Sara conoce el ritual de cierre, pero Elio está decidido a sabotearlo y nadie puede adivinar el resultado.',
      guidelines: 'Mantén consecuencias verosímiles y continuidad entre escenas. No decidas por {{user}} ni cambies el pasado establecido.',
      reminder: 'Las promesas de los fundadores están unidas a los tres faros.',
    } : { ...request.draft,
      openings: [
        '{{user}} encuentra una llave brillante junto al faro y escucha pasos detrás de la puerta de la torre abandonada.',
        '{{user}} ve una sombra pasar sobre el muelle y recibe un mensaje urgente de alguien que ya no recuerda su nombre.',
        '{{user}} llega a la plaza y descubre que la campana ha desaparecido mientras el cielo se oscurece por completo.',
      ],
    };
    if (request.instruction === 'verificar edición concurrente') {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ draft: updated, section: request.section, saved: false, model: 'test-mock',
        generation_budget: { context_characters: 3200, input_tokens_estimate: 800,
          max_output_tokens: 3072, estimate_only: true } }) });
  });
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.getByRole('button', { name: 'Create with AI' }).click();
  await expect(page.getByRole('heading', { name: 'Build a world with AI' })).toBeVisible();
  await page.getByLabel('Story idea').fill(
    'En una bahía costera, tres faros guardan los recuerdos de sus habitantes. Las decisiones cambian la memoria del lugar y el destino de sus vecinos.'
  );
  await page.getByLabel('AI story protagonist').fill('Luna');
  await page.getByRole('button', { name: 'Generate proposal' }).click();
  await expect(page.getByRole('heading', { name: 'Review your world before creating it' })).toBeVisible();
  await expect(page.getByText('Model: test-mock')).toBeVisible();
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  await expect(page.getByText('Characters (4)', { exact: true })).toBeVisible();
  await expect(page.getByText('Lorebook (3)', { exact: true })).toBeVisible();
  await page.getByLabel('Editable generated synopsis').fill(
    'Una bahía sin memoria espera que alguien resuelva el secreto de los faros y sus guardianes.'
  );
  await page.getByLabel('Editable generated tags').fill('faro, memoria, secretos');
  await expect(page.getByLabel('Editable generated tags')).toHaveValue('faro, memoria, secretos');
  await page.getByText('El primer faro · Edit lore').click();
  await page.getByLabel('Lorebook triggers 1').fill('faro, luz antigua');
  await expect(page.getByLabel('Lorebook triggers 1')).toHaveValue('faro, luz antigua');
  await page.getByText('Sara · Edit profile').click();
  await page.getByLabel('NPC description 1').fill(
    'Sara conoce los antiguos pactos del puerto, guarda una llave y duda de su misión como guardiana.');
  await page.getByLabel('Generated opening 1').fill(
    '{{user}} llega al muelle y descubre la carta del farero. Una extraña silueta aparece frente a una campana al otro lado de la bahía.');
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-creator-ai-preview.png',
    fullPage: true,
  });
  await page.getByLabel('Section to regenerate').selectOption('openings');
  await page.getByLabel('Regeneration instructions').fill('Aperturas con más misterio');
  await page.getByRole('button', { name: 'Regenerate section' }).click();
  await expect(page.getByLabel('Generated opening 1')).toHaveValue(/llave brillante/);
  await expect(page.getByLabel('NPC description 1')).toHaveValue(/Sara conoce los antiguos pactos/);
  await expect(page.getByRole('button', { name: 'Restore previous version' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore previous version' }).click();
  await expect(page.getByLabel('Generated opening 1')).toHaveValue(/carta del farero/);
  await page.getByLabel('Section to regenerate').selectOption('plot');
  await page.getByRole('button', { name: 'Regenerate section' }).click();
  await expect(page.getByLabel('Editable public plot')).toHaveValue(/muelle ha sido cerrado/);
  await expect(page.getByLabel('Editable generated synopsis')).toHaveValue(/conspiración/);
  await expect(page.getByLabel('NPC description 1')).toHaveValue(/Sara conoce los antiguos pactos/);
  await expect(page.getByLabel('Generated opening 1')).toHaveValue(/carta del farero/);
  await expect(page.getByLabel('Estimated generation budget')).toBeVisible();
  await page.getByLabel('Regeneration instructions').fill('verificar edición concurrente');
  await page.getByRole('button', { name: 'Regenerate section' }).click();
  await page.getByLabel('Editable generated synopsis').fill(
    'Una bahía con una conspiración cuyos secretos cambian tras la última decisión del jugador.'
  );
  await expect(page.getByRole('alert')).toContainText('The draft changed during the request');
  await expect(page.getByLabel('Editable generated synopsis')).toHaveValue(
    'Una bahía con una conspiración cuyos secretos cambian tras la última decisión del jugador.'
  );
  await page.getByRole('button', { name: 'Create story from this draft' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: /Characters \(4\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lorebook \(3\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Plot and context', exact: true }).click();
  await expect(page.getByLabel('Reader synopsis')).toHaveValue(
    'Una bahía con una conspiración cuyos secretos cambian tras la última decisión del jugador.'
  );
  await page.screenshot({
    path: 'test-results/' + test.info().project.name + '-creator-ai-installed.png',
    fullPage: true,
  });
});


test('Creator AI draft survives reload, preserves manual edits, and can be discarded locally', async ({ page }) => {
  const sample = {
    title: 'Draft saved in browser',
    synopsis: 'A coastal fantasy mystery with a carefully preserved premise and meaningful choices.',
    player_plot: 'The sea remembers every promise, but none of the people do.',
    ai_plot: 'The lighthouse guardian hides a promise that costs a memory to reveal.',
    guidelines: 'Keep character motives distinct and player decisions independent.',
    reminder: 'The lighthouse cannot be activated twice in one night.',
    genre: 'Fantasy', tags: ['lighthouse', 'memory'], protagonist_name: 'Luna',
    characters: [{ name: 'Aira', description: 'A lighthouse guardian with a long-standing secret.',
      personality: 'Cautious', dialogue_examples: 'You cannot open that door without a promise.' }],
    lore: [{ title: 'The lantern', content: 'The lantern captures a memory once each evening.', keys: ['light'] }],
    openings: ['Luna arrives at the harbor to find the lighthouse abandoned and the bell ringing.'],
  };
  await page.route('**/api/v1/creator/assistant/draft', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ draft: sample, saved: false, model: 'offline-mock' }) }));
  await page.goto('/');
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  const welcome = page.getByRole('dialog', { name: /Welcome and initial setup/ });
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: /Continue to Model Hub/ }).click();
  }
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await page.getByRole('button', { name: 'Creator Studio' }).click();
  await page.getByRole('button', { name: 'Create with AI' }).click();
  await page.getByLabel('Story idea').fill(
    'A long enough adventure premise about a lighthouse and a secret locked inside the harbor.');
  await page.getByRole('button', { name: 'Generate proposal' }).click();
  await expect(page.getByLabel('Editable generated title')).toHaveValue(sample.title);
  await page.getByLabel('Editable generated title').fill('Edited after generation');
  await page.getByLabel('Editable generated tags').fill('light, sea, a new tag');
  await page.reload();
  await expect(page.locator('main.content')).toHaveAttribute('data-ready', 'yes');
  await page.getByRole('button', { name: 'Create with AI' }).click();
  await expect(page.getByText('Recovered the draft saved in this browser.')).toBeVisible();
  await expect(page.getByLabel('Editable generated title')).toHaveValue('Edited after generation');
  await expect(page.getByLabel('Editable generated tags')).toHaveValue('light, sea, a new tag');
  await expect(page.getByLabel('Story idea')).toHaveValue(/lighthouse and a secret/);
  await page.getByRole('button', { name: 'Discard local draft' }).click();
  await expect(page.getByLabel('Editable generated title')).toHaveCount(0);
  await expect(page.getByLabel('Story idea')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('noble-ai-creator-draft-v1'))).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Create with AI' }).click();
  await expect(page.getByLabel('Editable generated title')).toHaveCount(0);
});
