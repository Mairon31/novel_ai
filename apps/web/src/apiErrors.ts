import i18n, { resolveUiLanguage } from './i18n';

/**
 * API diagnostics remain in English on the server. Only stable error codes,
 * HTTP statuses and structured validation locations are localized for the UI.
 * Unknown server prose is retained in diagnostic, never treated as a locale key.
 */
export class ApiResponseError extends Error {
  readonly status: number;
  readonly diagnostic: unknown;

  constructor(status: number, message: string, diagnostic: unknown) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = status;
    this.diagnostic = diagnostic;
  }
}

const errorCodes: Record<string, string> = {
  story_not_found: 'apiClient.storyNotFound',
  generation_failed: 'apiClient.generationError',
};

const statusKeys: Record<number, string> = {
  400: 'apiClient.badRequest',
  401: 'apiClient.authenticationRequired',
  403: 'apiClient.accessDenied',
  404: 'apiClient.notFound',
  408: 'apiClient.requestTimeout',
  409: 'apiClient.conflict',
  413: 'apiClient.payloadTooLarge',
  422: 'apiClient.validationError',
  429: 'apiClient.tooManyRequests',
  500: 'apiClient.serverError',
  502: 'apiClient.serviceUnavailable',
  503: 'apiClient.serviceUnavailable',
  504: 'apiClient.requestTimeout',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validationField(detail: unknown): string | null {
  if (!Array.isArray(detail) || detail.length === 0) return null;
  const first = asRecord(detail[0]);
  if (!first || !Array.isArray(first.loc)) return null;
  const segments = first.loc.filter((segment): segment is string =>
    typeof segment === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(segment)
    && segment !== 'body' && segment !== 'query' && segment !== 'path');
  return segments.length ? segments.slice(0, 3).join('.') : null;
}

function localizedErrorMessage(status: number, payload: unknown, fallbackKey: string): string {
  const body = asRecord(payload);
  const code = typeof body?.code === 'string' ? body.code : '';
  if (Object.prototype.hasOwnProperty.call(errorCodes, code)) {
    return i18n.t(errorCodes[code]);
  }

  const detail = body?.detail;
  if (status === 422) {
    const field = validationField(detail);
    if (field) return i18n.t('apiClient.invalidField', { field });
  }

  // Keep the full English diagnostic when English is selected. For other
  // languages, never leak untranslated free-form backend error messages.
  if (resolveUiLanguage(i18n.language) === 'en' &&
      typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  const key = statusKeys[status] || fallbackKey;
  return i18n.t(key, { status });
}

/** Decode every JSON API failure through one locale-aware UI boundary. */
export async function responseFailure(
  response: Response, fallbackKey = 'apiClient.httpError',
): Promise<ApiResponseError> {
  const payload: unknown = await response.json().catch(() => null);
  return new ApiResponseError(
    response.status, localizedErrorMessage(response.status, payload, fallbackKey), payload,
  );
}

/** SSE error messages are diagnostics, not user-visible translation strings. */
export function streamFailure(payload: unknown): ApiResponseError {
  return new ApiResponseError(
    0, localizedErrorMessage(0, payload, 'apiClient.generationError'), payload,
  );
}

/** Use the same localized connection error on all JSON, media and SSE requests. */
export async function fetchWithApiError(
  input: RequestInfo | URL, init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (cause) {
    if (init?.signal?.aborted || (cause instanceof Error && cause.name === 'AbortError')) {
      throw cause;
    }
    throw new ApiResponseError(0, i18n.t('apiClient.networkError'), cause);
  }
}
