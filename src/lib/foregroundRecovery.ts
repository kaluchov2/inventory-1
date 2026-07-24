import type { ConnectionStatus } from './connectionStatus';

export type ForegroundRecoveryResult = 'disconnected' | 'pending' | 'completed';

interface ForegroundRecoveryDependencies {
  source: string;
  forceCheck: () => Promise<ConnectionStatus>;
  syncPendingOperations: () => Promise<void>;
  getPendingCount: () => number;
  loadChanges: Array<() => Promise<void>>;
  log?: (...args: unknown[]) => void;
}

export async function runForegroundRecovery({
  source,
  forceCheck,
  syncPendingOperations,
  getPendingCount,
  loadChanges,
  log = console.log,
}: ForegroundRecoveryDependencies): Promise<ForegroundRecoveryResult> {
  log(`[Sync] Foreground trigger (${source}), checking connectivity...`);
  const connection = await forceCheck();
  if (!connection.isOnline || !connection.isSupabaseConnected) {
    log(`[Sync] Foreground catch-up deferred (${source}) because Supabase is not connected`);
    return 'disconnected';
  }

  log(`[Sync] Foreground connection ready (${source}), flushing queue and running delta catch-up...`);
  await syncPendingOperations();

  const pendingCount = getPendingCount();
  if (pendingCount > 0) {
    log('[Sync] Foreground catch-up deferred because queue still has pending operations');
    return 'pending';
  }

  await Promise.all(loadChanges.map((load) => load()));
  return 'completed';
}
