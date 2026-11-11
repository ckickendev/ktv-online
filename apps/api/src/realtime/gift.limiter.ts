interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class GiftLimiter {
  private buckets = new Map<string, TokenBucket>();
  private idempotencyCache = new Map<string, number>(); // clientGiftId -> timestamp
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private gcTimer: NodeJS.Timeout | null = null;

  /**
   * @param maxTokens Maximum burst gifts allowed (default: 3)
   * @param windowMs Time window for full replenishment (default: 4500ms => 1 token per 1500ms)
   */
  constructor(maxTokens = 3, windowMs = 4500) {
    this.maxTokens = maxTokens;
    this.refillIntervalMs = windowMs / maxTokens;

    // Prune stale entries every 60 seconds
    this.gcTimer = setInterval(() => this.cleanup(), 60000);
    if (this.gcTimer.unref) {
      this.gcTimer.unref();
    }
  }

  /**
   * Checks whether this clientGiftId was already processed within the idempotency window (30s).
   * If not duplicate, marks it as processed.
   */
  checkAndMarkIdempotent(clientGiftId: string): boolean {
    const now = Date.now();
    const existingTime = this.idempotencyCache.get(clientGiftId);
    if (existingTime && now - existingTime < 30000) {
      return false; // Is duplicate
    }
    this.idempotencyCache.set(clientGiftId, now);
    return true; // Not duplicate, successfully marked
  }

  /**
   * Consumes 1 gift token for the user.
   * Returns true if allowed, false if rate limited.
   */
  tryConsume(userId: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(userId);

    if (!bucket) {
      bucket = { tokens: this.maxTokens - 1, lastRefill: now };
      this.buckets.set(userId, bucket);
      return true;
    }

    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed / this.refillIntervalMs;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  private cleanup(): void {
    const now = Date.now();
    // Clean inactive rate limit buckets (> 60s)
    for (const [userId, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > 60000) {
        this.buckets.delete(userId);
      }
    }
    // Clean stale idempotency keys (> 30s)
    for (const [key, timestamp] of this.idempotencyCache.entries()) {
      if (now - timestamp > 30000) {
        this.idempotencyCache.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.buckets.clear();
    this.idempotencyCache.clear();
  }
}

export const giftLimiter = new GiftLimiter();
