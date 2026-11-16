import { describe, expect, it } from "vitest";
import { foodItem, portionAmount, readFoodText, type LogFood } from "./foodlog";

const n = (kcal: number, proteinG = 0) => ({ kcal, proteinG, carbsG: 0, fatG: 0, fiberG: 0 });
const FOODS: LogFood[] = [
  { slug: "roti", name: "Roti (chapati)", nameRoman: "roti", per100g: n(300, 10), portions: [{ unit: "roti", label: "1 medium roti", grams: 40 }, { unit: "roti", label: "1 large roti", grams: 60 }] },
  { slug: "daal-masoor", name: "Daal masoor", nameRoman: "masoor ki daal", per100g: n(120, 8), portions: [{ unit: "katori", label: "1 katori", grams: 200 }] },
  { slug: "aloo-paratha", name: "Aloo paratha", nameRoman: "aloo paratha", per100g: n(250), portions: [{ unit: "piece", label: "1 aloo paratha", grams: 120 }] },
  { slug: "paratha", name: "Plain paratha", nameRoman: "paratha", per100g: n(320), portions: [{ unit: "piece", label: "1 paratha", grams: 80 }] },
  { slug: "almonds", name: "Almonds", nameRoman: "badam", per100g: n(580), portions: [{ unit: "handful", label: "10 almonds", grams: 12 }] },
  { slug: "boiled-rice", name: "Boiled white rice", nameRoman: "chawal", per100g: n(130), portions: [{ unit: "katori", label: "1 katori", grams: 150 }, { unit: "plate", label: "1 plate", grams: 250 }] },
  { slug: "chai", name: "Doodh patti chai (with sugar)", nameRoman: "chai", per100g: n(60), portions: [{ unit: "cup", label: "1 cup", grams: 150 }] },
  { slug: "dahi", name: "Plain yogurt (dahi)", nameRoman: "dahi", per100g: n(60), portions: [{ unit: "katori", label: "1 katori", grams: 150 }] },
];

describe("portionAmount", () => {
  it("counts in the portion's single unit", () => {
    expect(portionAmount(FOODS[0]!, 0, 2)).toEqual({ grams: 80, amount: "2 medium roti" });
    expect(portionAmount(FOODS[4]!, 0, 10)).toEqual({ grams: 12, amount: "10 almonds" }); // 1.2 g each
    expect(portionAmount(FOODS[5]!, 1, 0.5)).toEqual({ grams: 125, amount: "½ plate" });
    expect(portionAmount({ portions: [{ unit: "piece", label: "1 egg", grams: 50 }] }, 0, 2).amount).toBe("2 eggs");
    expect(() => portionAmount(FOODS[0]!, 5, 1)).toThrow(RangeError);
    expect(() => portionAmount(FOODS[0]!, 0, 0)).toThrow(RangeError);
  });

  it("builds a full item with nutrients", () => {
    expect(foodItem(FOODS[1]!, 0, 1.5)).toMatchObject({ slug: "daal-masoor", grams: 300, amount: "1½ katori", nutrients: { kcal: 360, proteinG: 24 } });
  });
});

describe("readFoodText", () => {
  it("reads several foods with digits, Urdu number words and portions", () => {
    const r = readFoodText("2 roti aur ek katori daal, aadha plate chawal", FOODS);
    expect(r.items.map((i) => [i.slug, i.amount])).toEqual([["roti", "2 medium roti"], ["daal-masoor", "1 katori"], ["boiled-rice", "½ plate"]]);
    expect(r.unknown).toEqual([]);
    expect(r.totals.kcal).toBe(240 + 240 + 163);
  });

  it("prefers the longest name, and reads foods written one after another", () => {
    expect(readFoodText("aloo paratha", FOODS).items[0]!.slug).toBe("aloo-paratha");
    expect(readFoodText("roti daal", FOODS).items.map((i) => i.slug)).toEqual(["roti", "daal-masoor"]);
  });

  it("handles spellings, plurals, sizes, fractions and grams", () => {
    expect(readFoodText("dal", FOODS).items[0]!.slug).toBe("daal-masoor");
    expect(readFoodText("teen rotiyan", FOODS).items[0]).toMatchObject({ slug: "roti", quantity: 3 });
    expect(readFoodText("1 bari roti", FOODS).items[0]!.amount).toBe("1 large roti");
    expect(readFoodText("dedh roti", FOODS).items[0]!.quantity).toBe(1.5);
    expect(readFoodText("1/2 katori dahi", FOODS).items[0]!.grams).toBe(75);
    expect(readFoodText("200g dahi", FOODS).items[0]).toMatchObject({ grams: 200, amount: "200 g", nutrients: { kcal: 120 } });
    expect(readFoodText("10 badam", FOODS).items[0]!.grams).toBe(12);
  });

  it("puts an amount written after the food on that food", () => {
    expect(readFoodText("chai 2 cup", FOODS).items[0]).toMatchObject({ slug: "chai", quantity: 2 });
  });

  it("uses the food's usual portion when the portion word does not fit, and says so", () => {
    const item = readFoodText("1 glass roti", FOODS).items[0]!;
    expect(item.amount).toBe("1 medium roti");
    expect(item.note).toMatch(/instead of glass/);
  });

  it("allows one small typo but flags it", () => {
    expect(readFoodText("2 parathaa", FOODS).items[0]!.match).toBe("exact"); // doubled letters are ignored
    const typo = readFoodText("chawl", FOODS).items[0]!;
    expect(typo).toMatchObject({ slug: "boiled-rice", match: "close" });
  });

  it("lists words it does not know instead of guessing, and finds the meal and water", () => {
    const r = readFoodText("nashta mein 2 roti, pizza aur 2 glass pani", FOODS);
    expect(r.slot).toBe("breakfast");
    expect(r.items.map((i) => i.slug)).toEqual(["roti"]);
    expect(r.unknown).toEqual(["pizza"]);
    expect(r.water).toBe(2);
    expect(readFoodText("", FOODS)).toMatchObject({ items: [], unknown: [] });
  });

  it("reads English too", () => {
    const r = readFoodText("I had 2 rotis and a cup of chai for dinner", FOODS);
    expect(r.items.map((i) => [i.slug, i.quantity])).toEqual([["roti", 2], ["chai", 1]]);
    expect(r.slot).toBe("dinner");
  });
});
