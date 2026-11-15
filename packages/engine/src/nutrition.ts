/** Nutrition for a real amount of food, from its per-100 g values. */
import type { Food, Nutrients } from "@wellpath/shared";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Nutrients in `grams` of a food. Calories are whole numbers; macros have one decimal. */
export function nutrientsFor(food: Pick<Food, "per100g">, grams: number): Nutrients {
  const f = grams / 100;
  const p = food.per100g;
  return {
    kcal: Math.round(p.kcal * f),
    proteinG: round1(p.proteinG * f),
    carbsG: round1(p.carbsG * f),
    fatG: round1(p.fatG * f),
    fiberG: round1(p.fiberG * f),
  };
}

/** Nutrients in a number of the food's portions, such as 2 roti or 1.5 katori. */
export function nutrientsForPortion(food: Pick<Food, "per100g" | "portions">, portionIndex: number, quantity = 1): Nutrients {
  const portion = food.portions[portionIndex];
  if (!portion) throw new RangeError(`This food has no portion number ${portionIndex}`);
  if (!(quantity > 0)) throw new RangeError("Quantity must be more than zero");
  return nutrientsFor(food, portion.grams * quantity);
}

/** Adds nutrients together, such as all the items in a meal. */
export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  const total = items.reduce(
    (a, n) => ({ kcal: a.kcal + n.kcal, proteinG: a.proteinG + n.proteinG, carbsG: a.carbsG + n.carbsG, fatG: a.fatG + n.fatG, fiberG: a.fiberG + n.fiberG }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
  return { kcal: Math.round(total.kcal), proteinG: round1(total.proteinG), carbsG: round1(total.carbsG), fatG: round1(total.fatG), fiberG: round1(total.fiberG) };
}
