import { API_URL, apiRequest, ApiError } from './api';
import { getLastSyncVersion, initRemoteSync, setLastSyncVersion } from './store';

let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let active = false;
let reconnectAttempt = 0;

function reconnectDelay(): number {
  const base = Math.min(1000 * 2 ** reconnectAttempt, 30000);
  reconnectAttempt += 1;
  return Math.round(base * (1 + Math.random()));
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void initRemoteSync();
  }, 100);
}

function cleanup() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (source) {
    source.close();
    source = null;
  }
}

async function connect() {
  if (!active) return;
  try {
    const { ticket } = await apiRequest<{ ticket: string }>('/sync/stream-ticket', { method: 'POST' });
    if (!active) return;
    const lastId = getLastSyncVersion();
    source = new EventSource(`${API_URL}/sync/stream?ticket=${encodeURIComponent(ticket)}&last_id=${lastId}`);
    source.onopen = () => {
      reconnectAttempt = 0;
    };
    source.onmessage = (event) => {
      if (event.lastEventId) {
        setLastSyncVersion(event.lastEventId);
      }
      try {
        const data = JSON.parse(event.data) as { type?: string };
        if (data.type === 'resync_required') void initRemoteSync();
        else scheduleRefresh();
      } catch {
        scheduleRefresh();
      }
    };
    source.onerror = () => {
      cleanup();
      if (!active) return;
      reconnectTimer = setTimeout(() => void connect(), reconnectDelay());
    };
  } catch (e) {
    if (!active) return;
    if (e instanceof ApiError && e.status === 401) return;
    reconnectTimer = setTimeout(() => void connect(), reconnectDelay());
  }
}

export function startCrmRealtime(): void {
  if (active) return;
  active = true;
  reconnectAttempt = 0;
  void connect();
}

export function stopCrmRealtime(): void {
  active = false;
  reconnectAttempt = 0;
  cleanup();
}
