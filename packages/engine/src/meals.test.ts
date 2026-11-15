import { describe, expect, it } from "vitest";
import type { Food } from "@wellpath/shared";
import { dietAllows, formatAmount, mealAlternatives, mealChoice, mealRole, planMeals, reasonText, sameChoice, type Reason } from "./meals";

/** A tiny, hand-checked food list. Values per 100 g. */
const make = (slug: string, f: Partial<Food> & Pick<Food, "category" | "dietCategory" | "mealSlots">, kcal: number, proteinG: number, portion: Food["portions"][number]): Food => ({
  slug,
  name: slug,
  per100g: { kcal, proteinG, carbsG: Math.max(0, (kcal - proteinG * 4) / 4 - 2), fatG: 1, fiberG: 2 },
  portions: [portion],
  treat: false,
  source: { name: "test" },
  verified: false,
  ...f,
});

const katori = { unit: "katori", label: "1 katori", grams: 150 } as const;
const FOODS: Food[] = [
  make("roti", { category: "bread", dietCategory: "vegetarian", mealSlots: ["breakfast", "lunch", "dinner"] }, 300, 10, { unit: "roti", label: "1 roti", grams: 40 }),
  make("rice", { category: "rice", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], tags: ["refined_carb"] }, 130, 3, { unit: "plate", label: "1 plate", grams: 200 }),
  make("daal", { category: "lentils", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"] }, 120, 8, katori),
  make("sabzi", { category: "vegetables", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"] }, 90, 3, katori),
  make("chana", { category: "lentils", dietCategory: "vegetarian", mealSlots: ["breakfast", "lunch", "dinner"] }, 140, 7, katori),
  make("karahi", { category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"] }, 170, 17, katori),
  make("egg-curry", { category: "eggs", dietCategory: "eggetarian", mealSlots: ["lunch", "dinner"] }, 150, 9, katori),
  make("omelette", { category: "eggs", dietCategory: "eggetarian", mealSlots: ["breakfast"] }, 180, 11, { unit: "piece", label: "2-egg omelette", grams: 120 }),
  make("biryani", { category: "rice", role: "complete", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"] }, 170, 9, { unit: "plate", label: "1 plate", grams: 300 }),
  make("dahi", { category: "dairy", dietCategory: "vegetarian", mealSlots: ["breakfast", "lunch", "dinner", "snack"] }, 60, 3.5, katori),
  make("chai", { category: "drinks", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], tags: ["sugary"] }, 60, 2, { unit: "cup", label: "1 cup", grams: 150 }),
  make("chai-plain", { category: "drinks", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"] }, 40, 2, { unit: "cup", label: "1 cup", grams: 150 }),
  make("kabab", { category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner", "snack"], tags: ["high_salt"] }, 230, 14, { unit: "piece", label: "1 kabab", grams: 50 }),
  make("apple", { category: "fruit", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"] }, 52, 0.3, { unit: "piece", label: "1 apple", grams: 180 }),
  make("chana-roast", { category: "snacks", dietCategory: "vegetarian", mealSlots: ["snack"] }, 370, 20, { unit: "handful", label: "1 handful", grams: 30 }),
  make("samosa", { category: "snacks", dietCategory: "vegetarian", mealSlots: ["snack"], treat: true }, 260, 4, { unit: "piece", label: "1 samosa", grams: 100 }),
];

const base = { targets: { calories: 2000, proteinG: 100 }, dietType: "non_vegetarian", foods: FOODS, seed: "user-1|2026-11-16" } as const;
const allItems = (plan: ReturnType<typeof planMeals>) => plan.days.flatMap((d) => d.meals.flatMap((m) => m.items));

describe("diet and roles", () => {
  it("lets each diet eat only what suits it", () => {
    const egg = FOODS.find((f) => f.slug === "egg-curry")!;
    expect(dietAllows("vegetarian", egg)).toBe(false);
    expect(dietAllows("eggetarian", egg)).toBe(true);
    expect(dietAllows("non_vegetarian", egg)).toBe(true);
  });

  it("uses the category's role unless the food sets its own", () => {
    expect(mealRole({ category: "rice" })).toBe("staple");
    expect(mealRole({ category: "rice", role: "complete" })).toBe("complete");
  });
});

describe("formatAmount", () => {
  it.each([
    ["1 katori", 1, "1 katori"],
    ["1 katori", 1.5, "1½ katori"],
    ["1 katori", 0.5, "½ katori"],
    ["1 medium roti", 3, "3 medium roti"],
    ["2 eggs", 2, "4 eggs"],
    ["Handful", 2, "2 × Handful"],
  ])("%s × %s is %s", (label, q, expected) => expect(formatAmount(label, q)).toBe(expected));
});

describe("planMeals", () => {
  it("gives the same plan for the same seed, and a different one for another week", () => {
    expect(planMeals(base)).toEqual(planMeals(base));
    const other = planMeals({ ...base, seed: "user-1|2026-11-23" });
    expect(JSON.stringify(other.days)).not.toBe(JSON.stringify(planMeals(base).days));
  });

  it("plans 7 days of breakfast, lunch, snack and dinner", () => {
    const plan = planMeals(base);
    expect(plan.days).toHaveLength(7);
    for (const d of plan.days) expect(d.meals.map((m) => m.slot)).toEqual(["breakfast", "lunch", "snack", "dinner"]);
  });

  it.each(["vegetarian", "eggetarian"] as const)("never gives a %s anything outside their diet", (dietType) => {
    const slugs = new Set(allItems(planMeals({ ...base, dietType })).map((i) => i.slug));
    expect(slugs.has("karahi")).toBe(false);
    expect(slugs.has("biryani")).toBe(false);
    if (dietType === "vegetarian") expect([...slugs].some((s) => s.includes("egg") || s === "omelette")).toBe(false);
  });

  it("keeps each day within 10% of the calorie target", () => {
    for (const calories of [1400, 2000, 2800]) {
      for (const d of planMeals({ ...base, targets: { calories, proteinG: 100 } }).days) {
        expect(Math.abs(d.totals.kcal - calories), `${calories} day ${d.day}`).toBeLessThanOrEqual(calories * 0.1);
      }
    }
  });

  it("builds lunch and dinner as a curry with roti or rice, or a complete dish", () => {
    for (const d of planMeals(base).days) {
      for (const m of d.meals.filter((x) => x.slot === "lunch" || x.slot === "dinner")) {
        const roles = m.items.map((i) => i.role);
        const curryPlate = roles.includes("main") && roles.includes("staple");
        expect(curryPlate || roles.includes("complete"), JSON.stringify(m.items.map((i) => i.slug))).toBe(true);
      }
    }
  });

  it("does not repeat a curry within a day", () => {
    for (const d of planMeals(base).days) {
      const curries = d.meals.flatMap((m) => m.items.filter((i) => i.role === "main" || i.role === "complete").map((i) => i.slug));
      expect(new Set(curries).size).toBe(curries.length);
    }
  });

  it("plans one treat a week, never for diabetes or high blood pressure, never on low calories", () => {
    const treats = (p: ReturnType<typeof planMeals>) => allItems(p).filter((i) => i.slug === "samosa").length;
    expect(treats(planMeals(base))).toBe(1);
    expect(treats(planMeals({ ...base, conditions: ["diabetes"] }))).toBe(0);
    expect(treats(planMeals({ ...base, conditions: ["high_blood_pressure"] }))).toBe(0);
    expect(treats(planMeals({ ...base, targets: { calories: 1500, proteinG: 90 } }))).toBe(0);
    expect(planMeals({ ...base, conditions: ["diabetes"] }).reasons.map((r) => r.code)).toContain("no_treat_condition");
  });

  it("explains every meal and day", () => {
    const plan = planMeals(base);
    expect(plan.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["diet_filter", "calorie_split", "unverified_foods"]));
    for (const d of plan.days) {
      expect(d.reasons[0].code).toMatch(/^day_(on|off)_target$/);
      for (const m of d.meals) expect(m.reasons[0].code).toBe("meal_calories");
    }
  });

  it("reports an empty meal instead of failing when no food fits", () => {
    const plan = planMeals({ ...base, foods: FOODS.filter((f) => !f.mealSlots.includes("breakfast")) });
    const breakfast = plan.days[0].meals[0];
    expect(breakfast.items).toEqual([]);
    expect(breakfast.reasons).toEqual([{ code: "no_foods_for_meal", params: { slot: "breakfast" } }]);
  });

  it("caps counted foods at 4 pieces and serves drinks whole", () => {
    for (const i of allItems(planMeals({ ...base, targets: { calories: 3200, proteinG: 150 } }))) {
      if (i.slug === "roti") expect(i.quantity).toBeLessThanOrEqual(4);
      if (i.slug === "omelette") expect(i.quantity).toBeLessThanOrEqual(2);
      if (i.slug === "chai") expect(i.quantity).toBe(1);
    }
  });
});

describe("reasonText", () => {
  it("has English text for every reason the planner gives", () => {
    const plan = planMeals(base);
    const reasons: Reason[] = [...plan.reasons, ...plan.days.flatMap((d) => [...d.reasons, ...d.meals.flatMap((m) => m.reasons)])];
    for (const r of reasons) expect(reasonText(r)).toMatch(/\w/);
    expect(reasonText({ code: "meal_calories", params: { kcal: 480, target: 500 } })).toBe("About 480 kcal, close to the 500 kcal this meal aims for.");
  });
});

describe("condition food rules", () => {
  const slugsOf = (conditions: ("diabetes" | "high_blood_pressure")[]) =>
    allItems(planMeals({ ...base, conditions })).map((i) => i.slug);

  it("never plans sugary foods for diabetes, and plans refined carbs less often", () => {
    const plain = slugsOf([]);
    const diabetes = slugsOf(["diabetes"]);
    expect(diabetes).not.toContain("chai");
    const rice = (l: string[]) => l.filter((x) => x === "rice").length;
    expect(rice(diabetes)).toBeLessThan(Math.max(1, rice(plain)));
  });

  it("never plans very salty foods for high blood pressure", () => {
    expect(slugsOf([])).toContain("kabab");
    expect(slugsOf(["high_blood_pressure"])).not.toContain("kabab");
  });

  it("says why in the plan reasons", () => {
    const codes = planMeals({ ...base, conditions: ["diabetes", "knee_pain"] }).reasons.filter((r) => r.code === "condition_foods");
    expect(codes).toEqual([{ code: "condition_foods", params: { condition: "diabetes" } }]);
    expect(reasonText(codes[0])).toMatch(/diabetes/);
  });
});

describe("swapping a meal", () => {
  const at = { day: 2, slot: "lunch" } as const;
  const lunchOf = (plan: ReturnType<typeof planMeals>) => plan.days[at.day].meals.find((m) => m.slot === at.slot)!;

  it("offers up to 3 different plates that keep to the rules and the calories", () => {
    const current = lunchOf(planMeals(base));
    const options = mealAlternatives({ ...base, ...at, dietType: "vegetarian", conditions: ["diabetes"] });
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(3);
    for (const o of options) {
      const slugs = o.items.map((i) => i.slug);
      expect(slugs).not.toContain("karahi");
      expect(slugs).not.toContain("chai");
      expect(Math.abs(o.totals.kcal - o.target.kcal)).toBeLessThanOrEqual(o.target.kcal * 0.2);
    }
    const mains = options.map((o) => o.items.filter((i) => i.role === "main" || i.role === "complete").map((i) => i.slug).join());
    expect(new Set(mains).size).toBe(mains.length);
    expect(mealAlternatives({ ...base, ...at })).toEqual(mealAlternatives({ ...base, ...at }));
    expect(mealAlternatives({ ...base, ...at }).map((o) => mealChoice(o))).not.toContainEqual(mealChoice(current));
  });

  it("puts a saved swap in and leaves every other meal as it was", () => {
    const before = planMeals(base);
    const [pick] = mealAlternatives({ ...base, ...at });
    const after = planMeals({ ...base, swaps: [{ ...at, items: mealChoice(pick) }] });
    expect(sameChoice(mealChoice(lunchOf(after)), mealChoice(pick))).toBe(true);
    expect(lunchOf(after).swapped).toBe(true);
    expect(lunchOf(after).reasons.map((r) => r.code)).toContain("swapped");
    expect(after.days[at.day].totals.kcal).toBe(after.days[at.day].meals.reduce((k, m) => k + m.totals.kcal, 0));
    for (const d of after.days) {
      for (const m of d.meals) {
        if (d.day === at.day && m.slot === at.slot) continue;
        expect(m).toEqual(before.days[d.day].meals.find((x) => x.slot === m.slot));
      }
    }
  });

  it("ignores a swap that no longer fits the diet, the rules or the food list", () => {
    const before = planMeals(base);
    const bad = [
      [{ slug: "karahi", portionIndex: 0, quantity: 1 }, { slug: "roti", portionIndex: 0, quantity: 2 }], // not vegetarian
      [{ slug: "deleted-food", portionIndex: 0, quantity: 1 }],
      [{ slug: "daal", portionIndex: 0, quantity: 7 }], // not a quantity the planner uses
      [{ slug: "daal", portionIndex: 3, quantity: 1 }], // no such portion
    ];
    for (const items of bad) {
      const plan = planMeals({ ...base, dietType: "vegetarian", swaps: [{ ...at, items }] });
      expect(lunchOf(plan).swapped).toBeUndefined();
    }
    expect(lunchOf(planMeals({ ...base, conditions: ["high_blood_pressure"], swaps: [{ ...at, items: [{ slug: "kabab", portionIndex: 0, quantity: 2 }] }] })).swapped).toBeUndefined();
    expect(planMeals(base)).toEqual(before);
  });
});
