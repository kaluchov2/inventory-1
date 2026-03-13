import { supabase } from './supabase';

/**
 * Connection status manager
 * Tracks Supabase connection state and network availability
 */
class ConnectionStatusManager {
  private readonly DEBUG_LOGS_ENABLED = true;
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
      this.updateStatus({ isOnline: true });
    });
    window.addEventListener('offline', () => {
      this.logDebug('Browser offline event');
      this.updateStatus({ isOnline: false });
    });

    // When PWA returns from background, immediately re-check connection
    // This triggers syncManager's subscription → flushes pending queue
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.logDebug('Visibility change: app is foreground, checking Supabase connectivity');
        this.checkSupabaseConnection();
      }
    });

    this.checkSupabaseConnection();
    setInterval(() => this.checkSupabaseConnection(), 30000); // Check every 30s
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

    // AbortController prevents health check from hanging forever
    // if the Supabase client is in a stuck state (zombie connections)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const startedAt = Date.now();
    this.logDebug('Supabase connectivity check started');

    try {
      const { error } = await supabase
        .from('products')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal);
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
      this.updateStatus({ isSupabaseConnected: false, lastChecked: new Date() });
    } finally {
      clearTimeout(timer);
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
