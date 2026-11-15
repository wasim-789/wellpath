/** Stable "randomness" for the planners: same text in, same number out, on every machine. */

/** FNV-1a: a fast, stable string hash. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A stable number from 0 to 1 for this item on this day, used to break ties between good options. */
export const jitter = (seed: string, day: number, slug: string) => hash(`${seed}|${day}|${slug}`) / 0xffffffff;
