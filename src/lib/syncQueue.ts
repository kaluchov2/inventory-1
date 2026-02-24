/**
 * Sync Queue
 * Queues operations performed while offline for later sync
 */

export type SyncAction =
  | 'create' | 'update' | 'delete'
  | 'batch_create' | 'batch_update' | 'batch_delete';

export type SyncOperation = {
  id: string;
  type: 'products' | 'customers' | 'transactions' | 'drops' | 'staff';
  action: SyncAction;
  data: any;
  timestamp: string;
  retryCount: number;
};

class SyncQueue {
  private queue: SyncOperation[] = [];
  private readonly STORAGE_KEY = 'inventory_sync_queue';
  private readonly DEAD_LETTER_KEY = 'inventory_sync_dead_letter';
  private readonly MAX_RETRIES = 3;
  private deadLetter: SyncOperation[] = [];

  constructor() {
    this.loadQueue();
    this.loadDeadLetter();
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
      this.queue = [];
    }
  }

  private loadDeadLetter() {
    try {
      const stored = localStorage.getItem(this.DEAD_LETTER_KEY);
      if (stored) {
        this.deadLetter = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load dead letter queue:', error);
      this.deadLetter = [];
    }
  }

  public moveToDeadLetter(operation: SyncOperation) {
    operation.retryCount = 0; // Reset retries for future retry attempts
    this.deadLetter.push(operation);
    try {
      localStorage.setItem(this.DEAD_LETTER_KEY, JSON.stringify(this.deadLetter));
    } catch (error) {
      console.error('[SyncQueue] Failed to persist dead-letter queue to localStorage — operation may be lost on next reload:', error);
    }
  }

  public getDeadLetter(): SyncOperation[] {
    return [...this.deadLetter];
  }

  public getDeadLetterCount(): number {
    return this.deadLetter.length;
  }

  public retryDeadLetter() {
    const ops = [...this.deadLetter];
    this.deadLetter = [];
    try {
      localStorage.removeItem(this.DEAD_LETTER_KEY);
    } catch (error) {
      console.error('[SyncQueue] Failed to clear dead-letter queue from localStorage during retry:', error);
    }
    // Re-enqueue all dead letter operations
    for (const op of ops) {
      this.enqueue({ type: op.type, action: op.action, data: op.data });
    }
  }

  public clearDeadLetter() {
    this.deadLetter = [];
    try {
      localStorage.removeItem(this.DEAD_LETTER_KEY);
    } catch (error) {
      console.error('[SyncQueue] Failed to clear dead-letter queue from localStorage:', error);
    }
  }

  private saveQueue() {
    try {
      const queueString = JSON.stringify(this.queue);

      // Check size before saving (rough estimate: 1 char ≈ 2 bytes in UTF-16)
      const estimatedSize = queueString.length * 2;
      const maxSize = 5 * 1024 * 1024; // 5MB threshold

      if (estimatedSize > maxSize) {
        console.error(
          `[SyncQueue] Queue too large (${(estimatedSize / 1024 / 1024).toFixed(2)}MB), cannot save to localStorage`
        );
        // Throw error instead of silently failing
        throw new Error('Sync queue exceeded localStorage quota');
      }

      localStorage.setItem(this.STORAGE_KEY, queueString);
    } catch (error) {
      console.error('[SyncQueue] CRITICAL: Failed to save sync queue:', error);

      // If quota exceeded, try to clear and save again
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.error('[SyncQueue] LocalStorage quota exceeded! Queue size:', this.queue.length);
      }

      // Re-throw the error so caller knows save failed
      throw error;
    }
  }

  public enqueue(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>) {
    const syncOp: SyncOperation = {
      ...operation,
      id: `${operation.type}_${operation.action}_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    this.queue.push(syncOp);
    try {
      this.saveQueue();
    } catch (error) {
      // If save fails, remove the operation from queue to maintain consistency
      this.queue.pop();
      throw error;
    }
    return syncOp.id;
  }

  public dequeue(): SyncOperation | null {
    if (this.queue.length === 0) return null;
    const op = this.queue.shift()!;
    try {
      this.saveQueue();
    } catch (error) {
      // If save fails, put the operation back
      this.queue.unshift(op);
      throw error;
    }
    return op;
  }

  public peek(): SyncOperation | null {
    return this.queue[0] || null;
  }

  public getAll(): SyncOperation[] {
    return [...this.queue];
  }

  public remove(id: string) {
    const originalQueue = [...this.queue];
    this.queue = this.queue.filter((op) => op.id !== id);
    try {
      this.saveQueue();
    } catch (error) {
      // If save fails, restore original queue
      this.queue = originalQueue;
      throw error;
    }
  }

  public incrementRetry(id: string): boolean {
    const op = this.queue.find((o) => o.id === id);
    if (!op) return false;

    const originalRetryCount = op.retryCount;
    op.retryCount += 1;

    try {
      this.saveQueue();
    } catch (error) {
      // If save fails, restore retry count
      op.retryCount = originalRetryCount;
      throw error;
    }

    if (op.retryCount >= this.MAX_RETRIES) {
      console.error(`Operation ${id} exceeded max retries, removing from queue`);
      this.remove(id);
      return false;
    }

    return true;
  }

  public clear() {
    const originalQueue = [...this.queue];
    this.queue = [];
    try {
      this.saveQueue();
    } catch (error) {
      // If save fails, restore original queue
      this.queue = originalQueue;
      throw error;
    }
  }

  public size(): number {
    return this.queue.length;
  }

  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  public clearQueue() {
    this.queue = [];
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('[SyncQueue] Queue cleared successfully');
    } catch (error) {
      console.error('[SyncQueue] Failed to clear queue:', error);
    }
  }

  public getQueueInfo() {
    const queueString = JSON.stringify(this.queue);
    const size = queueString.length * 2; // Rough size in bytes

    return {
      count: this.queue.length,
      sizeKB: (size / 1024).toFixed(2),
      oldestOperation: this.queue[0]?.timestamp,
    };
  }
}

export const syncQueue = new SyncQueue();
