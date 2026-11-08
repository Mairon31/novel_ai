import { useTranslation } from 'react-i18next';
import { ArrowRight, Image as ImageIcon, RefreshCcw } from 'lucide-react';
import type { VisualPreflightStatus } from './types';

/** A real first-turn gate, never an image-generation placeholder.
 * The author must save actual files or the reader must opt into text mode. */
export function VisualStartGate({
  status, busy, error, onRefresh, onTextOnly, onIllustrated, onEdit,
}: {
  status: VisualPreflightStatus | null;
  busy: boolean;
  error: string;
  onRefresh: () => void;
  onTextOnly: () => void;
  onIllustrated: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  return <section className="noble-visual-start-gate" aria-label={t('visualStart.title')}>
    <header><ImageIcon size={22}/><div>
      <h2>{t('visualStart.title')}</h2>
      <p>{t('visualStart.intro')}</p>
    </div></header>
    {busy && <p role="status">{t('visualStart.checking')}</p>}
    {error && <p role="alert" className="narrative-error">{error}</p>}
    {status && !status.ready && <ul>
      {status.missing.map((item, index) => <li key={item.character_id || item.kind + index}>
        {item.kind === 'character'
          ? t('visualStart.missingCharacter', { name: item.name || t('visualStart.unnamedCharacter') })
          : t(item.kind === 'cover' ? 'visualStart.missingCover' : 'visualStart.missingBackground')}
      </li>)}
    </ul>}
    {status && status.text_only && status.mode !== 'text' &&
      <p className="noble-visual-choice">{t('visualStart.textOnlyActive')}</p>}
    <div className="noble-visual-start-actions">
      {status && !status.ready && <>
        <button type="button" className="primary-button" disabled={busy} onClick={onEdit}>
          <ImageIcon size={16}/> {t('visualStart.openEditor')} <ArrowRight size={15}/>
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onTextOnly}>
          {t('visualStart.useTextOnly')}</button>
      </>}
      {status?.text_only && status.mode !== 'text' && !status.has_started &&
        <button type="button" className="secondary-button" disabled={busy} onClick={onIllustrated}>
          {t('visualStart.requireVisuals')}</button>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onRefresh}>
        <RefreshCcw size={15}/> {t('visualStart.checkAgain')}</button>
    </div>
    <small>{t('visualStart.noAutoGeneration')}</small>
  </section>;
}
