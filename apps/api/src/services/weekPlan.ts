/**
 * Loading a user's saved week plan, and building or rebuilding it when needed.
 *
 * A plan is built the first time a week is opened and then saved, so it stays the same all week.
 * It is rebuilt when:
 *   - the user's answers changed (the profile key no longer matches), for this week or later,
 *   - a food or exercise in it was deleted, or now breaks their diet or safety rules,
 *   - the user asks for new meals or workouts (the version goes up, which changes the seed).
 * Weeks that are over are never rebuilt: they are the record of what was planned.
 */
import { createHash } from "node:crypto";
import type { Types } from "mongoose";
import {
  calculateDailyTargets,
  mealPlanFits,
  planMeals,
  planWorkouts,
  workoutPlanFits,
  type MealPlan,
  type MealPlanInput,
  type WorkoutPlan,
  type WorkoutPlanInput,
} from "@wellpath/engine";
import type { Exercise, Food, SavedProfile } from "@wellpath/shared";
import { ExerciseModel } from "../models/Exercise.js";
import { FoodModel } from "../models/Food.js";
import { WeekPlan } from "../models/WeekPlan.js";

/** Bump when the planners change in a way that should rebuild saved plans for this week and later. */
export const PLANNER_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SavedWeek = {
  userId: Types.ObjectId;
  weekStart: string;
  profileKey: string;
  mealsVersion: number;
  workoutsVersion: number;
  meals: MealPlan;
  workouts: WorkoutPlan;
};

/** What the plan depends on, as a short fingerprint. Consent dates and names are left out. */
export function profileKey(p: SavedProfile): string {
  const relevant = {
    v: PLANNER_VERSION,
    sex: p.sex, age: p.age, heightCm: p.heightCm, weightKg: p.weightKg, activityLevel: p.activityLevel, goal: p.goal,
    conditions: [...p.conditions].sort(), pregnant: p.pregnantOrBreastfeeding, dietType: p.dietType, workoutMinutes: p.workoutMinutes,
  };
  return createHash("sha256").update(JSON.stringify(relevant)).digest("hex").slice(0, 16);
}

/**
 * True once a week is well over. The extra day allows for time zones: a user behind UTC may still be
 * on Sunday of a week that has already ended in UTC.
 */
export const isPastWeek = (weekStart: string, now = Date.now()) => Date.parse(`${weekStart}T00:00:00Z`) + 8 * DAY_MS < now;

/** The seed for one part of the plan. Version 0 keeps the original seed. */
const seedFor = (userId: string, week: string, version: number) => (version ? `${userId}|${week}|v${version}` : `${userId}|${week}`);

/** Everything the planners need for this user and week. */
export async function plannerInputs(userId: string, profile: SavedProfile, week: string) {
  const [foods, exercises] = await Promise.all([
    FoodModel.find({}, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }).lean<Food[]>(),
    ExerciseModel.find({}, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }).lean<Exercise[]>(),
  ]);
  const targets = calculateDailyTargets(profile);
  const meals = (version: number): MealPlanInput => ({
    targets: { calories: targets.calories, proteinG: targets.proteinG },
    dietType: profile.dietType,
    conditions: profile.conditions,
    foods,
    seed: seedFor(userId, week, version),
  });
  const workouts = (version: number): WorkoutPlanInput => ({ profile, exercises, seed: seedFor(userId, week, version) });
  return { meals, workouts };
}

export type Inputs = Awaited<ReturnType<typeof plannerInputs>>;

/** The saved plan for this week, built, refreshed or rebuilt as needed. Saves any change. */
export async function loadWeek(userId: Types.ObjectId, profile: SavedProfile, week: string): Promise<{ saved: SavedWeek; inputs: Inputs }> {
  const inputs = await plannerInputs(userId.toString(), profile, week);
  const key = profileKey(profile);
  const doc = await WeekPlan.findOne({ userId, weekStart: week }).lean<SavedWeek>();

  if (doc && (doc.profileKey === key || isPastWeek(week))) {
    if (isPastWeek(week)) return { saved: doc, inputs };
    // Still safe with today's food and exercise library? Rebuild only the part that is not.
    const mealsOk = mealPlanFits(doc.meals, inputs.meals(doc.mealsVersion));
    const workoutsOk = workoutPlanFits(doc.workouts, profile, inputs.workouts(doc.workoutsVersion).exercises);
    if (mealsOk && workoutsOk) return { saved: doc, inputs };
    const saved: SavedWeek = {
      ...doc,
      meals: mealsOk ? doc.meals : planMeals(inputs.meals(doc.mealsVersion)),
      workouts: workoutsOk ? doc.workouts : planWorkouts(inputs.workouts(doc.workoutsVersion)),
    };
    return { saved: await saveWeek(saved), inputs };
  }

  // New week, or new answers: start fresh, and forget earlier "new plan" requests.
  const saved: SavedWeek = {
    userId,
    weekStart: week,
    profileKey: key,
    mealsVersion: 0,
    workoutsVersion: 0,
    meals: planMeals(inputs.meals(0)),
    workouts: planWorkouts(inputs.workouts(0)),
  };
  return { saved: await saveWeek(saved), inputs };
}

/** Writes the week. Two requests racing to create it write the same plan, so the upsert is safe. */
export async function saveWeek(week: SavedWeek): Promise<SavedWeek> {
  const { userId, weekStart, ...rest } = week;
  await WeekPlan.updateOne({ userId, weekStart }, { $set: rest }, { upsert: true });
  return week;
}
