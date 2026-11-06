import { useEffect, useState } from 'react';
import { Download, ExternalLink, LoaderCircle, RefreshCcw } from 'lucide-react';
import { api } from './api';
import type { Updates, WorkspacePreferences } from './types';

interface Props {
  prefs: WorkspacePreferences;
  parentBusy: boolean;
  onChangeChannel: (value: WorkspacePreferences['update_channel']) => void;
  onAutoCheck: (enabled: boolean) => void;
}

/** Release checks are exclusively scoped to the Updates settings page. */
export function UpdatesSettingsPanel({ prefs, parentBusy, onChangeChannel, onAutoCheck }: Props) {
  const [release, setRelease] = useState<Updates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    setRelease(null);
    api.updates().then(result => { if (mounted) setRelease(result); })
      .catch((exc: Error) => { if (mounted) setError(exc.message); });
    return () => { mounted = false; };
  }, [prefs.update_channel]);
  async function refreshReleases() {
    setBusy(true); setError('');
    try { setRelease(await api.updates(true)); }
    catch (exc) { setError((exc as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="updates-settings-panel">
    {error && <p role="alert" className="narrative-error">{error}</p>}
          <div className="setting-section-intro"><h2>Actualizaciones</h2>
            <p>Consulta publicaciones y decide qué canal de versiones quieres recibir.</p></div>
          <div className="workspace-panel">
            <h3><Download size={17}/> Estado de las versiones</h3>
            <div className="workspace-field-grid">
              <label className="workspace-pref-field">Canal de versiones
                <select aria-label="Canal de versiones" value={prefs.update_channel}
                  disabled={busy || parentBusy}
                  onChange={e => onChangeChannel(e.target.value as WorkspacePreferences['update_channel'])}>
                  <option value="stable">Stable · versiones probadas</option>
                  <option value="beta">Beta · versiones preliminares</option>
                  <option value="nightly">Nightly · cambios recientes</option>
                </select>
              </label>
            </div>
            <label className="workspace-pref-toggle">
              <span>Comprobar novedades al abrir la aplicación</span>
              <input type="checkbox" checked={prefs.check_updates_on_start}
                disabled={busy || parentBusy} onChange={e => onAutoCheck(e.target.checked)}/>
            </label>
            {release && <div className="workspace-release-card">
              {release.check_success ? release.release ? <>
                <strong>{release.release.name}</strong>
                <span>Publicación encontrada para el canal {release.channel}.</span>
                {release.release.url && <a href={release.release.url} target="_blank" rel="noreferrer">
                  Ver publicación <ExternalLink size={14}/></a>}
              </> : <span>No hay releases publicadas para el canal {release.channel}.</span> :
                <span>{release.message}</span>}
            </div>}
            <p>Esta ejecución es de código fuente. Podemos consultar releases pero no instalar una actualización automáticamente hasta disponer de un empaquetador, verificación de integridad y rollback.</p>
            <button className="secondary-button" disabled={busy} onClick={() => void refreshReleases()}>
              {busy ? <LoaderCircle size={16} className="rotating"/> : <RefreshCcw size={16}/>}
              Comprobar actualizaciones</button>
          </div>
  </div>;
}
