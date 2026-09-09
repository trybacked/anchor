export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
}

export class RateLimiter {
    private readonly hits = new Map<string, number[]>();

    constructor(private readonly config: RateLimitConfig) {}

    allow(key: string, now: number = Date.now()): boolean {
        const windowStart = now - this.config.windowMs;
        const timestamps = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
        if (timestamps.length >= this.config.maxRequests) {
            this.hits.set(key, timestamps);
            return false;
        }
        timestamps.push(now);
        this.hits.set(key, timestamps);
        return true;
    }
}
