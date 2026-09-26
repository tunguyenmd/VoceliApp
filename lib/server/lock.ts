// Per-key async mutex so concurrent requests for the same plan (an answer save racing a clip upload)
// never interleave their read-modify-write of the encrypted plan file. Kept on globalThis because Next.js
// can instantiate a module more than once across route bundles in development.

const g = globalThis as unknown as { __heardLocks?: Map<string, Promise<void>> };
const locks: Map<string, Promise<void>> = (g.__heardLocks ??= new Map());

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => current);
  locks.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}
