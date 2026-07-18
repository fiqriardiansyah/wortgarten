/** Quota day boundaries use a fixed UTC day, never the server's local timezone or the
 * requester's — this is deliberately NOT `localDateKey` (that's the user-facing streak
 * concept). Documented per spec: "UTC is fine for quota day boundaries." */
export interface Clock {
  todayUtcDateKey(): string; // "YYYY-MM-DD"
}

export class SystemClock implements Clock {
  todayUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
