/**
 * The workout planner with the real starter exercises, across many kinds of people,
 * and the GET /api/v1/plan/workouts endpoint against a throwaway in-memory MongoDB.
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HOME_EQUIPMENT, PREGNANCY_BLOCKS, isExerciseSafe, planWorkouts, type WorkoutPlan } from "@wellpath/engine";
import { ACTIVITY_LEVELS, CONDITIONS, GOALS, WORKOUT_MINUTES, type Condition } from "@wellpath/shared";
import { createApp } from "../src/app.js";
import { weekStart } from "../src/routes/plan.js";
import { ExerciseModel } from "../src/models/Exercise.js";
import { FoodModel } from "../src/models/Food.js";
import { Session } from "../src/models/Session.js";
import { User } from "../src/models/User.js";
import { seedContent } from "../src/seed/index.js";
import { SEED_EXERCISES } from "../src/seed/exercises.js";

const exerciseOf = (slug: string) => SEED_EXERCISES.find((e) => e.slug === slug)!;
const everyExercise = (plan: WorkoutPlan) =>
  plan.days.flatMap((d) => (d.session ? [...d.session.warmup, ...d.session.main, ...d.session.cooldown] : []));

describe("workout plans from the starter exercises", () => {
  const conditionSets: Condition[][] = [[], ...CONDITIONS.map((c) => [c]), ["knee_pain", "lower_back_pain"], [...CONDITIONS]];
  const cases = ACTIVITY_LEVELS.flatMap((activityLevel) =>
    WORKOUT_MINUTES.flatMap((workoutMinutes) => conditionSets.map((conditions) => [`${activityLevel}, ${workoutMinutes} min, ${conditions.join(" + ") || "no conditions"}`, activityLevel, workoutMinutes, conditions] as const)),
  );

  it.each(cases)("%s: safe, at home and within the time", (_label, activityLevel, workoutMinutes, conditions) => {
    const started = performance.now();
    const plan = planWorkouts({
      profile: { age: 35, weightKg: 75, activityLevel, goal: "general_fitness", conditions, workoutMinutes },
      exercises: SEED_EXERCISES,
      seed: "test|2026-11-16",
    });
    expect(performance.now() - started).toBeLessThan(200);
    expect(plan.daysPerWeek).toBeGreaterThanOrEqual(3);
    expect(plan.daysPerWeek).toBeLessThanOrEqual(5);

    for (const day of plan.days) {
      if (!day.session) continue;
      const all = [...day.session.warmup, ...day.session.main, ...day.session.cooldown];
      expect(all.reduce((t, e) => t + e.durationSeconds, 0)).toBeLessThanOrEqual(workoutMinutes * 60);
      expect(day.session.main.length, `day ${day.day}`).toBeGreaterThan(0);
      for (const e of all) {
        expect(isExerciseSafe(exerciseOf(e.slug), conditions), e.slug).toBe(true);
        expect(HOME_EQUIPMENT).toContain(e.equipment);
      }
    }
  });

  it.each(GOALS)("gives %s a varied week (at least 12 different main exercises)", (goal) => {
    const plan = planWorkouts({ profile: { age: 30, weightKg: 70, activityLevel: "moderate", goal, workoutMinutes: 30 }, exercises: SEED_EXERCISES, seed: "test|2026-11-16" });
    const main = new Set(plan.days.flatMap((d) => d.session?.main.map((e) => e.slug) ?? []));
    expect(main.size).toBeGreaterThanOrEqual(12);
  });

  it("keeps pregnancy and over-60s to beginner exercises with nothing risky", () => {
    for (const p of [{ age: 30, pregnantOrBreastfeeding: true }, { age: 68 }]) {
      const plan = planWorkouts({ profile: { weightKg: 70, activityLevel: "very_active", goal: "maintain", workoutMinutes: 45, ...p }, exercises: SEED_EXERCISES, seed: "test|2026-11-16" });
      for (const e of everyExercise(plan)) {
        expect(exerciseOf(e.slug).level, e.slug).toBe("beginner");
        if (p.pregnantOrBreastfeeding) expect(exerciseOf(e.slug).loads.some((l) => PREGNANCY_BLOCKS.includes(l)), e.slug).toBe(false);
      }
    }
  });
});

describe("GET /api/v1/plan/workouts", () => {
  const app = createApp();
  const WORKOUTS = "/api/v1/plan/workouts";
  const answers = {
    sex: "male", age: 40, heightCm: 175, weightKg: 82, activityLevel: "light", goal: "lose_weight",
    conditions: ["knee_pain"], pregnantOrBreastfeeding: false, dietType: "non_vegetarian", workoutMinutes: 30, healthDataConsent: true,
  };
  let db: MongoMemoryServer;

  beforeAll(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri());
    await Promise.all([User.init(), Session.init(), FoodModel.init(), ExerciseModel.init()]);
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Session.deleteMany({}), FoodModel.deleteMany({}), ExerciseModel.deleteMany({})]);
    await seedContent();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await db.stop();
  });

  async function ready() {
    const res = await request(app).post("/api/v1/auth/register").send({ name: "Omar", email: "omar@example.com", password: "long-enough-pw" });
    const auth = `Bearer ${res.body.accessToken}`;
    await request(app).put("/api/v1/profile").set("Authorization", auth).send(answers);
    return auth;
  }

  it("needs sign-in and a finished onboarding", async () => {
    expect((await request(app).get(WORKOUTS)).status).toBe(401);
    const res = await request(app).post("/api/v1/auth/register").send({ name: "Omar", email: "omar@example.com", password: "long-enough-pw" });
    expect((await request(app).get(WORKOUTS).set("Authorization", `Bearer ${res.body.accessToken}`)).status).toBe(409);
  });

  it("plans this week from the saved answers, the same on every request", async () => {
    const auth = await ready();
    const res = await request(app).get(WORKOUTS).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe(weekStart(new Date()));
    expect(res.body.plan.days).toHaveLength(7);
    expect(res.body.plan.daysPerWeek).toBe(4);
    expect(res.body.plan.level).toBe("beginner");
    expect(res.body.plan.reasons).toContainEqual({ code: "condition_exercises", params: { condition: "knee_pain" } });
    const slugs = everyExercise(res.body.plan).map((e) => e.slug);
    expect(slugs).not.toContain("bodyweight-squat"); // deep knee bend
    expect((await request(app).get(WORKOUTS).set("Authorization", auth)).body).toEqual(res.body);
    expect((await request(app).get(`${WORKOUTS}?week=2026-11-17`).set("Authorization", auth)).status).toBe(400);
  });

  it("uses admin edits straight away", async () => {
    const auth = await ready();
    await ExerciseModel.updateOne({ slug: "glute-bridge" }, { $set: { loads: ["deep_knee_bend"] } });
    const slugs = everyExercise((await request(app).get(WORKOUTS).set("Authorization", auth)).body.plan).map((e) => e.slug);
    expect(slugs).not.toContain("glute-bridge");
  });
});
