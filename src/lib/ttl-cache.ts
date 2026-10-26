/** Bounded LRU cache. Reading refreshes recency, never the expiry. */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>()
  constructor(
    private readonly capacity: number,
    private readonly ttlMs: number,
  ) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    if (entry.expiresAt <= Date.now()) return
    this.entries.set(key, entry)
    return entry.value
  }
  set(key: string, value: T): void {
    this.entries.delete(key)
    while (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!)
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }
  delete(key: string): void {
    this.entries.delete(key)
  }
}
