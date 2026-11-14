/**
 * Checks the starter content: valid shapes, enough choice for the planner, and safety tags that work.
 * The last block seeds a throwaway in-memory MongoDB.
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isExerciseSafe, safeExercises } from "@wellpath/engine";
import { CONDITIONS, DIET_TYPES, EXERCISE_LEVELS, exerciseSchema, foodSchema, type Condition, type DietType } from "@wellpath/shared";
import { ExerciseModel } from "../src/models/Exercise.js";
import { FoodModel } from "../src/models/Food.js";
import { SEED_EXERCISES } from "../src/seed/exercises.js";
import { SEED_FOODS } from "../src/seed/foods.js";
import { seedContent } from "../src/seed/index.js";

/** Which food diet categories each user diet may eat. */
const ALLOWED: Record<DietType, DietType[]> = {
  vegetarian: ["vegetarian"],
  eggetarian: ["vegetarian", "eggetarian"],
  non_vegetarian: ["vegetarian", "eggetarian", "non_vegetarian"],
};

describe("seed foods", () => {
  it.each(SEED_FOODS.map((f) => [f.slug, f] as const))("%s is valid", (_slug, food) => {
    const result = foodSchema.safeParse(food);
    expect(result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
  });

  it("has unique slugs, and every variant points at a real food", () => {
    const slugs = SEED_FOODS.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const f of SEED_FOODS) if (f.variantOf) expect(slugs).toContain(f.variantOf);
  });

  it("starts every food as unverified, with a source", () => {
    for (const f of SEED_FOODS) {
      expect(f.verified).toBe(false);
      expect(f.source.name.length).toBeGreaterThan(0);
    }
  });

  it.each(DIET_TYPES)("gives a %s diet at least 3 non-treat choices for every meal", (diet) => {
    for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) {
      const choices = SEED_FOODS.filter((f) => f.mealSlots.includes(slot) && !f.treat && ALLOWED[diet].includes(f.dietCategory));
      expect(choices.length, `${diet} ${slot}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("seed exercises", () => {
  it.each(SEED_EXERCISES.map((e) => [e.slug, e] as const))("%s is valid", (_slug, exercise) => {
    const result = exerciseSchema.safeParse(exercise);
    expect(result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
  });

  it("has unique slugs", () => {
    const slugs = SEED_EXERCISES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // The planner must always be able to build a beginner workout, even for someone with every condition.
  const combos: Condition[][] = [[], ...CONDITIONS.map((c) => [c]), [...CONDITIONS]];
  it.each(combos.map((c) => [c.join(" + ") || "no conditions", c] as const))("leaves enough beginner exercises for %s", (_label, conditions) => {
    const beginner = safeExercises(SEED_EXERCISES.filter((e) => e.level === "beginner"), conditions);
    expect(beginner.filter((e) => e.type === "strength").length).toBeGreaterThanOrEqual(4);
    expect(beginner.filter((e) => e.type === "cardio").length).toBeGreaterThanOrEqual(2);
    expect(beginner.filter((e) => e.type === "mobility").length).toBeGreaterThanOrEqual(2);
  });

  it("has exercises at every level", () => {
    for (const level of EXERCISE_LEVELS) expect(SEED_EXERCISES.some((e) => e.level === level)).toBe(true);
  });
});

describe("safety rules on real exercises", () => {
  const bySlug = (slug: string) => {
    const e = SEED_EXERCISES.find((x) => x.slug === slug);
    if (!e) throw new Error(`No exercise ${slug}`);
    return e;
  };

  it.each([
    ["knee_pain", ["bodyweight-squat", "reverse-lunge", "jump-squat", "burpee", "jumping-jacks", "child-pose"]],
    ["lower_back_pain", ["crunch", "russian-twist", "superman", "seated-spinal-twist", "jumping-jacks"]],
    ["shoulder_injury", ["push-up", "knee-push-up", "pike-push-up", "chair-dip", "plank", "bottle-shoulder-press"]],
    ["high_blood_pressure", ["plank", "wall-sit", "burpee", "mountain-climber", "jumping-jacks"]],
  ] as const)("%s blocks the exercises that stress it", (condition, slugs) => {
    for (const slug of slugs) expect(isExerciseSafe(bySlug(slug), [condition]), slug).toBe(false);
  });

  it.each([
    ["knee_pain", ["chair-sit-to-stand", "glute-bridge", "low-step-up", "brisk-walk"]],
    ["lower_back_pain", ["bird-dog", "dead-bug", "glute-bridge", "cat-cow"]],
    ["shoulder_injury", ["wall-push-up", "band-row", "bottle-bicep-curl", "glute-bridge"]],
    ["high_blood_pressure", ["brisk-walk", "march-in-place", "glute-bridge", "bird-dog"]],
  ] as const)("%s still allows gentle alternatives", (condition, slugs) => {
    for (const slug of slugs) expect(isExerciseSafe(bySlug(slug), [condition]), slug).toBe(true);
  });
});

describe("seedContent", () => {
  let db: MongoMemoryServer;

  beforeAll(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri());
    await Promise.all([FoodModel.init(), ExerciseModel.init()]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await db.stop();
  });

  it("adds everything the first time and nothing the second time", async () => {
    const first = await seedContent();
    expect(first.foods.added).toBe(SEED_FOODS.length);
    expect(first.exercises.added).toBe(SEED_EXERCISES.length);
    const second = await seedContent();
    expect(second.foods).toEqual({ added: 0, updated: 0, unchanged: SEED_FOODS.length });
    expect(await FoodModel.countDocuments()).toBe(SEED_FOODS.length);
  });

  it("keeps admin edits unless forced", async () => {
    await FoodModel.updateOne({ slug: "roti" }, { verified: true, "per100g.kcal": 280 });
    await seedContent();
    expect((await FoodModel.findOne({ slug: "roti" }))?.verified).toBe(true);

    const forced = await seedContent({ force: true });
    expect(forced.foods.updated).toBeGreaterThanOrEqual(1);
    const roti = await FoodModel.findOne({ slug: "roti" });
    expect(roti?.verified).toBe(false);
    expect(roti?.per100g?.kcal).toBe(297);
  });
});
