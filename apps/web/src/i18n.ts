import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es-419.json';
import pt from './locales/pt-BR.json';
import zh from './locales/zh-CN.json';

export const UI_LANGUAGES = [
  { tag: 'en', nativeName: 'English' },
  { tag: 'es-419', nativeName: 'Español (Latinoamérica)' },
  { tag: 'pt-BR', nativeName: 'Português (Brasil)' },
  { tag: 'zh-CN', nativeName: '简体中文' },
] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number]['tag'];
const STORAGE_KEY = 'noble-ui-language';
export const DEFAULT_UI_LANGUAGE: UiLanguage = 'en';

/** Urakatsu-style case-insensitive language tag/alias normalization, independent
 * of story target_language and source_language. Unsupported tags fall back to English. */
export function resolveUiLanguage(input: string | null | undefined): UiLanguage {
  const normalized = (input || '').trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'en' || normalized.startsWith('en-') || normalized === 'english') return 'en';
  if (normalized === 'es' || normalized.startsWith('es-') || normalized === 'spanish' || normalized === 'español') return 'es-419';
  if (normalized === 'pt' || normalized.startsWith('pt-') || normalized === 'portuguese' || normalized === 'português') return 'pt-BR';
  if (normalized === 'zh' || normalized.startsWith('zh-') || normalized === 'chinese' || normalized === '中文') return 'zh-CN';
  return DEFAULT_UI_LANGUAGE;
}
function initialLanguage(): UiLanguage {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return resolveUiLanguage(saved);
  } catch { /* Browser storage may be restricted. */ }
  const choices = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const choice of choices) {
    const language = resolveUiLanguage(choice);
    if (language !== DEFAULT_UI_LANGUAGE || choice.toLowerCase().startsWith('en')) return language;
  }
  return DEFAULT_UI_LANGUAGE;
}
function syncDocumentLanguage(language: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = resolveUiLanguage(language);
  document.documentElement.dir = 'ltr';
  document.title = i18n.t('app.title', { lng: resolveUiLanguage(language) });
}
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'es-419': { translation: es },
    'pt-BR': { translation: pt },
    'zh-CN': { translation: zh },
  },
  lng: typeof window === 'undefined' ? DEFAULT_UI_LANGUAGE : initialLanguage(),
  supportedLngs: UI_LANGUAGES.map(language => language.tag),
  fallbackLng: DEFAULT_UI_LANGUAGE,
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
  returnNull: false,
  initImmediate: false,
  react: { useSuspense: false },
});
i18n.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage(i18n.language || DEFAULT_UI_LANGUAGE);

export async function changeUiLanguage(input: string): Promise<void> {
  const language = resolveUiLanguage(input);
  await i18n.changeLanguage(language);
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch { /* Language still applies for this session. */ }
}
/** Format a UI metric in the currently selected interface language. */
export function formatUiNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(resolveUiLanguage(i18n.language), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export default i18n;
