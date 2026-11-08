import { useTranslation } from 'react-i18next';
import { MoonStar } from 'lucide-react';
import type { About } from './types';

interface Props { about: About | null; modelsDir: string; }

/** Static product information; never invokes the updater. */
export function AboutSettingsPanel({ about, modelsDir }: Props) {
  const { t } = useTranslation();
  return <div className="about-settings-panel">
          <div className="setting-section-intro"><h2>{t('about.title')}</h2>
            <p>{t('about.description')}</p></div>
          <div className="workspace-panel">
            <div className="workspace-about-title"><MoonStar size={27}/><div><strong>Noble AI</strong><span>{t('about.localStudio')}</span></div></div>
            {about && <div className="workspace-diagnostics-list">
              <div><span>{t('about.version')}</span><code>{about.version}</code></div>
              <div><span>{t('about.commit')}</span><code>{about.commit}</code></div>
              <div><span>{t('about.installType')}</span><code>{about.build_type}</code></div>
              <div><span>{t('about.data')}</span><code>{about.data_dir}</code></div>
              <div><span>{t('about.models')}</span><code>{modelsDir || about.models_dir}</code></div>
              <div><span>{t('about.python')}</span><code>{about.python}</code></div>
            </div>}
          </div>
  </div>;
}
