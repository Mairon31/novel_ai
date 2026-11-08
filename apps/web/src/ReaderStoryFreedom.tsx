import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import type { CreatorBlueprint } from './types';

/** Dedicated story-level control; does not modify global narrator settings. */
export function ReaderStoryFreedom({ storyId }: { storyId: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CreatorBlueprint['freedom_mode']>('flexible');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    let alive = true;
    const current = ++request.current;
    setMode('flexible');
    setError('');
    setSaved(false);
    setLoading(true);
    void api.creatorBlueprint(storyId).then(result => {
      if (alive && request.current === current) setMode(result.freedom_mode);
    }).catch((exc: Error) => {
      if (alive && request.current === current) setError(exc.message);
    }).finally(() => {
      if (alive && request.current === current) setLoading(false);
    });
    return () => { alive = false; };
  }, [storyId]);

  async function changeMode(next: CreatorBlueprint['freedom_mode']) {
    if (saving || loading || next === mode) return;
    const current = request.current;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await api.storyFreedom(storyId, next);
      if (request.current === current) {
        setMode(updated.freedom_mode);
        setSaved(true);
      }
    } catch (exc) {
      if (request.current === current) setError((exc as Error).message);
    } finally {
      if (request.current === current) setSaving(false);
    }
  }

  return <section className="noble-story-freedom" aria-label={t('readerModes.storySettings')}>
    <h4>{t('readerModes.storySettings')}</h4>
    <label>{t('storyFreedom.modeLabel')}
      <select aria-label={t('storyFreedom.modeLabel')} value={mode}
        disabled={loading || saving}
        onChange={e => void changeMode(e.target.value as CreatorBlueprint['freedom_mode'])}>
        <option value="guided">{t('storyFreedom.guided')}</option>
        <option value="flexible">{t('storyFreedom.flexible')}</option>
        <option value="strict">{t('storyFreedom.strict')}</option>
      </select>
    </label>
    <p>{t('readerModes.storyFreedomHelp')}</p>
    {saved && <small role="status">{t('readerModes.storySettingsSaved')}</small>}
    {error && <p role="alert" className="narrative-error">{error}</p>}
  </section>;
}
