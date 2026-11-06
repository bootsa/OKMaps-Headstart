/**
 * Request limits the gateway applies before calling a provider.
 */

export type Clock = () => number;
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Spaces calls at least `intervalMs` apart, in arrival order. BASE asks
 * clients for at most one request per second, and all users of a gateway
 * share its IP address, so the spacing is per gateway, not per user.
 */
export class Spacer {
  private next = 0;
  private readonly intervalMs: number;
  private readonly maxWaitMs: number;
  private readonly now: Clock;
  private readonly sleep: Sleep;

  constructor(intervalMs: number, maxWaitMs: number, now: Clock = Date.now, sleep: Sleep = realSleep) {
    this.intervalMs = intervalMs;
    this.maxWaitMs = maxWaitMs;
    this.now = now;
    this.sleep = sleep;
  }

  /** Waits for this call's slot. Returns false, without taking a slot, if the wait would exceed maxWaitMs. */
  async take(): Promise<boolean> {
    const now = this.now();
    const slot = Math.max(now, this.next);
    if (slot - now > this.maxWaitMs) return false;
    this.next = slot + this.intervalMs;
    if (slot > now) await this.sleep(slot - now);
    return true;
  }

  /** Milliseconds until a new call would get its slot. */
  backlogMs(): number {
    return Math.max(0, this.next - this.now());
  }
}

/** Fixed-window request counter per client key. */
export class ClientLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  private readonly requests: number;
  private readonly windowMs: number;
  private readonly now: Clock;

  constructor(requests: number, windowMs: number, now: Clock = Date.now) {
    this.requests = requests;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Counts a request; returns the ms to wait if the client is over its limit, else 0. */
  hit(key: string): number {
    const now = this.now();
    if (this.windows.size > 10_000) this.prune(now);
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    if (w.count >= this.requests) return w.start + this.windowMs - now;
    w.count++;
    return 0;
  }

  private prune(now: number) {
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
  }
}
