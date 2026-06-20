/**
 * Seeded Random Number Generator (MT19937, Python-compatible).
 * Vendored from hyperscape/packages/procgen/src/math/Random.ts (core subset).
 */

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

function mul32(a: number, b: number): number {
  const aLo = a & 0xffff;
  const aHi = a >>> 16;
  const bLo = b & 0xffff;
  const bHi = b >>> 16;
  const lo = aLo * bLo;
  const mid = aLo * bHi + aHi * bLo;
  return (lo + ((mid << 16) >>> 0)) >>> 0;
}

export class SeededRandom {
  private mt: Uint32Array;
  private mti: number;
  private currentSeed: number;

  constructor(seed?: number) {
    this.mt = new Uint32Array(N);
    this.mti = N + 1;
    this.currentSeed = seed ?? Date.now();
    this.seed(this.currentSeed);
  }

  private initGenrand(seed: number): void {
    this.mt[0] = seed >>> 0;
    for (let i = 1; i < N; i++) {
      const s = this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30);
      this.mt[i] = (mul32(s, 1812433253) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(initKey: number[]): void {
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    let k = N > initKey.length ? N : initKey.length;

    for (; k > 0; k--) {
      const s = this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30);
      this.mt[i] = ((this.mt[i]! ^ mul32(s, 1664525)) + initKey[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]!;
        i = 1;
      }
      if (j >= initKey.length) {
        j = 0;
      }
    }

    for (k = N - 1; k > 0; k--) {
      const s = this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30);
      this.mt[i] = ((this.mt[i]! ^ mul32(s, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]!;
        i = 1;
      }
    }

    this.mt[0] = 0x80000000;
  }

  seed(seed: number): void {
    this.currentSeed = seed >>> 0;
    this.initByArray([this.currentSeed]);
  }

  private genrandInt32(): number {
    let y: number;
    const mag01 = new Uint32Array([0, MATRIX_A]);

    if (this.mti >= N) {
      let kk: number;
      for (kk = 0; kk < N - M; kk++) {
        y = (this.mt[kk]! & UPPER_MASK) | (this.mt[kk + 1]! & LOWER_MASK);
        this.mt[kk] = this.mt[kk + M]! ^ (y >>> 1) ^ mag01[y & 1]!;
      }
      for (; kk < N - 1; kk++) {
        y = (this.mt[kk]! & UPPER_MASK) | (this.mt[kk + 1]! & LOWER_MASK);
        this.mt[kk] = this.mt[kk + (M - N)]! ^ (y >>> 1) ^ mag01[y & 1]!;
      }
      y = (this.mt[N - 1]! & UPPER_MASK) | (this.mt[0]! & LOWER_MASK);
      this.mt[N - 1] = this.mt[M - 1]! ^ (y >>> 1) ^ mag01[y & 1]!;
      this.mti = 0;
    }

    y = this.mt[this.mti++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random(): number {
    const a = this.genrandInt32() >>> 5;
    const b = this.genrandInt32() >>> 6;
    return (a * 67108864.0 + b) / 9007199254740992.0;
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }

  getState(): { mt: Uint32Array; mti: number } {
    return { mt: new Uint32Array(this.mt), mti: this.mti };
  }

  setState(state: { mt: Uint32Array; mti: number }): void {
    this.mt = new Uint32Array(state.mt);
    this.mti = state.mti;
  }
}

export function randInRange(
  rng: SeededRandom,
  lower: number,
  upper: number,
): number {
  return rng.random() * (upper - lower) + lower;
}
