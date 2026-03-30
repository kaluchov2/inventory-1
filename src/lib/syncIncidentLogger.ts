export type SyncIncidentLevel = 'info' | 'warn' | 'error';

export interface SyncIncident {
  id: string;
  at: string;
  level: SyncIncidentLevel;
  event: string;
  message: string;
  meta?: Record<string, unknown>;
  app: {
    href?: string;
    path?: string;
    visibility?: string;
    online?: boolean;
    userAgent?: string;
  };
}

const MAX_STORED_INCIDENTS = 200;
const MAX_META_CHARS = 6_000;
const POST_TIMEOUT_MS = 4_000;
const DUPLICATE_WINDOW_MS = 10_000;
const lastIncidentByFingerprint = new Map<string, number>();
const memoryIncidents: SyncIncident[] = [];

function toSafeMeta(meta: unknown): Record<string, unknown> | undefined {
  if (meta === undefined) return undefined;

  try {
    const json = JSON.stringify(
      meta,
      (_, value) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }
        if (typeof value === 'function') return '[function]';
        if (typeof value === 'bigint') return value.toString();
        return value;
      },
    );

    if (!json) return undefined;

    const trimmed =
      json.length > MAX_META_CHARS
        ? `${json.slice(0, MAX_META_CHARS)}...(truncated)`
        : json;

    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { value: String(meta) };
  }
}

function persistIncident(incident: SyncIncident) {
  memoryIncidents.push(incident);
  if (memoryIncidents.length > MAX_STORED_INCIDENTS) {
    memoryIncidents.splice(0, memoryIncidents.length - MAX_STORED_INCIDENTS);
  }
}

function shouldSkipAsDuplicate(
  level: SyncIncidentLevel,
  event: string,
  message: string,
  meta: Record<string, unknown> | undefined,
): boolean {
  const fingerprint = `${level}|${event}|${message}|${JSON.stringify(meta ?? {})}`;
  const now = Date.now();
  const previous = lastIncidentByFingerprint.get(fingerprint);
  lastIncidentByFingerprint.set(fingerprint, now);
  if (!previous) return false;
  return now - previous < DUPLICATE_WINDOW_MS;
}

function shouldSendToServer(level: SyncIncidentLevel, event: string): boolean {
  if (level === 'error' || level === 'warn') return true;
  return event === 'sync_stalled_queue';
}

async function postIncidentToServer(incident: SyncIncident): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    await fetch('/api/sync-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(incident),
      keepalive: true,
      signal: controller.signal,
    });
  } catch {
    // Best-effort telemetry; never break app flow.
  } finally {
    window.clearTimeout(timer);
  }
}

export function logSyncIncident(
  level: SyncIncidentLevel,
  event: string,
  message: string,
  meta?: unknown,
) {
  const safeMeta = toSafeMeta(meta);
  if (shouldSkipAsDuplicate(level, event, message, safeMeta)) return;

  const incident: SyncIncident = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level,
    event,
    message,
    meta: safeMeta,
    app:
      typeof window === 'undefined'
        ? {}
        : {
            href: window.location.href,
            path: window.location.pathname,
            visibility: document.visibilityState,
            online: navigator.onLine,
            userAgent: navigator.userAgent,
          },
  };

  if (level === 'error') {
    console.error('[SyncIncident]', event, message, safeMeta ?? {});
  } else if (level === 'warn') {
    console.warn('[SyncIncident]', event, message, safeMeta ?? {});
  } else {
    console.log('[SyncIncident]', event, message, safeMeta ?? {});
  }

  persistIncident(incident);

  if (shouldSendToServer(level, event)) {
    void postIncidentToServer(incident);
  }
}

export function getStoredSyncIncidents(): SyncIncident[] {
  return [...memoryIncidents];
}

export function clearStoredSyncIncidents(): void {
  memoryIncidents.length = 0;
}
