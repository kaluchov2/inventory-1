import { supabase } from './supabase';
import { logSyncIncident } from './syncIncidentLogger';

/**
 * Connection status manager
 * Tracks Supabase connection state and network availability
 */
class ConnectionStatusManager {
  private readonly DEBUG_LOGS_ENABLED = true;
  private readonly CONNECTIVITY_TIMEOUT_MS = 10_000;
  private readonly SESSION_REFRESH_RETRY_WINDOW_MS = 120_000;
  private listeners: Set<(status: ConnectionStatus) => void> = new Set();
  private currentStatus: ConnectionStatus = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSupabaseConnected: false,
    lastChecked: new Date(),
  };

  constructor() {
    this.initialize();
  }

  private logDebug(message: string, meta?: unknown) {
    if (!this.DEBUG_LOGS_ENABLED) return;
    const timestamp = new Date().toISOString();
    if (meta === undefined) {
      console.log(`[ConnectionStatus][${timestamp}] ${message}`);
      return;
    }
    console.log(`[ConnectionStatus][${timestamp}] ${message}`, meta);
  }

  private initialize() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.logDebug('Browser online event');
      logSyncIncident('info', 'browser_online', 'Browser reported online state');
      this.updateStatus({ isOnline: true });
    });
    window.addEventListener('offline', () => {
      this.logDebug('Browser offline event');
      logSyncIncident('warn', 'browser_offline', 'Browser reported offline state');
      this.updateStatus({ isOnline: false });
    });

    const runForegroundCheck = (source: string) => {
      this.logDebug(`${source}: checking Supabase connectivity`);
      this.checkSupabaseConnection();
    };

    // Re-check aggressively when users return to the app after idle/sleep.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        runForegroundCheck('Visibility change');
      }
    });
    window.addEventListener('focus', () => runForegroundCheck('Window focus'));
    window.addEventListener('pageshow', () => runForegroundCheck('Page show'));

    this.checkSupabaseConnection();
    setInterval(() => this.checkSupabaseConnection(), 30_000); // Check every 30s
  }

  private isLikelyAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const err = error as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
      status?: number;
    };

    const text = [err.message, err.details, err.hint]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const code = (err.code || '').toLowerCase();
    const status = Number(err.status || 0);

    return (
      status === 401 ||
      status === 403 ||
      code === 'pgrst301' ||
      code === 'jwt_expired' ||
      text.includes('jwt') ||
      text.includes('token') ||
      text.includes('not authenticated') ||
      text.includes('permission denied')
    );
  }

  private async tryRefreshSession(reason: string): Promise<boolean> {
    if (!supabase) return false;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        this.logDebug('Session check failed before refresh', {
          reason,
          error: sessionError,
        });
        return false;
      }

      const session = sessionData.session;
      if (!session) {
        this.logDebug('No session available for refresh attempt', { reason });
        return false;
      }

      const expiresAtMs =
        typeof session.expires_at === 'number'
          ? session.expires_at * 1000
          : null;
      const expiresSoon =
        expiresAtMs !== null &&
        expiresAtMs - Date.now() <= this.SESSION_REFRESH_RETRY_WINDOW_MS;
      const shouldForceRefresh =
        reason.includes('auth') || reason.includes('connectivity_probe');

      if (!expiresSoon && !shouldForceRefresh) {
        this.logDebug('Session still valid; skipping explicit refresh', {
          reason,
          expiresAt: session.expires_at,
        });
        return true;
      }

      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        this.logDebug('Session refresh failed', {
          reason,
          error,
        });
        logSyncIncident('warn', 'session_refresh_failed', 'Session refresh failed during connectivity recovery', {
          reason,
          error,
        });
        return false;
      }

      this.logDebug('Session refresh succeeded', {
        reason,
        newExpiresAt: data.session.expires_at,
      });
      return true;
    } catch (error) {
      this.logDebug('Session refresh threw', {
        reason,
        error,
      });
      return false;
    }
  }

  private async checkSupabaseConnection() {
    if (!supabase || !this.currentStatus.isOnline) {
      this.logDebug('Connectivity check skipped', {
        hasSupabase: !!supabase,
        isOnline: this.currentStatus.isOnline,
      });
      this.updateStatus({ isSupabaseConnected: false });
      return;
    }

    const client = supabase;
    const startedAt = Date.now();
    this.logDebug('Supabase connectivity check started');

    const runProbe = async () => {
      // AbortController prevents health check from hanging forever
      // if the Supabase client is in a stuck state (zombie connections)
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.CONNECTIVITY_TIMEOUT_MS
      );
      try {
        const { error } = await client
          .from('products')
          .select('id')
          .limit(1)
          .abortSignal(controller.signal);
        return { error };
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      let { error } = await runProbe();

      if (error && this.isLikelyAuthError(error)) {
        this.logDebug('Connectivity probe returned auth-like error, attempting session recovery', {
          error,
        });
        const refreshed = await this.tryRefreshSession('connectivity_probe');
        if (refreshed) {
          const retry = await runProbe();
          error = retry.error;
        }
      }

      this.logDebug('Supabase connectivity check completed', {
        elapsedMs: Date.now() - startedAt,
        hasError: !!error,
        error,
      });
      this.updateStatus({
        isSupabaseConnected: !error,
        lastChecked: new Date(),
      });
    } catch (error) {
      this.logDebug('Supabase connectivity check failed', {
        elapsedMs: Date.now() - startedAt,
        error,
      });
      this.updateStatus({
        isSupabaseConnected: false,
        lastChecked: new Date(),
      });
    }
  }

  private updateStatus(partial: Partial<ConnectionStatus>) {
    const previous = this.currentStatus;
    this.currentStatus = { ...this.currentStatus, ...partial };
    if (
      previous.isOnline !== this.currentStatus.isOnline ||
      previous.isSupabaseConnected !== this.currentStatus.isSupabaseConnected
    ) {
      this.logDebug('Connection status changed', {
        previous,
        next: this.currentStatus,
      });
      if (
        previous.isOnline &&
        previous.isSupabaseConnected &&
        (!this.currentStatus.isOnline || !this.currentStatus.isSupabaseConnected)
      ) {
        logSyncIncident('warn', 'connection_degraded', 'Connection changed from healthy to degraded', {
          previous,
          next: this.currentStatus,
        });
      } else if (
        (!previous.isOnline || !previous.isSupabaseConnected) &&
        this.currentStatus.isOnline &&
        this.currentStatus.isSupabaseConnected
      ) {
        logSyncIncident('info', 'connection_recovered', 'Connection recovered and Supabase is reachable', {
          previous,
          next: this.currentStatus,
        });
      }
    }
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.currentStatus));
  }

  public subscribe(listener: (status: ConnectionStatus) => void) {
    this.listeners.add(listener);
    listener(this.currentStatus); // Immediate update
    return () => this.listeners.delete(listener);
  }

  public getStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  public async forceCheck() {
    this.logDebug('forceCheck requested');
    await this.checkSupabaseConnection();
  }
}

export interface ConnectionStatus {
  isOnline: boolean;
  isSupabaseConnected: boolean;
  lastChecked: Date;
}

export const connectionStatus = new ConnectionStatusManager();
