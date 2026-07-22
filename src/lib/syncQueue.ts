/**
 * Sync Queue
 * Queues operations performed while offline for later sync
 */

export type SyncAction =
  | 'create' | 'update' | 'delete'
  | 'batch_create' | 'batch_update' | 'batch_delete'
  | 'sale_update' | 'record_sale';

export type SyncOperation = {
  id: string;
  type: 'products' | 'customers' | 'transactions' | 'drops' | 'staff' | 'sat_keys';
  action: SyncAction;
  data: any;
  timestamp: string;
  retryCount: number;
  failureReason?: 'sat_key_foreign_key';
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
      this.saveDeadLetter();
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
    let requeued = 0;

    try {
      for (const op of ops) {
        this.enqueue({ type: op.type, action: op.action, data: op.data });
        requeued++;
      }
    } catch (error) {
      // Keep only entries that never reached the main queue. Previously queued
      // operations are already persisted there, so this avoids both loss and
      // duplicate retries after a localStorage quota failure.
      this.deadLetter = ops.slice(requeued);
      try {
        this.saveDeadLetter();
      } catch (persistError) {
        console.error('[SyncQueue] Failed to preserve remaining dead-letter operations after retry failure:', persistError);
      }
      throw error;
    }

    this.deadLetter = [];
    try {
      localStorage.removeItem(this.DEAD_LETTER_KEY);
    } catch (error) {
      // Every operation was already persisted in the main queue. Do not restore
      // them here: that would leave a stale second copy in dead-letter storage
      // and could apply a later retry twice.
      console.error('[SyncQueue] Failed to clear dead-letter queue from localStorage during retry:', error);
      try {
        this.saveDeadLetter();
      } catch (persistError) {
        console.error('[SyncQueue] Failed to persist the cleared dead-letter queue after retry:', persistError);
      }
    }
  }

  public discardDeadLetter(
    shouldDiscard: (operation: SyncOperation) => boolean,
  ): number {
    const remaining = this.deadLetter.filter((operation) => !shouldDiscard(operation));
    const discarded = this.deadLetter.length - remaining.length;
    if (discarded === 0) return 0;

    const original = this.deadLetter;
    this.deadLetter = remaining;
    try {
      if (remaining.length === 0) localStorage.removeItem(this.DEAD_LETTER_KEY);
      else this.saveDeadLetter();
      return discarded;
    } catch (error) {
      this.deadLetter = original;
      throw error;
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

  private saveDeadLetter() {
    localStorage.setItem(this.DEAD_LETTER_KEY, JSON.stringify(this.deadLetter));
  }

  /**
   * Move an existing operation to the back of the queue.
   * Useful to avoid head-of-line blocking when one operation is flaky.
   */
  public moveToBack(id: string): boolean {
    const index = this.queue.findIndex((op) => op.id === id);
    if (index === -1 || index === this.queue.length - 1) return false;

    const originalQueue = [...this.queue];
    const [op] = this.queue.splice(index, 1);
    this.queue.push(op);

    try {
      this.saveQueue();
      return true;
    } catch (error) {
      this.queue = originalQueue;
      throw error;
    }
  }

  /**
   * Replaces a locally generated SAT key id with the canonical server id in
   * pending snapshots. This is needed when two devices created the same SAT
   * code while offline and the server already owns that code under another id.
   */
  public remapSatKeyId(localId: string, canonicalId: string) {
    if (!localId || localId === canonicalId) return;

    const remapData = (data: any): any => {
      if (Array.isArray(data)) {
        const remapped = data.map(remapData);
        return remapped.some((item, index) => item !== data[index])
          ? remapped
          : data;
      }
      if (!data || typeof data !== 'object') return data;

      let next = data.satKeyId === localId
        ? { ...data, satKeyId: canonicalId }
        : data;

      for (const key of ['items', 'transaction', 'snapshot']) {
        if (!(key in data)) continue;
        const remappedChild = remapData(data[key]);
        if (remappedChild !== data[key]) {
          next = { ...next, [key]: remappedChild };
        }
      }
      return next;
    };

    const remapOperations = (operations: SyncOperation[]) =>
      operations.map((operation) => {
        const data = remapData(operation.data);
        return data === operation.data ? operation : { ...operation, data };
      });
    const remappedQueue = remapOperations(this.queue);
    const remappedDeadLetter = remapOperations(this.deadLetter);
    const queueChanged = remappedQueue.some((operation, index) => operation !== this.queue[index]);
    const deadLetterChanged = remappedDeadLetter.some((operation, index) => operation !== this.deadLetter[index]);

    if (!queueChanged && !deadLetterChanged) return;

    const originalQueue = this.queue;
    const originalDeadLetter = this.deadLetter;
    const storedQueue = localStorage.getItem(this.STORAGE_KEY);
    const storedDeadLetter = localStorage.getItem(this.DEAD_LETTER_KEY);
    this.queue = remappedQueue;
    this.deadLetter = remappedDeadLetter;
    try {
      this.saveQueue();
      this.saveDeadLetter();
    } catch (error) {
      this.queue = originalQueue;
      this.deadLetter = originalDeadLetter;
      try {
        if (storedQueue === null) localStorage.removeItem(this.STORAGE_KEY);
        else localStorage.setItem(this.STORAGE_KEY, storedQueue);
        if (storedDeadLetter === null) localStorage.removeItem(this.DEAD_LETTER_KEY);
        else localStorage.setItem(this.DEAD_LETTER_KEY, storedDeadLetter);
      } catch {
        // Preserve the original write error for the caller.
      }
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
