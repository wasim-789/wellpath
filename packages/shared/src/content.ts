/**
 * Food and exercise content: the shape of every item in the database.
 * The same schemas check seed data, admin edits and API responses.
 */
import { z } from "zod";

/** "vegetarian" includes dairy but no eggs; "eggetarian" adds eggs; "non_vegetarian" eats everything. */
export const DIET_TYPES = ["non_vegetarian", "eggetarian", "vegetarian"] as const;

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export const FOOD_CATEGORIES = [
  "bread", "rice", "lentils", "vegetables", "meat", "fish", "eggs", "dairy", "drinks", "fruit", "snacks", "breakfast", "salad", "soup",
] as const;

/** Local portion words people actually use, so "1 katori daal" means something. */
export const PORTION_UNITS = ["piece", "roti", "katori", "plate", "bowl", "glass", "cup", "slice", "handful", "tbsp", "gram"] as const;

export const nutrientsSchema = z.object({
  kcal: z.number().min(0).max(900),
  proteinG: z.number().min(0).max(100),
  carbsG: z.number().min(0).max(100),
  fatG: z.number().min(0).max(100),
  fiberG: z.number().min(0).max(100),
});

export const portionSchema = z.object({
  unit: z.enum(PORTION_UNITS),
  /** What the user sees, such as "1 medium roti". */
  label: z.string().trim().min(1).max(60),
  grams: z.number().positive().max(2000),
});

const slugField = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase words joined by hyphens");

export const foodSchema = z
  .object({
    slug: slugField,
    name: z.string().trim().min(1).max(80),
    /** How people write it in Roman Urdu, used later for text logging ("2 roti aur daal"). */
    nameRoman: z.string().trim().max(80).optional(),
    category: z.enum(FOOD_CATEGORIES),
    /**
     * The most restrictive diet this food suits. "vegetarian" includes dairy but no eggs,
     * "eggetarian" adds eggs, "non_vegetarian" contains meat or fish.
     */
    dietCategory: z.enum(DIET_TYPES),
    mealSlots: z.array(z.enum(MEAL_SLOTS)).min(1),
    per100g: nutrientsSchema,
    portions: z.array(portionSchema).min(1),
    /** Another food this is a version of, such as beef biryani of chicken biryani. */
    variantOf: slugField.optional(),
    /** Occasional foods (fried, very sweet). The planner uses them rarely. */
    treat: z.boolean(),
    source: z.object({ name: z.string().min(1), note: z.string().optional() }),
    /** Set to true only after a person checks the values against a trusted source. */
    verified: z.boolean(),
  })
  .superRefine((f, ctx) => {
    // Energy from macros (4/4/9 kcal per gram) should roughly match the stated calories.
    const { kcal, proteinG, carbsG, fatG } = f.per100g;
    const fromMacros = proteinG * 4 + carbsG * 4 + fatG * 9;
    if (Math.abs(fromMacros - kcal) > Math.max(kcal * 0.15, 25)) {
      ctx.addIssue({ code: "custom", path: ["per100g", "kcal"], message: `Calories (${kcal}) do not match the macros (${Math.round(fromMacros)} kcal)` });
    }
  });

export const EXERCISE_TYPES = ["strength", "cardio", "mobility"] as const;
export const EXERCISE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const EQUIPMENT = ["none", "chair", "wall", "step", "resistance_band", "water_bottles"] as const;
export const MUSCLE_GROUPS = ["legs", "glutes", "chest", "back", "shoulders", "arms", "core", "full_body"] as const;

/**
 * What an exercise puts stress on. Safety rules block exercises by these tags,
 * so every exercise must be tagged honestly and conservatively.
 */
export const EXERCISE_LOADS = [
  "deep_knee_bend",
  "jumping",
  "spine_bending",
  "spine_twisting",
  "spine_loading",
  "overhead",
  "shoulder_weight_bearing",
  "breath_holding",
  "high_intensity",
] as const;

export const LOAD_LABEL: Record<(typeof EXERCISE_LOADS)[number], string> = {
  deep_knee_bend: "deep knee bending",
  jumping: "jumping and landing",
  spine_bending: "bending the spine forward",
  spine_twisting: "twisting the spine",
  spine_loading: "arching or loading the lower back",
  overhead: "lifting arms overhead",
  shoulder_weight_bearing: "putting body weight on the shoulders",
  breath_holding: "long holds that tempt you to hold your breath",
  high_intensity: "very hard effort that raises blood pressure quickly",
};

export const exerciseSchema = z
  .object({
    slug: slugField,
    name: z.string().trim().min(1).max(80),
    type: z.enum(EXERCISE_TYPES),
    level: z.enum(EXERCISE_LEVELS),
    equipment: z.enum(EQUIPMENT),
    muscleGroups: z.array(z.enum(MUSCLE_GROUPS)).min(1),
    loads: z.array(z.enum(EXERCISE_LOADS)),
    /** Default amount for one set: either repetitions or seconds. */
    sets: z.number().int().min(1).max(6),
    reps: z.number().int().min(1).max(50).optional(),
    seconds: z.number().int().min(5).max(1800).optional(),
    /** Metabolic equivalent, for rough calorie estimates. */
    met: z.number().min(1).max(15),
    steps: z.array(z.string().trim().min(1)).min(2).max(5),
  })
  .refine((e) => (e.reps === undefined) !== (e.seconds === undefined), {
    message: "Give either reps or seconds, not both",
    path: ["reps"],
  });

export type MealSlot = (typeof MEAL_SLOTS)[number];
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
export type PortionUnit = (typeof PORTION_UNITS)[number];
export type Nutrients = z.infer<typeof nutrientsSchema>;
export type Portion = z.infer<typeof portionSchema>;
export type Food = z.infer<typeof foodSchema>;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type ExerciseLoad = (typeof EXERCISE_LOADS)[number];
export type Exercise = z.infer<typeof exerciseSchema>;
