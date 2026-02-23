import { supabase } from './supabase';

/**
 * Connection status manager
 * Tracks Supabase connection state and network availability
 */
class ConnectionStatusManager {
  private listeners: Set<(status: ConnectionStatus) => void> = new Set();
  private currentStatus: ConnectionStatus = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSupabaseConnected: false,
    lastChecked: new Date(),
  };

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => this.updateStatus({ isOnline: true }));
    window.addEventListener('offline', () => this.updateStatus({ isOnline: false }));

    // When PWA returns from background, immediately re-check connection
    // This triggers syncManager's subscription → flushes pending queue
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkSupabaseConnection();
      }
    });

    this.checkSupabaseConnection();
    setInterval(() => this.checkSupabaseConnection(), 30000); // Check every 30s
  }

  private async checkSupabaseConnection() {
    if (!supabase || !this.currentStatus.isOnline) {
      this.updateStatus({ isSupabaseConnected: false });
      return;
    }

    try {
      const { error } = await supabase.from('products').select('id').limit(1);
      this.updateStatus({
        isSupabaseConnected: !error,
        lastChecked: new Date(),
      });
    } catch {
      this.updateStatus({ isSupabaseConnected: false, lastChecked: new Date() });
    }
  }

  private updateStatus(partial: Partial<ConnectionStatus>) {
    this.currentStatus = { ...this.currentStatus, ...partial };
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
    await this.checkSupabaseConnection();
  }
}

export interface ConnectionStatus {
  isOnline: boolean;
  isSupabaseConnected: boolean;
  lastChecked: Date;
}

export const connectionStatus = new ConnectionStatusManager();
