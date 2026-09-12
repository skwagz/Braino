export interface ConnectionStatus {
  mode: 'demo' | 'live';
  connected: boolean;
  email?: string;
  csrfToken: string;
  config: { google: boolean; llm: boolean };
  classifier: string;
}

export async function loadConnection(): Promise<ConnectionStatus> {
  const response = await fetch('/api/status', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Cannot reach Braino. Check the server and try again.');
  const status = await response.json() as ConnectionStatus;
  if (!['demo', 'live'].includes(status.mode) || typeof status.connected !== 'boolean' ||
      typeof status.csrfToken !== 'string' || typeof status.config?.google !== 'boolean') {
    throw new Error('Braino returned an invalid connection status.');
  }
  return status;
}

export async function connectDrive(): Promise<void> {
  const status = await loadConnection();
  if (status.mode === 'demo') throw new Error('This server is using sample data. Google Drive connection requires live mode.');
  if (!status.config.google) throw new Error('Google Drive connection is not configured on this server yet.');
  window.location.assign('/auth/google/start');
}
