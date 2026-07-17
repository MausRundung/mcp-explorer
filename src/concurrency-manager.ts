export interface QueuedTask {
  id: string;
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

class ConcurrencyManager {
  private queue: QueuedTask[] = [];
  private active: number = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  async execute<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, fn, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift()!;
    this.active++;

    task.fn()
      .then((result) => {
        task.resolve(result);
      })
      .catch((error) => {
        task.reject(error);
      })
      .finally(() => {
        this.active--;
        this.processQueue();
      });
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.active;
  }
}

export const concurrencyManager = new ConcurrencyManager(5);
