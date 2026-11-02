export class HeatTileCache {
  private entries = new Map<string, { bytes: Uint8Array; expires: number }>()
  private size = 0

  constructor(
    private maxBytes = 16 * 1024 * 1024,
    private maxEntries = 256,
    private ttlMs = 60_000,
  ) {}

  get(key: string): Uint8Array | undefined {
    const entry = this.entries.get(key)
    if (!entry) return
    if (entry.expires <= Date.now()) {
      this.remove(key)
      return
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.bytes
  }

  set(key: string, bytes: Uint8Array): void {
    this.remove(key)
    if (bytes.byteLength > this.maxBytes) return
    for (const [id, entry] of this.entries) if (entry.expires <= Date.now()) this.remove(id)
    while (
      this.entries.size &&
      (this.size + bytes.byteLength > this.maxBytes || this.entries.size >= this.maxEntries)
    ) {
      this.remove(this.entries.keys().next().value!)
    }
    this.entries.set(key, { bytes, expires: Date.now() + this.ttlMs })
    this.size += bytes.byteLength
  }

  private remove(key: string): void {
    const entry = this.entries.get(key)
    if (entry) this.size -= entry.bytes.byteLength
    this.entries.delete(key)
  }
}
