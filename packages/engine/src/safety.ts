/**
 * Exercise and food safety rules. They live in code, not the database, so they are reviewed in pull requests,
 * tested on every change, and can never be weakened by an admin edit.
 * They are conservative wellness rules, not medical advice: each condition also shows a doctor notice.
 */
import { type Condition, type Exercise, type ExerciseLoad, type FoodTag, LOAD_LABEL } from "@wellpath/shared";

/** Loads each condition rules out. An exercise with any blocked load is never planned. */
export const CONDITION_BLOCKS: Record<Condition, readonly ExerciseLoad[]> = {
  knee_pain: ["deep_knee_bend", "jumping"],
  lower_back_pain: ["spine_bending", "spine_twisting", "spine_loading", "jumping"],
  shoulder_injury: ["overhead", "shoulder_weight_bearing"],
  high_blood_pressure: ["breath_holding", "high_intensity"],
  // Diabetes changes nothing about which exercises are safe; it gets a doctor notice instead.
  diabetes: [],
};

/**
 * Loads left out during pregnancy or breastfeeding, on top of any condition rules: no jumping,
 * very hard efforts, back arching or long breath-holding holds. Pregnancy also keeps workouts at beginner level.
 */
export const PREGNANCY_BLOCKS: readonly ExerciseLoad[] = ["jumping", "high_intensity", "spine_loading", "breath_holding"];

/** Every load blocked by at least one of the user's conditions. */
export function blockedLoads(conditions: readonly Condition[]): Set<ExerciseLoad> {
  return new Set(conditions.flatMap((c) => CONDITION_BLOCKS[c]));
}

type Loaded = { loads: readonly ExerciseLoad[] };

/** Why an exercise is unsafe for these conditions, or null if it is safe. */
export function unsafeReason(exercise: Loaded, conditions: readonly Condition[]): string | null {
  const blocked = blockedLoads(conditions);
  const hit = exercise.loads.filter((l) => blocked.has(l));
  return hit.length ? `Left out because it involves ${hit.map((l) => LOAD_LABEL[l]).join(" and ")}.` : null;
}

export const isExerciseSafe = (exercise: Loaded, conditions: readonly Condition[]) => unsafeReason(exercise, conditions) === null;

/** Only the exercises that are safe for every one of these conditions. */
export const safeExercises = <T extends Pick<Exercise, "loads">>(exercises: readonly T[], conditions: readonly Condition[]): T[] =>
  exercises.filter((e) => isExerciseSafe(e, conditions));

/* ---------- food rules ---------- */

/**
 * Food rules per condition. "avoid" tags are never planned; "limit" tags are planned rarely,
 * so the plan leans on roti, brown rice and daal instead of white rice, naan and paratha.
 */
export const CONDITION_FOOD_RULES: Record<Condition, { avoid: readonly FoodTag[]; limit: readonly FoodTag[] }> = {
  diabetes: { avoid: ["sugary"], limit: ["refined_carb"] },
  high_blood_pressure: { avoid: ["high_salt"], limit: [] },
  knee_pain: { avoid: [], limit: [] },
  lower_back_pain: { avoid: [], limit: [] },
  shoulder_injury: { avoid: [], limit: [] },
};

type Tagged = { tags?: readonly FoodTag[] };

const tagsHit = (food: Tagged, conditions: readonly Condition[], kind: "avoid" | "limit") => {
  const rule = new Set(conditions.flatMap((c) => CONDITION_FOOD_RULES[c][kind]));
  return (food.tags ?? []).filter((t) => rule.has(t));
};

/** False when one of the user's conditions rules this food out. */
export const isFoodAllowed = (food: Tagged, conditions: readonly Condition[]) => tagsHit(food, conditions, "avoid").length === 0;

/** True when the food is allowed but should be eaten rarely for these conditions. */
export const isFoodLimited = (food: Tagged, conditions: readonly Condition[]) => tagsHit(food, conditions, "limit").length > 0;

/** Conditions whose food rules change anything, in a fixed order. */
export const conditionsWithFoodRules = (conditions: readonly Condition[]) =>
  (Object.keys(CONDITION_FOOD_RULES) as Condition[]).filter(
    (c) => conditions.includes(c) && (CONDITION_FOOD_RULES[c].avoid.length > 0 || CONDITION_FOOD_RULES[c].limit.length > 0),
  );
