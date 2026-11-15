/**
 * Saved week plans: they stay the same all week, are rebuilt only when they must be,
 * and can be changed one exercise at a time or started over.
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MealPlan, PlannedExercise, WorkoutPlan } from "@wellpath/engine";
import { createApp } from "../src/app.js";
import { weekFromNow } from "../src/routes/plan.js";
import { ExerciseModel } from "../src/models/Exercise.js";
import { FoodModel } from "../src/models/Food.js";
import { Session } from "../src/models/Session.js";
import { User } from "../src/models/User.js";
import { WeekPlan } from "../src/models/WeekPlan.js";
import { seedContent } from "../src/seed/index.js";
import { isPastWeek } from "../src/services/weekPlan.js";

const app = createApp();
const PLAN = "/api/v1/plan";
const answers = {
  sex: "female", age: 32, heightCm: 160, weightKg: 70, activityLevel: "moderate", goal: "lose_weight",
  conditions: ["knee_pain"], pregnantOrBreastfeeding: false, dietType: "non_vegetarian", workoutMinutes: 30, healthDataConsent: true,
};
let db: MongoMemoryServer;

beforeAll(async () => {
  db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  await Promise.all([User.init(), Session.init(), FoodModel.init(), ExerciseModel.init(), WeekPlan.init()]);
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({}), FoodModel.deleteMany({}), ExerciseModel.deleteMany({}), WeekPlan.deleteMany({})]);
  await seedContent();
});
afterAll(async () => {
  await mongoose.disconnect();
  await db.stop();
});

async function ready() {
  const res = await request(app).post("/api/v1/auth/register").send({ name: "Hina", email: "hina@example.com", password: "long-enough-pw" });
  const auth = `Bearer ${res.body.accessToken}`;
  await request(app).put("/api/v1/profile").set("Authorization", auth).send(answers);
  return auth;
}

const get = (auth: string, path: string) => request(app).get(`${PLAN}${path}`).set("Authorization", auth);
const meals = async (auth: string) => (await get(auth, "/meals")).body.plan as MealPlan;
const workouts = async (auth: string) => (await get(auth, "/workouts")).body.plan as WorkoutPlan;
const all = (plan: WorkoutPlan) => plan.days.flatMap((d) => (d.session ? [...d.session.warmup, ...d.session.main, ...d.session.cooldown] : []));
const foodSlugs = (plan: MealPlan) => plan.days.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.slug)));

describe("a saved week", () => {
  it("is saved once and stays the same when an admin edit does not affect it", async () => {
    const auth = await ready();
    const before = await meals(auth);
    expect(await WeekPlan.countDocuments()).toBe(1);
    // New nutrition values for a planned food: the week already planned keeps what it showed.
    const used = foodSlugs(before)[0];
    await FoodModel.updateOne({ slug: used }, { $inc: { "per100g.kcal": 5, "per100g.carbsG": 1.25 } });
    expect(await meals(auth)).toEqual(before);
    expect(await WeekPlan.countDocuments()).toBe(1);
  });

  it("rebuilds the workouts when an exercise in them becomes unsafe, and keeps the meals", async () => {
    const auth = await ready();
    const [mealsBefore, before] = [await meals(auth), await workouts(auth)];
    const used = all(before).find((e) => e.type === "strength")!.slug;
    await ExerciseModel.updateOne({ slug: used }, { $set: { loads: ["deep_knee_bend"] } });
    expect(all(await workouts(auth)).map((e) => e.slug)).not.toContain(used);
    expect(await meals(auth)).toEqual(mealsBefore);
  });

  it("keeps a week that is over exactly as it was, and refuses to change it", async () => {
    const auth = await ready();
    const user = await User.findOne({ email: "hina@example.com" });
    const week = weekFromNow(-3);
    expect(isPastWeek(week)).toBe(true);
    const old = { days: [], reasons: [], marker: "planned back then" };
    await WeekPlan.create({ userId: user!._id, weekStart: week, profileKey: "older-answers", meals: old, workouts: old });

    expect((await get(auth, `/meals?week=${week}`)).body.plan).toEqual(old);
    const rebuild = await request(app).post(`${PLAN}/rebuild`).set("Authorization", auth).send({ week, part: "meals" });
    expect(rebuild.status).toBe(409);
  });
});

describe("making a new plan", () => {
  it("gives new meals and leaves the workouts alone, and the other way round", async () => {
    const auth = await ready();
    const [m0, w0] = [await meals(auth), await workouts(auth)];
    const res = await request(app).post(`${PLAN}/rebuild`).set("Authorization", auth).send({ part: "meals" });
    expect(res.status).toBe(200);
    expect(res.body.plan.days).not.toEqual(m0.days);
    expect(await meals(auth)).toEqual(res.body.plan);
    expect(await workouts(auth)).toEqual(w0);

    const again = await request(app).post(`${PLAN}/rebuild`).set("Authorization", auth).send({ part: "workouts" });
    expect(again.body.plan.days).not.toEqual(w0.days);
    expect(await meals(auth)).toEqual(res.body.plan);
    expect((await request(app).post(`${PLAN}/rebuild`).set("Authorization", auth).send({ part: "everything" })).status).toBe(400);
  });
});

describe("swapping an exercise", () => {
  async function setup() {
    const auth = await ready();
    const plan = await workouts(auth);
    const day = plan.days.find((d) => d.session?.focus === "strength")!.day;
    const target = plan.days[day].session!.main[0];
    const alt = await get(auth, `/workouts/alternatives?day=${day}&slug=${target.slug}`);
    expect(alt.status).toBe(200);
    return { auth, plan, day, target, options: alt.body.options as PlannedExercise[] };
  }
  const put = (auth: string, body: object) => request(app).put(`${PLAN}/workouts/swap`).set("Authorization", auth).send(body);

  it("swaps one exercise for a safe one, keeps it on reload, and can put it back", async () => {
    const { auth, plan, day, target, options } = await setup();
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect((await ExerciseModel.findOne({ slug: o.slug }))!.loads).not.toContain("deep_knee_bend");

    const res = await put(auth, { day, slug: target.slug, replacement: options[0].slug });
    expect(res.status).toBe(200);
    const swapped = res.body.plan.days[day].session.main[0] as PlannedExercise;
    expect(swapped.slug).toBe(options[0].slug);
    expect(swapped.swapped).toBe(true);
    expect(await workouts(auth)).toEqual(res.body.plan);

    const back = await request(app).delete(`${PLAN}/workouts/swap?day=${day}&slug=${swapped.slug}`).set("Authorization", auth);
    expect(back.status).toBe(200);
    expect(back.body.plan).toEqual(plan);
  });

  it("only saves an exercise the planner offered, for an exercise that is in the plan", async () => {
    const { auth, plan, day, target } = await setup();
    expect((await put(auth, { day, slug: target.slug, replacement: "bodyweight-squat" })).status).toBe(409); // deep knee bend
    expect((await put(auth, { day, slug: "not-in-plan", replacement: "glute-bridge" })).status).toBe(404);
    const rest = plan.days.find((d) => !d.session)!.day;
    expect((await get(auth, `/workouts/alternatives?day=${rest}&slug=${target.slug}`)).status).toBe(404);
    expect((await get(auth, `/workouts/alternatives?day=9&slug=${target.slug}`)).status).toBe(400);
    expect(await workouts(auth)).toEqual(plan);
  });
});
