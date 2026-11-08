import { useId } from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { changeUiLanguage, resolveUiLanguage, UI_LANGUAGES } from './i18n';

/** UI locale is browser-local; no API mutation and no story-language side effect. */
export function InterfaceLanguageSelector({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  return <div className={'noble-interface-language' + (compact ? ' is-compact' : '')}>
    <label htmlFor={id}><Languages size={16} aria-hidden="true"/>
      {!compact && <span>{t('settings.uiLanguage')}</span>}
    </label>
    <select id={id} aria-label={t('settings.uiLanguage')}
      value={resolveUiLanguage(i18n.resolvedLanguage || i18n.language)}
      onChange={event => void changeUiLanguage(event.target.value)}>
      {UI_LANGUAGES.map(language => <option key={language.tag} value={language.tag}>
        {language.nativeName}
      </option>)}
    </select>
  </div>;
}
