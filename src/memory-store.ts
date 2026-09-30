type Entry<T> = { value: T; expiresAt: number };

export function createMemoryKeyedStore<T>(options: { maxEntries: number; defaultTtlMs: number }) {
  const entries = new Map<string, Entry<T>>();

  const lookup = (key: string): T | undefined => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }
    return entry?.value;
  };

  const hasCapacity = (): boolean => {
    for (const key of entries.keys()) {
      lookup(key);
    }
    return entries.size < options.maxEntries;
  };

  const expiresAt = (ttlMs?: number): number => Date.now() + (ttlMs ?? options.defaultTtlMs);

  return {
    async lookup(key: string): Promise<T | undefined> {
      return lookup(key);
    },
    async registerIfAbsent(key: string, value: T, opts?: { ttlMs?: number }): Promise<boolean> {
      if (lookup(key) !== undefined || !hasCapacity()) {
        return false;
      }
      entries.set(key, { value, expiresAt: expiresAt(opts?.ttlMs) });
      return true;
    },
    async update(
      key: string,
      updateValue: (current: T | undefined) => T | undefined,
      opts?: { ttlMs?: number },
    ): Promise<boolean> {
      const current = lookup(key);
      const next = updateValue(current);
      if (next === undefined) {
        entries.delete(key);
        return true;
      }
      if (current === undefined && !hasCapacity()) {
        return false;
      }
      entries.set(key, { value: next, expiresAt: expiresAt(opts?.ttlMs) });
      return true;
    },
  };
}
