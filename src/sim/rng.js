// Seeded PRNG (mulberry32). Every random simulation outcome must come from an instance of this.
export function createRng(seed) {
  let state = seed >>> 0;
  const rng = {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) {
      return Math.floor(rng.next() * n);
    },
    get state() {
      return state;
    },
  };
  return rng;
}
