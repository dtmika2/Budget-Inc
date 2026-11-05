/** Seeded PRNG (sfc32) with independent named streams (spec §10.2). */

export const STREAM_NAMES = ['draft', 'effects', 'chaos', 'opportunities', 'budgetVote', 'election', 'filler', 'regions', 'demands', 'regionEvents', 'specials', 'prestige', 'coalition'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/** cyrb128 string hash -> four 32-bit seeds. */
export function hash128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Short stable hex hash, used for data-file hashes in the log. */
export function shortHash(str: string): string {
  return hash128(str)
    .slice(0, 2)
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    [this.a, this.b, this.c, this.d] = hash128(seed);
    for (let i = 0; i < 12; i++) this.nextUint();
  }

  private nextUint(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextUint() / 4294967296;
  }

  /** Uniform in the open interval (0, 1): never exactly 0. */
  nextOpen(): number {
    return (this.nextUint() + 0.5) / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min === max ? min : min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Index chosen with probability proportional to weights (all >= 0, sum > 0). */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
    return weights.length - 1;
  }

  /** Raw generator state, so a Simulation can be cloned (e.g. for previews or the greedy bot). */
  getState(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(s: [number, number, number, number]): void {
    [this.a, this.b, this.c, this.d] = s;
  }
}

export type RngStreams = Record<StreamName, Rng>;

/** Each stream is its own generator seeded from hash(seed + ':' + name). */
export function createStreams(seed: string): RngStreams {
  const out = {} as RngStreams;
  for (const name of STREAM_NAMES) out[name] = new Rng(`${seed}:${name}`);
  return out;
}
