interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Per-user token bucket limiter for `mic:request` spam protection.
 * Does NOT gate cancellations, releases, or host moderation actions.
 */
export class MicRequestLimiter {
  private buckets = new Map<string, TokenBucket>();
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private gcTimer: NodeJS.Timeout | null = null;

  /**
   * @param maxTokens Maximum burst `mic:request` commands allowed (default: 5)
   * @param windowMs Time window for full replenishment (default: 10000ms => 1 token per 2s)
   */
  constructor(maxTokens = 5, windowMs = 10000) {
    this.maxTokens = maxTokens;
    this.refillIntervalMs = windowMs / maxTokens;

    this.gcTimer = setInterval(() => this.cleanup(), 60000);
    if (this.gcTimer.unref) {
      this.gcTimer.unref();
    }
  }

  public tryConsume(userId: string): boolean {
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

  public clear(): void {
    this.buckets.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    const expiry = 60000;
    for (const [userId, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > expiry) {
        this.buckets.delete(userId);
      }
    }
  }

  public destroy(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.buckets.clear();
  }
}

export const micRequestLimiter = new MicRequestLimiter();
