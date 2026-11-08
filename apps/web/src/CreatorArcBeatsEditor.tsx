import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { ArcBeat } from './types';

/** Explicit editorial milestones. No turn is generated when a beat is edited. */
export function CreatorArcBeatsEditor({
  beats, onChange, disabled,
}: {
  beats: ArcBeat[]; onChange: (beats: ArcBeat[]) => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  const replace = (id: string, patch: Partial<ArcBeat>) => onChange(
    beats.map(beat => beat.id === id ? { ...beat, ...patch } : beat));
  return <section className="creator-arc-beats" aria-label={t('arcBeats.title')}>
    <header>
      <h3>{t('arcBeats.title')}</h3>
      <p>{t('arcBeats.description')}</p>
    </header>
    {beats.map((beat, i) => <div className="creator-arc-beat" key={beat.id}>
      <div className="creator-arc-beat-head">
        <strong>{t('arcBeats.item', { index: i + 1 })}</strong>
        <button className="secondary-button" type="button"
          disabled={disabled} onClick={() => onChange(beats.filter(x => x.id !== beat.id))}>
          <Trash2 size={14}/> {t('arcBeats.remove')}
        </button>
      </div>
      <label>{t('arcBeats.goal')}
        <input aria-label={t('arcBeats.goal') + ' ' + (i + 1)}
          disabled={disabled} value={beat.title} maxLength={140}
          onChange={e => replace(beat.id, { title: e.target.value })}/>
      </label>
      <label>{t('arcBeats.development')}
        <textarea aria-label={t('arcBeats.development') + ' ' + (i + 1)}
          disabled={disabled} value={beat.aim} rows={3} maxLength={500}
          onChange={e => replace(beat.id, { aim: e.target.value })}/>
      </label>
      <label>{t('arcBeats.status')}
        <select aria-label={t('arcBeats.status') + ' ' + (i + 1)}
          value={beat.status} disabled={disabled}
          onChange={e => replace(beat.id, { status: e.target.value as ArcBeat['status'] })}>
          <option value="planned">{t('arcBeats.planned')}</option>
          <option value="active">{t('arcBeats.active')}</option>
          <option value="resolved">{t('arcBeats.resolved')}</option>
        </select>
      </label>
    </div>)}
    <button className="secondary-button" type="button"
      disabled={disabled || beats.length >= 8}
      onClick={() => onChange([...beats, {
        id: crypto.randomUUID(), title: '', aim: '', status: 'planned',
      }])}>
      <Plus size={15}/> {t('arcBeats.add')}
    </button>
    <small>{t('arcBeats.hint')}</small>
  </section>;
}
