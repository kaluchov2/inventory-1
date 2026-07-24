import { supabase } from './supabase';
import { logSyncIncident } from './syncIncidentLogger';

class ConnectivityCheckTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Supabase connectivity check timed out after ${timeoutMs}ms`);
    this.name = 'ConnectivityCheckTimeoutError';
  }
}

/**
 * Connection status manager
 * Tracks Supabase connection state and network availability
 */
export class ConnectionStatusManager {
  private readonly DEBUG_LOGS_ENABLED = true;
  private readonly CONNECTIVITY_TIMEOUT_MS = 10_000;
  private readonly SESSION_REFRESH_RETRY_WINDOW_MS = 120_000;
  private activeCheckPromise: Promise<ConnectionStatus> | null = null;
  private checkSequence = 0;
  private listeners: Set<(status: ConnectionStatus) => void> = new Set();
  private currentStatus: ConnectionStatus = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSupabaseConnected: false,
    lastChecked: new Date(),
  };

  constructor(options: { initialize?: boolean } = {}) {
    if (options.initialize !== false) {
      this.initialize();
    }
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
      void this.checkSupabaseConnection();
    });
    window.addEventListener('offline', () => {
      this.logDebug('Browser offline event');
      logSyncIncident('warn', 'browser_offline', 'Browser reported offline state');
      this.updateStatus({ isOnline: false });
    });

    const runForegroundCheck = (source: string) => {
      this.logDebug(`${source}: checking Supabase connectivity`);
      void this.checkSupabaseConnection();
    };

    // Re-check aggressively when users return to the app after idle/sleep.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        runForegroundCheck('Visibility change');
      }
    });
    window.addEventListener('focus', () => runForegroundCheck('Window focus'));
    window.addEventListener('pageshow', () => runForegroundCheck('Page show'));

    void this.checkSupabaseConnection();
    setInterval(() => void this.checkSupabaseConnection(), 30_000); // Check every 30s
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

  private checkSupabaseConnection(): Promise<ConnectionStatus> {
    if (this.activeCheckPromise) {
      this.logDebug('Joining active Supabase connectivity check');
      return this.activeCheckPromise;
    }

    const checkId = ++this.checkSequence;
    const run = this.runSupabaseConnectionCheck(checkId);
    this.activeCheckPromise = run;
    void run.then(
      () => {
        if (this.activeCheckPromise === run) this.activeCheckPromise = null;
      },
      () => {
        if (this.activeCheckPromise === run) this.activeCheckPromise = null;
      },
    );
    return run;
  }

  private async runSupabaseConnectionCheck(checkId: number): Promise<ConnectionStatus> {
    if (!supabase || !this.currentStatus.isOnline) {
      this.logDebug('Connectivity check skipped', {
        checkId,
        hasSupabase: !!supabase,
        isOnline: this.currentStatus.isOnline,
      });
      this.updateStatus({
        isSupabaseConnected: false,
        lastChecked: new Date(),
      });
      return this.currentStatus;
    }

    const client = supabase;
    const startedAt = Date.now();
    const controller = new AbortController();
    this.logDebug('Supabase connectivity check started', { checkId });

    const pipeline = async () => {
      const runProbe = async () => {
        const { error } = await client
          .from('products')
          .select('id')
          .limit(1)
          .abortSignal(controller.signal);
        return { error };
      };

      let { error } = await runProbe();
      if (error && this.isLikelyAuthError(error)) {
        this.logDebug('Connectivity probe returned auth-like error, attempting session recovery', {
          checkId,
          error,
        });
        const refreshed = await this.tryRefreshSession('connectivity_probe');
        if (refreshed) {
          const retry = await runProbe();
          error = retry.error;
        }
      }
      return { error };
    };

    try {
      const { error } = await this.withTimeout(
        pipeline(),
        this.CONNECTIVITY_TIMEOUT_MS,
        () => controller.abort(),
      );
      const isConnected = !error && this.currentStatus.isOnline;

      this.logDebug('Supabase connectivity check completed', {
        checkId,
        elapsedMs: Date.now() - startedAt,
        hasError: !!error,
        error,
      });
      this.updateStatus({
        isSupabaseConnected: isConnected,
        lastChecked: new Date(),
      });
    } catch (error) {
      this.logDebug('Supabase connectivity check failed', {
        checkId,
        elapsedMs: Date.now() - startedAt,
        timedOut: error instanceof ConnectivityCheckTimeoutError,
        error,
      });
      this.updateStatus({
        isSupabaseConnected: false,
        lastChecked: new Date(),
      });
    }

    return this.currentStatus;
  }

  private withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    onTimeout: () => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        onTimeout();
        reject(new ConnectivityCheckTimeoutError(timeoutMs));
      }, timeoutMs);

      operation.then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
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

  public forceCheck(): Promise<ConnectionStatus> {
    this.logDebug('forceCheck requested');
    return this.checkSupabaseConnection();
  }
}

export interface ConnectionStatus {
  isOnline: boolean;
  isSupabaseConnected: boolean;
  lastChecked: Date;
}

export const connectionStatus = new ConnectionStatusManager();
