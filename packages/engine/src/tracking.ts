/**
 * Daily tracking helpers: the water goal and the weight trend.
 * Plain rules with a reason, like the rest of the engine, so the app can explain every number.
 */

/** One glass is 250 ml. */
export const GLASS_ML = 250;
/** About 35 ml of water a day per kg of body weight (food provides some of the rest). */
export const WATER_ML_PER_KG = 35;
export const MIN_GLASSES = 6;
export const MAX_GLASSES = 12;
/** Pregnancy and breastfeeding need more fluid: two extra glasses. */
export const PREGNANCY_EXTRA_GLASSES = 2;

export type WaterTarget = { glasses: number; ml: number; reason: string };

export function waterTarget(weightKg: number, { pregnantOrBreastfeeding = false } = {}): WaterTarget {
  const base = Math.min(MAX_GLASSES, Math.max(MIN_GLASSES, Math.round((weightKg * WATER_ML_PER_KG) / GLASS_ML)));
  const glasses = base + (pregnantOrBreastfeeding ? PREGNANCY_EXTRA_GLASSES : 0);
  const reason = pregnantOrBreastfeeding
    ? `About ${WATER_ML_PER_KG} ml per kg of body weight, plus ${PREGNANCY_EXTRA_GLASSES} glasses for pregnancy or breastfeeding.`
    : `About ${WATER_ML_PER_KG} ml per kg of body weight, in ${GLASS_ML} ml glasses. Drink more in hot weather or after exercise.`;
  return { glasses, ml: glasses * GLASS_ML, reason };
}

/** Days in the moving average used to smooth day-to-day weight changes (water, salt, digestion). */
export const TREND_DAYS = 7;

/**
 * A smoothed weight line: for each weigh-in, the average of all weigh-ins in the TREND_DAYS days up to it.
 * Input must be sorted by date (YYYY-MM-DD).
 */
export function weightTrend(points: readonly { date: string; weightKg: number }[]): { date: string; trendKg: number }[] {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  return points.map((p) => {
    const window = points.filter((q) => day(q.date) <= day(p.date) && day(p.date) - day(q.date) < TREND_DAYS);
    const avg = window.reduce((t, q) => t + q.weightKg, 0) / window.length;
    return { date: p.date, trendKg: Math.round(avg * 10) / 10 };
  });
}
