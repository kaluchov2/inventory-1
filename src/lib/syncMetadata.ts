export interface SyncCursor {
  lastUpdatedAt: string | null;
  lastFullSnapshotAt: string | null;
}

type SyncEntity = "products" | "customers";

interface SyncMetadataState {
  version: string;
  products: SyncCursor;
  customers: SyncCursor;
}

const STORAGE_KEY = "inventory_sync_metadata";
const STORAGE_VERSION = "delta-resync-2026-04-16-v2";
// Any peer write should become visible within this overlap window, or delta catch-up
// may miss it until the next full snapshot fallback.
const CURSOR_OVERLAP_MS = 30_000;

function toTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyCursor(): SyncCursor {
  return {
    lastUpdatedAt: null,
    lastFullSnapshotAt: null,
  };
}

function defaultState(): SyncMetadataState {
  return {
    version: STORAGE_VERSION,
    products: emptyCursor(),
    customers: emptyCursor(),
  };
}

function isValidCursor(value: unknown): value is SyncCursor {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  const { lastUpdatedAt, lastFullSnapshotAt } = candidate;

  return (
    (lastUpdatedAt === null || typeof lastUpdatedAt === "string") &&
    (lastFullSnapshotAt === null || typeof lastFullSnapshotAt === "string")
  );
}

function readState(): SyncMetadataState {
  if (typeof window === "undefined") {
    return defaultState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();

    const parsed = JSON.parse(raw) as Partial<SyncMetadataState>;
    if (parsed.version !== STORAGE_VERSION) {
      return defaultState();
    }

    return {
      version: STORAGE_VERSION,
      products: isValidCursor(parsed.products) ? parsed.products : emptyCursor(),
      customers: isValidCursor(parsed.customers)
        ? parsed.customers
        : emptyCursor(),
    };
  } catch (error) {
    console.warn("[SyncMetadata] Failed to read sync metadata, resetting.", error);
    return defaultState();
  }
}

function writeState(state: SyncMetadataState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[SyncMetadata] Failed to persist sync metadata.", error);
  }
}

function getMaxTimestamp(timestamps: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  let maxTimestamp = Number.NEGATIVE_INFINITY;

  for (const timestamp of timestamps) {
    const timestampMs = toTimestampMs(timestamp);
    if (!timestamp || timestampMs === null) continue;
    if (timestampMs > maxTimestamp) {
      max = timestamp;
      maxTimestamp = timestampMs;
    }
  }

  return max;
}

export function getSyncCursor(entity: SyncEntity): SyncCursor {
  return readState()[entity];
}

export function setSyncCursor(entity: SyncEntity, cursor: SyncCursor) {
  const state = readState();
  state[entity] = cursor;
  writeState(state);
}

export function clearSyncCursor(entity: SyncEntity) {
  const state = readState();
  state[entity] = emptyCursor();
  writeState(state);
}

export function seedSyncCursorFromTimestamps(
  entity: SyncEntity,
  timestamps: Array<string | null | undefined>,
) {
  const existingCursor = getSyncCursor(entity);
  const rowsMax = getMaxTimestamp(timestamps);
  const maxUpdatedAt = getMaxTimestamp([
    rowsMax,
    existingCursor.lastUpdatedAt,
  ]);
  const hasRows = timestamps.some(
    (timestamp) => timestamp !== null && timestamp !== undefined && timestamp !== "",
  );

  setSyncCursor(entity, {
    lastUpdatedAt: maxUpdatedAt,
    lastFullSnapshotAt: hasRows
      ? new Date().toISOString()
      : existingCursor.lastFullSnapshotAt,
  });
}

export function advanceSyncCursor(entity: SyncEntity, updatedAt: string | null | undefined) {
  const nextTimestamp = toTimestampMs(updatedAt);
  if (nextTimestamp === null || !updatedAt) return;

  const cursor = getSyncCursor(entity);
  const currentTimestamp = toTimestampMs(cursor.lastUpdatedAt);
  if (currentTimestamp !== null && nextTimestamp <= currentTimestamp) {
    return;
  }

  setSyncCursor(entity, {
    ...cursor,
    lastUpdatedAt: updatedAt,
  });
}

export function buildNextCursor(
  previous: SyncCursor,
  timestamps: Array<string | null | undefined>,
): SyncCursor {
  const rowsMax = getMaxTimestamp(timestamps);
  const lastUpdatedAt = getMaxTimestamp([rowsMax, previous.lastUpdatedAt]);

  return {
    lastUpdatedAt,
    lastFullSnapshotAt: previous.lastFullSnapshotAt,
  };
}

export function getDeltaWindowStart(cursor: SyncCursor): string | null {
  const lastUpdatedAtMs = toTimestampMs(cursor.lastUpdatedAt);
  if (lastUpdatedAtMs === null) return null;

  const start = lastUpdatedAtMs - CURSOR_OVERLAP_MS;
  return new Date(Math.max(start, 0)).toISOString();
}

export function isFullSnapshotStale(cursor: SyncCursor, maxAgeMs: number): boolean {
  const lastFullSnapshotAtMs = toTimestampMs(cursor.lastFullSnapshotAt);
  if (lastFullSnapshotAtMs === null) return false;

  return Date.now() - lastFullSnapshotAtMs > maxAgeMs;
}
