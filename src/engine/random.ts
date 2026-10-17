// ============================================================================
// RANDOMNESS
// Every shuffle and sample in the game draws from the platform's
// cryptographically strong generator (Web Crypto's getRandomValues), not
// Math.random. Functions that take an `rng` still accept a seeded one for tests.
// ============================================================================

/** A float in [0, 1) built from 53 random bits, the full precision of a double. */
export function cryptoRandom(): number {
  const words = new Uint32Array(2);
  globalThis.crypto.getRandomValues(words);
  // 27 high bits from one word and 26 from the other: 53 bits in all.
  return ((words[0] >>> 5) * 67108864 + (words[1] >>> 6)) / 9007199254740992;
}

/**
 * Picks `k` items from `items` uniformly at random, without replacement,
 * in random order (a partial Fisher–Yates). Returns them all, shuffled, when
 * `k` is at least the length.
 */
export function sample<T>(items: readonly T[], k: number, rng: () => number = cryptoRandom): T[] {
  const out = items.slice();
  const n = Math.min(Math.max(0, k), out.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}
