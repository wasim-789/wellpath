import { describe, expect, it } from "vitest";
import { MAX_GLASSES, MIN_GLASSES, waterTarget, weightTrend } from "./tracking";

describe("waterTarget", () => {
  it("is about 35 ml per kg, in whole glasses", () => {
    expect(waterTarget(70)).toMatchObject({ glasses: 10, ml: 2500 }); // 70 × 35 = 2450 ml → 9.8 → 10 glasses
    expect(waterTarget(57).glasses).toBe(8);
  });

  it("stays between 6 and 12 glasses, and adds two for pregnancy or breastfeeding", () => {
    expect(waterTarget(30).glasses).toBe(MIN_GLASSES);
    expect(waterTarget(160).glasses).toBe(MAX_GLASSES);
    const pregnant = waterTarget(60, { pregnantOrBreastfeeding: true });
    expect(pregnant.glasses).toBe(waterTarget(60).glasses + 2);
    expect(pregnant.reason).toMatch(/pregnancy/);
  });
});

describe("weightTrend", () => {
  it("averages the weigh-ins of the last 7 days, so one heavy day barely moves the line", () => {
    const trend = weightTrend([
      { date: "2026-11-01", weightKg: 80 },
      { date: "2026-11-02", weightKg: 82 },
      { date: "2026-11-03", weightKg: 80 },
      { date: "2026-11-10", weightKg: 79 },
    ]);
    expect(trend.map((t) => t.trendKg)).toEqual([80, 81, 80.7, 79]); // the 10th is more than 7 days after the others
  });

  it("returns nothing for no weigh-ins", () => {
    expect(weightTrend([])).toEqual([]);
  });
});
