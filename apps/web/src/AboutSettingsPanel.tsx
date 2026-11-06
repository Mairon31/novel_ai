import { MoonStar } from 'lucide-react';
import type { About } from './types';

interface Props { about: About | null; modelsDir: string; }

/** Static product information; never invokes the updater. */
export function AboutSettingsPanel({ about, modelsDir }: Props) {
  return <div className="about-settings-panel">
          <div className="setting-section-intro"><h2>Acerca de Noble AI</h2>
            <p>Versión, compilación y ubicación de los archivos de usuario.</p></div>
          <div className="workspace-panel">
            <div className="workspace-about-title"><MoonStar size={27}/><div><strong>Noble AI</strong><span>Local Story Studio</span></div></div>
            {about && <div className="workspace-diagnostics-list">
              <div><span>Versión</span><code>{about.version}</code></div>
              <div><span>Commit</span><code>{about.commit}</code></div>
              <div><span>Tipo de instalación</span><code>{about.build_type}</code></div>
              <div><span>Datos</span><code>{about.data_dir}</code></div>
              <div><span>Modelos</span><code>{modelsDir || about.models_dir}</code></div>
              <div><span>Python</span><code>{about.python}</code></div>
            </div>}
          </div>
  </div>;
}
