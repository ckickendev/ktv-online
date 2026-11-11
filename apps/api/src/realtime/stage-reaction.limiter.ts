interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class StageReactionLimiter {
  private buckets = new Map<string, TokenBucket>();
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number; // ms to replenish 1 token
  private gcTimer: NodeJS.Timeout | null = null;

  /**
   * @param maxTokens Maximum burst tokens allowed (default: 5)
   * @param windowMs Time window for full replenishment (default: 3000ms => 1 token per 600ms)
   */
  constructor(maxTokens = 5, windowMs = 3000) {
    this.maxTokens = maxTokens;
    this.refillIntervalMs = windowMs / maxTokens;

    // Run garbage collection every 60 seconds to prune inactive users
    this.gcTimer = setInterval(() => this.cleanup(), 60000);
    if (this.gcTimer.unref) {
      this.gcTimer.unref();
    }
  }

  /**
   * Attempts to consume 1 reaction token for the specified user.
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

    // Refill tokens based on elapsed time
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

  /**
   * Cleanup buckets inactive for more than 60 seconds.
   */
  private cleanup(): void {
    const now = Date.now();
    const expiry = 60000;
    for (const [userId, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > expiry) {
        this.buckets.delete(userId);
      }
    }
  }

  destroy(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.buckets.clear();
  }
}

export const stageReactionLimiter = new StageReactionLimiter();
