// Simple in-memory TTL cache shared across services.
// Not distributed/persistent - fine for a single-process app like this one.
const store = new Map();

const getCache = (key) => {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
};

const setCache = (key, value, ttlMs) => {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

// Wrap an async fetcher with caching: returns the cached value if fresh,
// otherwise calls fn(), caches the result, and returns it.
const cached = async (key, ttlMs, fn) => {
  const existing = getCache(key);
  if (existing !== undefined) return existing;

  const value = await fn();
  setCache(key, value, ttlMs);
  return value;
};

// Periodic sweep so the map doesn't grow unbounded with expired entries.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 10 * 60 * 1000).unref();

module.exports = { getCache, setCache, cached };
