import { describe, expect, it } from "vitest";
import { CONDITIONS, EXERCISE_LOADS } from "@wellpath/shared";
import { CONDITION_BLOCKS, blockedLoads, isExerciseSafe, nutrientsFor, nutrientsForPortion, sumNutrients, unsafeReason } from "./index";

const roti = {
  per100g: { kcal: 297, proteinG: 11, carbsG: 46, fatG: 7.5, fiberG: 4.9 },
  portions: [{ unit: "roti" as const, label: "1 medium roti", grams: 40 }],
};

describe("nutrition", () => {
  it("scales per-100 g values to the amount eaten", () => {
    expect(nutrientsFor(roti, 40)).toEqual({ kcal: 119, proteinG: 4.4, carbsG: 18.4, fatG: 3, fiberG: 2 });
  });

  it("works with portions and quantities, such as 2 roti", () => {
    expect(nutrientsForPortion(roti, 0, 2).kcal).toBe(238);
  });

  it("refuses a portion that does not exist or a quantity of zero", () => {
    expect(() => nutrientsForPortion(roti, 3)).toThrow(RangeError);
    expect(() => nutrientsForPortion(roti, 0, 0)).toThrow(RangeError);
  });

  it("adds up a meal", () => {
    const one = nutrientsForPortion(roti, 0);
    expect(sumNutrients([one, one, one]).kcal).toBe(357);
    expect(sumNutrients([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
  });
});

describe("safety rules", () => {
  const squat = { loads: ["deep_knee_bend"] as const };
  const bridge = { loads: [] as const };

  it("blocks deep knee bending for knee pain", () => {
    expect(isExerciseSafe(squat, ["knee_pain"])).toBe(false);
    expect(unsafeReason(squat, ["knee_pain"])).toBe("Left out because it involves deep knee bending.");
  });

  it("allows exercises with no blocked loads", () => {
    expect(isExerciseSafe(bridge, [...CONDITIONS])).toBe(true);
    expect(unsafeReason(bridge, ["knee_pain"])).toBeNull();
  });

  it("allows everything when there are no conditions", () => {
    for (const load of EXERCISE_LOADS) expect(isExerciseSafe({ loads: [load] }, [])).toBe(true);
  });

  it("combines the rules of several conditions", () => {
    const blocked = blockedLoads(["knee_pain", "shoulder_injury"]);
    expect(blocked.has("jumping")).toBe(true);
    expect(blocked.has("overhead")).toBe(true);
    expect(blocked.has("spine_bending")).toBe(false);
  });

  it("names every blocked load in the reason", () => {
    expect(unsafeReason({ loads: ["jumping", "high_intensity"] }, ["knee_pain", "high_blood_pressure"])).toBe(
      "Left out because it involves jumping and landing and very hard effort that raises blood pressure quickly.",
    );
  });

  it("has a rule entry for every condition", () => {
    expect(Object.keys(CONDITION_BLOCKS).sort()).toEqual([...CONDITIONS].sort());
  });
});
