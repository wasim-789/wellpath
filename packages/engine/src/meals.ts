/**
 * Deterministic meal planner. Same foods + same targets + same seed = same plan, every time.
 *
 * For each day it fills breakfast, lunch, snack and dinner in that order. Each meal gets a share of
 * whatever the day still needs, so dinner corrects any gap left by earlier meals.
 * A meal follows a local template (curry + roti, biryani + raita, paratha + dahi + chai), and the
 * planner tries every food, portion and quantity that fits the template, keeping the best score:
 * close to the calorie target, enough protein, and not repeated too often.
 *
 * Condition food rules (see safety.ts) take out sugary foods for diabetes and very salty ones for high
 * blood pressure, and make white rice and naan rare for diabetes. People can swap any meal for one of
 * a few alternatives (mealAlternatives); saved swaps are put back in on every rebuild.
 *
 * Reasons are codes with numbers, not sentences, so the apps can translate them (see reasonText).
 */
import { DEFAULT_ROLE, type Condition, type DietType, type Food, type MealRole, type MealSlot, type Nutrients } from "@wellpath/shared";
import { nutrientsForPortion, sumNutrients } from "./nutrition";
import { conditionsWithFoodRules, isFoodAllowed, isFoodLimited } from "./safety";

/** Which food diet categories each diet may eat. "vegetarian" here includes dairy. */
const DIET_ALLOWS: Record<DietType, readonly DietType[]> = {
  vegetarian: ["vegetarian"],
  eggetarian: ["vegetarian", "eggetarian"],
  non_vegetarian: ["vegetarian", "eggetarian", "non_vegetarian"],
};

export const dietAllows = (diet: DietType, food: Pick<Food, "dietCategory">) => DIET_ALLOWS[diet].includes(food.dietCategory);

export const mealRole = (food: Pick<Food, "role" | "category">): MealRole => food.role ?? DEFAULT_ROLE[food.category];

/** Share of the day's calories and protein for each meal. Order is the order meals are planned in. */
export const MEAL_SHARES: readonly { slot: MealSlot; share: number }[] = [
  { slot: "breakfast", share: 0.25 },
  { slot: "lunch", share: 0.35 },
  { slot: "snack", share: 0.1 },
  { slot: "dinner", share: 0.3 },
];

/** Plates people actually eat. Roles in brackets are optional. */
const TEMPLATES: Record<MealSlot, readonly { need: MealRole[]; optional: MealRole[] }[]> = {
  breakfast: [
    { need: ["main", "staple"], optional: ["drink"] }, // omelette + paratha + chai
    { need: ["staple", "side"], optional: ["drink"] }, // paratha + dahi + chai
    { need: ["complete"], optional: ["side", "drink"] }, // oats + banana
  ],
  lunch: [
    { need: ["main", "staple"], optional: ["side"] }, // daal + roti + kachumber
    { need: ["complete"], optional: ["side"] }, // biryani + raita
  ],
  dinner: [
    { need: ["main", "staple"], optional: ["side"] },
    { need: ["complete"], optional: ["side"] },
  ],
  snack: [{ need: [], optional: [] }], // one item of any role except staple, see snackChoices
};

/** Conditions where a weekly treat (fried or very sweet) is left out. */
const NO_TREAT_CONDITIONS: readonly Condition[] = ["diabetes", "high_blood_pressure"];
/** The day (0-based) whose snack may be a treat, so it lands near the weekend of a Monday-start week. */
const TREAT_DAY = 5;
/** Below this many calories a day a treat crowds out real food. */
const TREAT_MIN_CALORIES = 1800;

export type ReasonCode =
  | "diet_filter"
  | "condition_foods"
  | "swapped"
  | "calorie_split"
  | "weekly_treat"
  | "no_treat_condition"
  | "unverified_foods"
  | "meal_calories"
  | "protein_rich"
  | "fibre_rich"
  | "fresh_choice"
  | "treat"
  | "day_on_target"
  | "day_off_target"
  | "day_protein_low"
  | "no_foods_for_meal";

export type Reason = { code: ReasonCode; params?: Record<string, string | number> };

export type PlannedItem = {
  slug: string;
  name: string;
  role: MealRole;
  portionIndex: number;
  portionLabel: string;
  quantity: number;
  /** Ready to show: "2 medium roti", "1½ katori". */
  amount: string;
  grams: number;
  nutrients: Nutrients;
  verified: boolean;
};

export type PlannedMeal = {
  slot: MealSlot;
  items: PlannedItem[];
  totals: Nutrients;
  target: { kcal: number; proteinG: number };
  reasons: Reason[];
  /** True when the person swapped this meal for one of the alternatives. */
  swapped?: boolean;
};

/** A meal as stored when someone swaps it: which foods, which portion, how many. */
export type MealChoice = { slug: string; portionIndex: number; quantity: number }[];
export type MealSwap = { day: number; slot: MealSlot; items: MealChoice };
export type PlannedDay = { day: number; meals: PlannedMeal[]; totals: Nutrients; reasons: Reason[] };
export type MealPlan = {
  dietType: DietType;
  target: { calories: number; proteinG: number };
  days: PlannedDay[];
  reasons: Reason[];
};

export type MealPlanInput = {
  targets: { calories: number; proteinG: number };
  dietType: DietType;
  conditions?: readonly Condition[];
  foods: readonly Food[];
  /** Any text. Use the user id plus the week, so each week differs but reloads do not. */
  seed: string;
  days?: number;
  /** Meals the person swapped. Ones that no longer fit (food deleted, diet changed) are ignored. */
  swaps?: readonly MealSwap[];
};

/* ---------- small helpers ---------- */

/** FNV-1a: a fast, stable string hash, the same on every machine. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A stable number from 0 to 1 for this food on this day, used to break ties between good options. */
const jitter = (seed: string, day: number, slug: string) => hash(`${seed}|${day}|${slug}`) / 0xffffffff;

/** Leading count in a portion label: "2 eggs" -> 2, "2-egg omelette" -> 2, "1 katori" -> 1, "Handful" -> 1. */
const labelCount = (label: string) => Number(/^(\d+)[\s-]/.exec(label)?.[1] ?? 1);

/** No plate needs more than 4 roti, eggs or slices of one food. */
const MAX_PIECES = 4;

/**
 * Quantities the planner may use for one portion. Drinks come whole, mains at least a full katori
 * (half a katori of daal with two naan is not a real plate), and counted foods stop at 4 pieces.
 */
function quantityOptions(role: MealRole, portion: Food["portions"][number]): number[] {
  const n = labelCount(portion.label);
  const counted = ["piece", "roti", "slice"].includes(portion.unit) || n > 1;
  if (role === "drink") return [1];
  if (counted) {
    const upTo = role === "staple" ? 4 : 2;
    return [1, 2, 3, 4].filter((q) => q <= upTo && q * n <= MAX_PIECES);
  }
  if (role === "side") return [0.5, 1];
  if (role === "main") return [1, 1.5, 2];
  return [0.5, 1, 1.5, 2];
}

const fraction = (q: number) => (q === 0.5 ? "½" : q === 1.5 ? "1½" : String(q));

/** "1 katori" x 1.5 -> "1½ katori", "2 eggs" x 2 -> "4 eggs", "Handful" x 2 -> "2 × Handful". */
export function formatAmount(label: string, quantity: number): string {
  if (quantity === 1) return label;
  const m = /^(\d+)\s(.*)$/.exec(label);
  if (!m) return `${fraction(quantity)} × ${label}`;
  return `${fraction(Number(m[1]) * quantity)} ${m[2]}`;
}

type Option = { food: Food; role: MealRole; portionIndex: number; quantity: number; nutrients: Nutrients };

/** Every portion and quantity of one food. */
function optionsFor(food: Food): Option[] {
  const role = mealRole(food);
  return food.portions.flatMap((portion, portionIndex) =>
    quantityOptions(role, portion).map((quantity) => ({ food, role, portionIndex, quantity, nutrients: nutrientsForPortion(food, portionIndex, quantity) })),
  );
}

type History = { usedToday: Set<string>; bySlot: Map<MealSlot, string[][]>; weekCount: Map<string, number> };

/** How many foods of each role the search tries per meal. The best-rested foods go first. */
const CANDIDATES_PER_ROLE = 7;

/**
 * Foods a condition says to eat less often (white rice and naan for diabetes): a fixed cost plus more for
 * every time they are already in the week, so they turn up once or twice instead of every day.
 */
const LIMITED_PENALTY = 0.3;
const LIMITED_REPEAT_PENALTY = 0.6;

type Ctx = { seed: string; day: number; slot: MealSlot; history: History; conditions: readonly Condition[] };

/** Lower is better: variety and tie-breaking, before calories are considered. */
function foodPenalty(food: Food, role: MealRole, ctx: Ctx): number {
  let s = 0.04 * jitter(ctx.seed, ctx.day, food.slug);
  if (!food.verified) s += 0.01;
  const weekUses = ctx.history.weekCount.get(food.slug) ?? 0;
  if (isFoodLimited(food, ctx.conditions)) s += LIMITED_PENALTY + LIMITED_REPEAT_PENALTY * weekUses;
  // Roti, rice and breakfast chai every day is normal. Repeating the same curry or snack is not.
  if (role === "staple" || (role === "drink" && ctx.slot !== "snack")) return s;
  if (ctx.history.usedToday.has(food.slug)) s += 2;
  if ((ctx.history.bySlot.get(ctx.slot) ?? []).slice(-2).some((meal) => meal.includes(food.slug))) s += 0.35;
  return s + 0.12 * weekUses;
}

/**
 * What makes two plates different to the person eating them: the curry or dish, not whether it comes
 * with raita or 2 or 3 roti. Sides count only when there is no curry or dish, then staples and drinks.
 */
function plateKey(items: readonly { slug: string; role: MealRole }[]): string {
  const tiers: MealRole[][] = [["main", "complete"], ["side"], ["staple", "drink"]];
  const key = tiers.map((roles) => items.filter((i) => roles.includes(i.role))).find((l) => l.length) ?? [];
  return key.map((i) => i.slug).sort().join("+");
}
const optionKey = (items: readonly Option[]) => plateKey(items.map((o) => ({ slug: o.food.slug, role: o.role })));

/**
 * The best `count` different plates for one meal, best first. Tries every template, food, portion and
 * quantity among the top candidates, scoring calorie distance, missing protein and the food penalties.
 */
function bestMeals(
  slot: MealSlot,
  foodsByRole: Map<MealRole, Food[]>,
  target: { kcal: number; proteinG: number },
  ctx: Ctx,
  optionCache: Map<Food, Option[]>,
  onlyTreats: boolean,
  count: number,
): Option[][] {
  const penalty = new Map<Food, number>();
  const optionsForRole = (role: MealRole): Option[] => {
    const foods = (foodsByRole.get(role) ?? []).filter((f) => !onlyTreats || f.treat);
    for (const f of foods) if (!penalty.has(f)) penalty.set(f, foodPenalty(f, role, ctx));
    const top = [...foods].sort((a, b) => penalty.get(a)! - penalty.get(b)!).slice(0, CANDIDATES_PER_ROLE);
    return top.flatMap((f) => {
      if (!optionCache.has(f)) optionCache.set(f, optionsFor(f));
      return optionCache.get(f)!;
    });
  };

  const top: { score: number; items: Option[]; key: string }[] = [];
  const evaluate = (items: Option[]) => {
    let kcal = 0, protein = 0, s = 0;
    for (const o of items) {
      kcal += o.nutrients.kcal;
      protein += o.nutrients.proteinG;
      s += penalty.get(o.food)!;
    }
    s += Math.abs(kcal - target.kcal) / Math.max(target.kcal, 1);
    if (target.proteinG > 0) s += PROTEIN_WEIGHT * (Math.max(0, target.proteinG - protein) / target.proteinG);
    if (top.length === count && s >= top[count - 1].score) return;
    // Keep only the best version of each plate, so the choices really differ.
    const key = optionKey(items);
    const same = top.findIndex((t) => t.key === key);
    if (same >= 0) {
      if (top[same].score <= s) return;
      top.splice(same, 1);
    }
    top.push({ score: s, items, key });
    top.sort((a, b) => a.score - b.score);
    if (top.length > count) top.pop();
  };

  if (slot === "snack") {
    for (const role of MEAL_ROLES_FOR_SNACK) for (const o of optionsForRole(role)) evaluate([o]);
    return top.map((t) => t.items);
  }

  for (const { need, optional } of TEMPLATES[slot]) {
    const needLists = need.map(optionsForRole);
    if (needLists.some((l) => l.length === 0)) continue;
    const optionalLists = optional.map(optionsForRole);
    const walk = (i: number, picked: Option[]) => {
      if (i === needLists.length + optionalLists.length) return evaluate(picked);
      if (i < needLists.length) {
        for (const o of needLists[i]) if (!picked.some((p) => p.food === o.food)) walk(i + 1, [...picked, o]);
        return;
      }
      walk(i + 1, picked); // leave this optional item out
      for (const o of optionalLists[i - needLists.length]) if (!picked.some((p) => p.food === o.food)) walk(i + 1, [...picked, o]);
    };
    walk(0, []);
  }
  return top.map((t) => t.items);
}

/** How much a gram of missing protein matters compared with a calorie off target (both as a share of the target). */
const PROTEIN_WEIGHT = 0.8;

/** A day below this share of the protein goal gets an honest note with an easy fix. */
const LOW_PROTEIN_SHARE = 0.8;

const MEAL_ROLES_FOR_SNACK: readonly MealRole[] = ["main", "complete", "side", "drink"];

function toItem(o: Option): PlannedItem {
  const portion = o.food.portions[o.portionIndex];
  return {
    slug: o.food.slug,
    name: o.food.name,
    role: o.role,
    portionIndex: o.portionIndex,
    portionLabel: portion.label,
    quantity: o.quantity,
    amount: formatAmount(portion.label, o.quantity),
    grams: Math.round(portion.grams * o.quantity),
    nutrients: o.nutrients,
    verified: o.food.verified,
  };
}

/** A planned meal from the chosen options, with the reasons for it. */
function makeMeal(slot: MealSlot, chosen: Option[], target: { kcal: number; proteinG: number }, extra: Reason[] = []): PlannedMeal {
  const items = chosen.map(toItem);
  const totals = sumNutrients(items.map((i) => i.nutrients));
  const reasons: Reason[] = [];
  if (!items.length) reasons.push({ code: "no_foods_for_meal", params: { slot } });
  else {
    reasons.push({ code: "meal_calories", params: { kcal: totals.kcal, target: target.kcal } });
    reasons.push(...extra);
    if (chosen.some((o) => o.food.treat)) reasons.push({ code: "treat" });
    if (totals.proteinG >= Math.max(15, target.proteinG)) reasons.push({ code: "protein_rich", params: { proteinG: Math.round(totals.proteinG) } });
    if (totals.fiberG >= 8) reasons.push({ code: "fibre_rich", params: { fiberG: Math.round(totals.fiberG) } });
  }
  return { slot, items, totals, target, reasons };
}

/** A day's totals and the notes on how close it came to the targets. */
function makeDay(day: number, meals: PlannedMeal[], targets: MealPlanInput["targets"]): PlannedDay {
  const totals = sumNutrients(meals.map((m) => m.totals));
  const onTarget = Math.abs(totals.kcal - targets.calories) <= targets.calories * 0.1;
  const reasons: Reason[] = [{ code: onTarget ? "day_on_target" : "day_off_target", params: { kcal: totals.kcal, target: targets.calories } }];
  if (totals.proteinG < targets.proteinG * LOW_PROTEIN_SHARE) {
    reasons.push({ code: "day_protein_low", params: { proteinG: Math.round(totals.proteinG), target: targets.proteinG } });
  }
  return { day, meals, totals, reasons };
}

/* ---------- the planner ---------- */

type Prepared = {
  allowed: Food[];
  treatsAllowed: boolean;
  conditions: readonly Condition[];
  /** Allowed foods for a meal, grouped by role. Treats only on the weekly treat snack. */
  foodsByRole: (slot: MealSlot, withTreats: boolean) => Map<MealRole, Food[]>;
  optionCache: Map<Food, Option[]>;
};

function prepare({ targets, dietType, conditions = [], foods }: MealPlanInput): Prepared {
  // Diet first, then the condition food rules: a food with an "avoid" tag is never planned.
  const allowed = foods.filter((f) => dietAllows(dietType, f) && isFoodAllowed(f, conditions));
  const treatsAllowed = targets.calories >= TREAT_MIN_CALORIES && !conditions.some((c) => NO_TREAT_CONDITIONS.includes(c));
  const roleCache = new Map<string, Map<MealRole, Food[]>>();
  const foodsByRole = (slot: MealSlot, withTreats: boolean) => {
    const key = `${slot}|${withTreats}`;
    if (!roleCache.has(key)) {
      const byRole = new Map<MealRole, Food[]>();
      for (const f of allowed) {
        if (!f.mealSlots.includes(slot) || (f.treat && !withTreats)) continue;
        const role = mealRole(f);
        byRole.set(role, [...(byRole.get(role) ?? []), f]);
      }
      roleCache.set(key, byRole);
    }
    return roleCache.get(key)!;
  };
  return { allowed, treatsAllowed, conditions, foodsByRole, optionCache: new Map() };
}

const isTreatSnack = (prep: Prepared, day: number, slot: MealSlot) => slot === "snack" && prep.treatsAllowed && day === TREAT_DAY;

/** The week as the planner picks it, before any swaps. */
function planWeek(input: MealPlanInput, prep: Prepared): PlannedDay[] {
  const { targets, seed, days = 7 } = input;
  const history: History = { usedToday: new Set(), bySlot: new Map(), weekCount: new Map() };
  const planDays: PlannedDay[] = [];

  for (let day = 0; day < days; day++) {
    history.usedToday = new Set();
    let kcalLeft = targets.calories;
    let proteinLeft = targets.proteinG;
    let shareLeft = 1;
    const meals = new Map<MealSlot, PlannedMeal>();

    for (const { slot, share } of MEAL_SHARES) {
      const target = { kcal: Math.round((kcalLeft * share) / shareLeft), proteinG: Math.round((proteinLeft * share) / shareLeft) };
      const treatSnack = isTreatSnack(prep, day, slot);
      const ctx = { seed, day, slot, history, conditions: prep.conditions };
      const [chosen = []] = bestMeals(slot, prep.foodsByRole(slot, treatSnack), target, ctx, prep.optionCache, treatSnack, 1);
      const fresh = chosen.find((o) => o.role !== "staple" && o.role !== "drink" && !history.weekCount.has(o.food.slug));
      const meal = makeMeal(slot, chosen, target, fresh && day > 0 ? [{ code: "fresh_choice", params: { food: fresh.food.name } }] : []);

      for (const o of chosen) {
        history.usedToday.add(o.food.slug);
        history.weekCount.set(o.food.slug, (history.weekCount.get(o.food.slug) ?? 0) + 1);
      }
      history.bySlot.set(slot, [...(history.bySlot.get(slot) ?? []), chosen.map((o) => o.food.slug)]);

      meals.set(slot, meal);
      kcalLeft -= meal.totals.kcal;
      proteinLeft = Math.max(0, proteinLeft - meal.totals.proteinG);
      shareLeft -= share;
    }

    // Show meals in the usual order of the day, with the evening snack before dinner.
    planDays.push(makeDay(day, DAY_ORDER.map((s) => meals.get(s)!), targets));
  }
  return planDays;
}

const DAY_ORDER = ["breakfast", "lunch", "snack", "dinner"] as const;

/**
 * The options a saved swap stands for, or null when it no longer fits: the food was deleted, the diet
 * or conditions changed, or the portion is gone. A swap that no longer fits is ignored, never forced.
 */
function swapOptions(swap: MealSwap, prep: Prepared): Option[] | null {
  if (!swap.items.length) return null;
  const options: Option[] = [];
  for (const item of swap.items) {
    const food = prep.allowed.find((f) => f.slug === item.slug);
    if (!food || !food.mealSlots.includes(swap.slot)) return null;
    if (food.treat && !isTreatSnack(prep, swap.day, swap.slot)) return null;
    const portion = food.portions[item.portionIndex];
    const role = mealRole(food);
    if (!portion || !quantityOptions(role, portion).includes(item.quantity)) return null;
    if (options.some((o) => o.food === food)) return null;
    options.push({ food, role, portionIndex: item.portionIndex, quantity: item.quantity, nutrients: nutrientsForPortion(food, item.portionIndex, item.quantity) });
  }
  return options;
}

/** The plan with the person's own swaps put in. Meals they did not swap stay exactly as planned. */
function buildPlan(input: MealPlanInput, prep: Prepared): MealPlan {
  const { targets, dietType, conditions = [], swaps = [] } = input;
  const days = planWeek(input, prep);

  for (const swap of swaps) {
    const day = days[swap.day];
    const index = day?.meals.findIndex((m) => m.slot === swap.slot) ?? -1;
    const chosen = index >= 0 ? swapOptions(swap, prep) : null;
    if (!chosen) continue;
    const meals = [...day.meals];
    meals[index] = { ...makeMeal(swap.slot, chosen, meals[index].target, [{ code: "swapped" }]), swapped: true };
    days[swap.day] = makeDay(swap.day, meals, targets);
  }

  const reasons: Reason[] = [{ code: "diet_filter", params: { diet: dietType } }];
  for (const condition of conditionsWithFoodRules(conditions)) reasons.push({ code: "condition_foods", params: { condition } });
  reasons.push({ code: "calorie_split" });
  if (prep.treatsAllowed) reasons.push({ code: "weekly_treat" });
  else if (conditions.some((c) => NO_TREAT_CONDITIONS.includes(c))) reasons.push({ code: "no_treat_condition" });
  if (days.some((d) => d.meals.some((m) => m.items.some((i) => !i.verified)))) reasons.push({ code: "unverified_foods" });

  return { dietType, target: { ...targets }, days, reasons };
}

export function planMeals(input: MealPlanInput): MealPlan {
  return buildPlan(input, prepare(input));
}

/** How a meal is stored as a swap, and compared: the same foods, portions and amounts. */
export const mealChoice = (meal: Pick<PlannedMeal, "items">): MealChoice =>
  meal.items.map(({ slug, portionIndex, quantity }) => ({ slug, portionIndex, quantity }));

export const sameChoice = (a: MealChoice, b: MealChoice) => {
  const sig = (c: MealChoice) => c.map((i) => `${i.slug}:${i.portionIndex}:${i.quantity}`).sort().join("|");
  return sig(a) === sig(b);
};

/** How far an alternative's calories may stray from what the meal aims for. */
const ALT_KCAL_SLACK = 0.2;

/**
 * Other plates for one meal of the plan, for someone who does not fancy what was planned.
 * They aim at the same calories and protein, follow the same diet and condition rules, avoid foods
 * already eaten that day, and each one has a different curry, dish or side from the current meal.
 */
export function mealAlternatives(input: MealPlanInput & { day: number; slot: MealSlot; count?: number }): PlannedMeal[] {
  const { day, slot, count = 3, seed } = input;
  const prep = prepare(input);
  const plan = buildPlan(input, prep);
  const current = plan.days[day]?.meals.find((m) => m.slot === slot);
  if (!current) throw new RangeError(`The plan has no ${slot} on day ${day}`);

  // The rest of the week, as if this meal were still to be chosen.
  const history: History = { usedToday: new Set(), bySlot: new Map(), weekCount: new Map() };
  for (const d of plan.days) {
    for (const m of d.meals) {
      if (d.day === day && m.slot === slot) continue;
      const slugs = m.items.map((i) => i.slug);
      for (const s of slugs) history.weekCount.set(s, (history.weekCount.get(s) ?? 0) + 1);
      if (d.day === day) slugs.forEach((s) => history.usedToday.add(s));
      if (m.slot === slot && d.day < day) history.bySlot.set(slot, [...(history.bySlot.get(slot) ?? []), slugs]);
    }
  }
  // Steer away from what is on the plate now.
  current.items.forEach((i) => history.usedToday.add(i.slug));

  const ctx = { seed, day, slot, history, conditions: prep.conditions };
  const currentKey = plateKey(current.items);
  const treatSnack = isTreatSnack(prep, day, slot);
  const ranked = bestMeals(slot, prep.foodsByRole(slot, treatSnack), current.target, ctx, prep.optionCache, false, count * 4).filter(
    // Not the plate on the table now, and close enough to the meal's calories to keep the day on target.
    (chosen) => optionKey(chosen) !== currentKey && Math.abs(chosen.reduce((k, o) => k + o.nutrients.kcal, 0) - current.target.kcal) <= current.target.kcal * ALT_KCAL_SLACK,
  );

  // A real choice: prefer a different kind of food each time (a daal, a meat dish, a sabzi), best first.
  const kind = (chosen: Option[]) => (chosen.find((o) => o.role === "main" || o.role === "complete") ?? chosen[0])?.food.category;
  const picked: Option[][] = [];
  while (picked.length < count && ranked.length) {
    const seen = new Set(picked.map(kind));
    const next = ranked.findIndex((chosen) => !seen.has(kind(chosen)));
    picked.push(...ranked.splice(next >= 0 ? next : 0, 1));
  }
  return picked.map((chosen) => makeMeal(slot, chosen, current.target));
}

/* ---------- English text for reasons (the apps may translate the codes instead) ---------- */

const DIET_TEXT: Record<DietType, string> = { vegetarian: "vegetarian", eggetarian: "vegetarian with eggs", non_vegetarian: "vegetarian and non-vegetarian" };

const CONDITION_FOOD_TEXT: Partial<Record<Condition, string>> = {
  diabetes: "Because you have diabetes, sugary foods such as sweetened chai, sweet lassi and dates are left out, and white rice, naan and paratha are planned less often, with roti and brown rice instead. Have chai without sugar.",
  high_blood_pressure: "Because of high blood pressure, very salty foods such as nihari, haleem, kababs, pakoray and salted lassi are left out.",
};

export function reasonText({ code, params = {} }: Reason): string {
  const p = params;
  switch (code) {
    case "diet_filter": return p.diet === "non_vegetarian" ? "A mix of vegetarian and non-vegetarian dishes, as you eat both." : `Only foods that suit your ${DIET_TEXT[p.diet as DietType] ?? String(p.diet)} diet.`;
    case "condition_foods": return CONDITION_FOOD_TEXT[p.condition as Condition] ?? "Some foods are left out because of a health condition you told us about.";
    case "swapped": return "You picked this instead of the original plan.";
    case "calorie_split": return "Calories are split about 25% breakfast, 35% lunch, 10% snack and 30% dinner.";
    case "weekly_treat": return "One small treat is planned once a week, because a plan you can enjoy is a plan you can keep.";
    case "no_treat_condition": return "No fried or very sweet treats are planned, because of the health condition you told us about.";
    case "unverified_foods": return "Some food values are estimates that have not been checked yet, so treat the numbers as a guide.";
    case "meal_calories": return `About ${p.kcal} kcal, close to the ${p.target} kcal this meal aims for.`;
    case "protein_rich": return `Good protein: ${p.proteinG} g.`;
    case "fibre_rich": return `High in fibre: ${p.fiberG} g, which keeps you full for longer.`;
    case "fresh_choice": return `${p.food} is new this week, for variety.`;
    case "treat": return "Your weekly treat. Enjoy it slowly.";
    case "day_on_target": return `${p.kcal} kcal in total, within 10% of your ${p.target} kcal target.`;
    case "day_off_target": return `${p.kcal} kcal in total. The food list could not get closer to your ${p.target} kcal target today.`;
    case "day_protein_low": return `${p.proteinG} g protein, below your ${p.target} g goal. An extra glass of milk, dahi or a handful of roasted chana would help.`;
    case "no_foods_for_meal": return `No suitable foods were found for ${p.slot}. An admin needs to add more.`;
  }
}
