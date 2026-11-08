import { useTranslation } from 'react-i18next';

/** The backend's original English diagnostic is available only on demand.
 * Interface feedback remains translated in the active language. */
export function BackendDiagnostic({ detail, className }: {
  detail: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!detail) return null;
  return <div className={className} role="alert">
    <span>{t('apiClient.backgroundTaskFailed')}</span>
    <details>
      <summary>{t('apiClient.showTechnicalDetails')}</summary>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{detail}</pre>
    </details>
  </div>;
}
