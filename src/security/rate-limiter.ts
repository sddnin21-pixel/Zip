/**
 * Lightweight in-memory rate limiter (brief section 36: "rate limiting").
 * This protects against Qusin AI itself hammering a provider (e.g. a
 * runaway agent loop retrying fast) — it is a client-side courtesy limit,
 * not a substitute for the provider's own server-side limits, which the
 * key-manager's cooldown logic already respects via RATE_LIMITED errors.
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
  }

  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  msUntilNextToken(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.refillPerSecond) * 1000);
  }
}

class RateLimiterRegistry {
  private buckets = new Map<string, TokenBucket>();

  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      // Default: 5 requests/sec sustained, burst of 10 — generous enough
      // not to interfere with normal chat use, tight enough to stop a
      // runaway loop from firing hundreds of requests per second.
      bucket = new TokenBucket(10, 5);
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  async acquire(key: string): Promise<void> {
    const bucket = this.getBucket(key);
    while (!bucket.tryConsume()) {
      await new Promise((resolve) => setTimeout(resolve, bucket.msUntilNextToken()));
    }
  }

  tryAcquire(key: string): boolean {
    return this.getBucket(key).tryConsume();
  }
}

export const rateLimiter = new RateLimiterRegistry();
