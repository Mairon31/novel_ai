import { expect, test } from '@playwright/test';

test('HTTP diagnostics remain English on the API but UI errors follow all four locales', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/v1/health', route => route.fulfill({
    status: 404, contentType: 'application/json',
    body: JSON.stringify({ detail: 'Story not found' }),
  }));

  const cases = [
    ['en', 'Story not found'],
    ['es-419', 'No se encontró el recurso solicitado.'],
    ['pt-BR', 'O recurso solicitado não foi encontrado.'],
    ['zh-CN', '未找到请求的资源。'],
  ] as const;

  for (const [locale, expected] of cases) {
    const actual = await page.evaluate(async language => {
      const { changeUiLanguage } = await import('/src/i18n.ts');
      const { api } = await import('/src/api.ts');
      await changeUiLanguage(language);
      try {
        await api.health();
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    }, locale);
    expect(actual).toBe(expected);
  }
});

test('Structured validation and narrator SSE errors do not leak server prose', async ({ page }) => {
  await page.goto('/');
  await page.route('**/api/v1/health', route => route.fulfill({
    status: 422, contentType: 'application/json',
    body: JSON.stringify({ detail: [{ loc: ['body', 'api_key'], msg: 'Field required' }] }),
  }));

  const actual = await page.evaluate(async () => {
    const { changeUiLanguage } = await import('/src/i18n.ts');
    const { api } = await import('/src/api.ts');
    const { streamFailure } = await import('/src/apiErrors.ts');
    await changeUiLanguage('es-419');
    let validation = '';
    try {
      await api.health();
    } catch (error) {
      validation = (error as Error).message;
    }
    const stream = streamFailure({
      code: 'generation_failed', message: 'Local GPU busy. Try again.',
    });
    const unknown = streamFailure({ message: 'No narrator configured' });
    return { validation, stream: stream.message, unknown: unknown.message, diagnostic: stream.diagnostic };
  });
  expect(actual.validation).toBe('Revisa el valor de api_key.');
  expect(actual.stream).toBe('El narrador no pudo terminar de generar este turno.');
  expect(actual.unknown).toBe(actual.stream);
  expect(actual.diagnostic).toEqual({
    code: 'generation_failed', message: 'Local GPU busy. Try again.',
  });
});
