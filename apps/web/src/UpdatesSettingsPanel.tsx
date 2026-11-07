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
          <div className="setting-section-intro"><h2>Updates</h2>
            <p>Review releases and choose your preferred update channel.</p></div>
          <div className="workspace-panel">
            <h3><Download size={17}/> Release status</h3>
            <div className="workspace-field-grid">
              <label className="workspace-pref-field">Release channel
                <select aria-label="Release channel" value={prefs.update_channel}
                  disabled={busy || parentBusy}
                  onChange={e => onChangeChannel(e.target.value as WorkspacePreferences['update_channel'])}>
                  <option value="stable">Stable · tested releases</option>
                  <option value="beta">Beta · preview releases</option>
                  <option value="nightly">Nightly · recent changes</option>
                </select>
              </label>
            </div>
            <label className="workspace-pref-toggle">
              <span>Check for updates when the app starts</span>
              <input type="checkbox" checked={prefs.check_updates_on_start}
                disabled={busy || parentBusy} onChange={e => onAutoCheck(e.target.checked)}/>
            </label>
            {release && <div className="workspace-release-card">
              {release.check_success ? release.release ? <>
                <strong>{release.release.name}</strong>
                <span>Release found for channel {release.channel}.</span>
                {release.release.url && <a href={release.release.url} target="_blank" rel="noreferrer">
                  View release <ExternalLink size={14}/></a>}
              </> : <span>No releases published for channel {release.channel}.</span> :
                <span>{release.message}</span>}
            </div>}
            <p>This source build can check releases but cannot install them automatically until packaging, integrity verification, and rollback are available.</p>
            <button className="secondary-button" disabled={busy} onClick={() => void refreshReleases()}>
              {busy ? <LoaderCircle size={16} className="rotating"/> : <RefreshCcw size={16}/>}
              Check for updates</button>
          </div>
  </div>;
}
