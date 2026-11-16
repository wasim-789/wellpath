/**
 * Daily progress: ticking off sets and meals, the week summary and the streak.
 * The clock is fixed to Saturday 21 November 2026 (10:00 UTC), so Monday to Saturday can be ticked and Sunday cannot.
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutPlan } from "@wellpath/engine";
import { createApp } from "../src/app.js";
import { DayLog } from "../src/models/DayLog.js";
import { ExerciseModel } from "../src/models/Exercise.js";
import { FoodModel } from "../src/models/Food.js";
import { Session } from "../src/models/Session.js";
import { User } from "../src/models/User.js";
import { WeekPlan } from "../src/models/WeekPlan.js";
import { seedContent } from "../src/seed/index.js";

const app = createApp();
const PASSWORD = "long-enough-pw";
const WEEK = "2026-11-16";
const TODAY = "2026-11-21"; // Saturday, day 5
const answers = {
  sex: "female", age: 32, heightCm: 160, weightKg: 70, activityLevel: "moderate", goal: "lose_weight",
  conditions: [], pregnantOrBreastfeeding: false, dietType: "non_vegetarian", workoutMinutes: 30, healthDataConsent: true,
};
let db: MongoMemoryServer;

beforeAll(async () => {
  db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  await Promise.all([User.init(), Session.init(), FoodModel.init(), ExerciseModel.init(), WeekPlan.init(), DayLog.init()]);
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
  await Promise.all([User.deleteMany({}), Session.deleteMany({}), FoodModel.deleteMany({}), ExerciseModel.deleteMany({}), WeekPlan.deleteMany({}), DayLog.deleteMany({})]);
  await seedContent();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await mongoose.disconnect();
  await db.stop();
});

async function ready() {
  const res = await request(app).post("/api/v1/auth/register").send({ name: "Hina", email: "hina@example.com", password: PASSWORD });
  const auth = `Bearer ${res.body.accessToken}`;
  await request(app).put("/api/v1/profile").set("Authorization", auth).send(answers);
  const plan = (await request(app).get(`/api/v1/plan/workouts?week=${WEEK}`).set("Authorization", auth)).body.plan as WorkoutPlan;
  return { auth, plan };
}

const progress = (auth: string) => request(app).get(`/api/v1/progress?week=${WEEK}&today=${TODAY}`).set("Authorization", auth);
const sets = (auth: string, body: object) => request(app).put("/api/v1/progress/sets").set("Authorization", auth).send({ week: WEEK, today: TODAY, ...body });
const meal = (auth: string, body: object) => request(app).put("/api/v1/progress/meals").set("Authorization", auth).send({ week: WEEK, today: TODAY, ...body });
const exercisesOf = (plan: WorkoutPlan, day: number) => {
  const s = plan.days[day].session!;
  return [...s.warmup, ...s.main, ...s.cooldown];
};

describe("progress", () => {
  it("needs a signed-in user", async () => {
    expect((await request(app).get("/api/v1/progress")).status).toBe(401);
  });

  it("starts empty, with the week's plan counted", async () => {
    const { auth, plan } = await ready();
    const res = await progress(auth);
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(7);
    expect(res.body.days[5]).toMatchObject({ date: TODAY, sets: {}, meals: [], active: false });
    expect(res.body.week).toEqual({ workoutsDone: 0, workoutsPlanned: plan.daysPerWeek, mealsEaten: 0, mealsPlanned: 28, activeDays: 0 });
    expect(res.body.streak).toEqual({ current: 0, best: 0 });
  });

  it("counts a workout as done once every exercise has all its sets ticked", async () => {
    const { auth, plan } = await ready();
    const day = plan.days.find((d) => d.session && d.day <= 5)!.day;
    const list = exercisesOf(plan, day);

    const first = await sets(auth, { day, slug: list[0].slug, sets: list[0].sets });
    expect(first.status).toBe(200);
    expect(first.body.days[day].workout).toEqual({ done: 1, total: list.length, complete: false });
    expect(first.body.days[day].active).toBe(true);

    for (const e of list) await sets(auth, { day, slug: e.slug, sets: e.sets });
    const all = await progress(auth);
    expect(all.body.days[day].workout.complete).toBe(true);
    expect(all.body.week.workoutsDone).toBe(1);

    // Unticking one set undoes "complete"; 0 clears the exercise entirely.
    expect((await sets(auth, { day, slug: list[0].slug, sets: list[0].sets - 1 })).body.days[day].workout.complete).toBe(false);
    const cleared = await sets(auth, { day, slug: list[0].slug, sets: 0 });
    expect(cleared.body.days[day].sets[list[0].slug]).toBeUndefined();
  });

  it("marks meals as eaten and keeps a streak of active days", async () => {
    const { auth } = await ready();
    for (const day of [3, 4, 5]) expect((await meal(auth, { day, slot: "breakfast", eaten: true })).status).toBe(200);
    await meal(auth, { day: 5, slot: "lunch", eaten: true });
    let res = await progress(auth);
    expect(res.body.days[5].meals.sort()).toEqual(["breakfast", "lunch"]);
    expect(res.body.days[5].eaten).toEqual({ done: 2, total: 4 });
    expect(res.body.week).toMatchObject({ mealsEaten: 4, activeDays: 3 });
    expect(res.body.streak).toEqual({ current: 3, best: 3 });

    // A gap breaks the run.
    res = await meal(auth, { day: 4, slot: "breakfast", eaten: false });
    expect(res.body.days[4].active).toBe(false);
    expect(res.body.streak).toEqual({ current: 1, best: 1 });

    // Nothing done today yet: the run up to yesterday still counts.
    await meal(auth, { day: 5, slot: "breakfast", eaten: false });
    await meal(auth, { day: 5, slot: "lunch", eaten: false });
    await meal(auth, { day: 4, slot: "breakfast", eaten: true });
    expect((await progress(auth)).body.streak).toEqual({ current: 2, best: 2 });
  });

  it("refuses days still to come, things not in the plan, too many sets, a moved date and finished weeks", async () => {
    const { auth, plan } = await ready();
    expect((await meal(auth, { day: 6, slot: "dinner", eaten: true })).status).toBe(409); // Sunday
    const day = plan.days.find((d) => d.session && d.day <= 5)!.day;
    const e = exercisesOf(plan, day)[0];
    expect((await sets(auth, { day, slug: "not-in-plan", sets: 1 })).status).toBe(404);
    expect((await sets(auth, { day, slug: e.slug, sets: e.sets + 1 })).status).toBe(400);
    const rest = plan.days.find((d) => !d.session && d.day <= 5);
    if (rest) expect((await sets(auth, { day: rest.day, slug: e.slug, sets: 1 })).status).toBe(404);
    expect((await sets(auth, { day, slug: e.slug, sets: 1, today: "2026-11-23" })).status).toBe(400); // "today" moved ahead
    expect((await meal(auth, { week: "2026-11-02", day: 0, slot: "lunch", eaten: true })).status).toBe(409); // over
    expect(await DayLog.countDocuments()).toBe(0);
  });

  it("logs water against a goal from body weight, and counts it as activity", async () => {
    const { auth } = await ready();
    const start = await progress(auth);
    expect(start.body.water).toMatchObject({ glasses: 10, ml: 2500 }); // 70 kg × 35 ml ≈ 10 glasses
    const water = (body: object) => request(app).put("/api/v1/progress/water").set("Authorization", auth).send({ week: WEEK, today: TODAY, ...body });
    const res = await water({ day: 5, glasses: 6 });
    expect(res.status).toBe(200);
    expect(res.body.days[5]).toMatchObject({ water: 6, active: true });
    expect(res.body.streak.current).toBe(1);
    expect((await water({ day: 6, glasses: 1 })).status).toBe(409); // Sunday has not come yet
    expect((await water({ day: 5, glasses: 31 })).status).toBe(400);
  });

  it("saves weigh-ins (today or earlier), uses the latest for the water goal, and removes them", async () => {
    const { auth } = await ready();
    const weight = (body: object) => request(app).put("/api/v1/progress/weight").set("Authorization", auth).send({ today: TODAY, ...body });
    expect((await weight({ weightKg: 69.46 })).status).toBe(204);
    expect((await weight({ date: "2026-11-18", weightKg: 70.2 })).status).toBe(204);
    expect((await weight({ date: "2026-11-22", weightKg: 69 })).status).toBe(409); // tomorrow
    expect((await weight({ date: "2026-07-01", weightKg: 69 })).status).toBe(400); // too long ago
    expect((await weight({ weightKg: 12 })).status).toBe(400);

    let res = await progress(auth);
    expect(res.body.lastWeight).toEqual({ date: TODAY, weightKg: 69.5 }); // rounded to 0.1 kg
    expect(res.body.days[2].weightKg).toBe(70.2);
    expect((await weight({ weightKg: 40 })).status).toBe(204);
    expect((await progress(auth)).body.water.glasses).toBe(6); // 40 kg → the 6-glass minimum

    const del = await request(app).delete(`/api/v1/progress/weight?today=${TODAY}&date=${TODAY}`).set("Authorization", auth);
    expect(del.status).toBe(204);
    res = await progress(auth);
    expect(res.body.lastWeight).toEqual({ date: "2026-11-18", weightKg: 70.2 });
    expect(res.body.days[5].active).toBe(false);
    expect((await request(app).delete(`/api/v1/progress/weight?today=${TODAY}&date=${TODAY}`).set("Authorization", auth)).status).toBe(404);
  });

  it("gives day-by-day history for the charts, with a 7-day weight trend", async () => {
    const { auth, plan } = await ready();
    const weight = (date: string, weightKg: number) => request(app).put("/api/v1/progress/weight").set("Authorization", auth).send({ today: TODAY, date, weightKg });
    await weight("2026-11-10", 72); // before the 7-day range, but inside the trend's look-back
    await weight("2026-11-16", 71);
    await weight("2026-11-21", 70);
    await meal(auth, { day: 5, slot: "breakfast", eaten: true });
    await request(app).put("/api/v1/progress/water").set("Authorization", auth).send({ week: WEEK, today: TODAY, day: 4, glasses: 8 });

    const res = await request(app).get(`/api/v1/progress/history?today=${TODAY}&days=7`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: "2026-11-15", to: TODAY });
    expect(res.body.days).toHaveLength(7);
    const byDate = Object.fromEntries(res.body.days.map((d: { date: string }) => [d.date, d]));
    expect(byDate["2026-11-15"]).toMatchObject({ weightKg: null, meals: 0, workout: null }); // last week, never opened
    expect(byDate["2026-11-16"].weightKg).toBe(71);
    expect(byDate["2026-11-20"].water).toBe(8);
    expect(byDate[TODAY]).toMatchObject({ weightKg: 70, meals: 1 });
    expect(byDate[TODAY].workout === null).toBe(!plan.days[5].session);
    expect(res.body.trend).toEqual([{ date: "2026-11-16", trendKg: 71.5 }, { date: TODAY, trendKg: 70.5 }]);
    expect((await request(app).get(`/api/v1/progress/history?today=${TODAY}&days=12`).set("Authorization", auth)).status).toBe(400);
  });

  it("reads Roman Urdu text into foods without saving anything", async () => {
    const { auth } = await ready();
    const res = await request(app).post("/api/v1/progress/food/read").set("Authorization", auth).send({ text: "nashta: 2 roti aur ek katori daal, pizza, 2 glass pani" });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { slug: string; amount: string }) => [i.slug, i.amount])).toEqual([["roti", "2 medium roti"], ["daal-masoor", "1 katori"]]);
    expect(res.body).toMatchObject({ unknown: ["pizza"], slot: "breakfast", water: 2 });
    expect(await DayLog.countDocuments()).toBe(0);
    expect((await request(app).post("/api/v1/progress/food/read").set("Authorization", auth).send({ text: "  " })).status).toBe(400);
    const list = await request(app).get("/api/v1/progress/foods").set("Authorization", auth);
    expect(list.body.foods.find((f: { slug: string }) => f.slug === "roti")).toMatchObject({ nameRoman: "roti", portions: [{ unit: "roti", label: "1 medium roti", grams: 40 }, expect.anything()] });
  });

  it("logs foods to a meal with nutrients from the library, counts intake with ticked meals, and removes them", async () => {
    const { auth } = await ready();
    const food = (body: object) => request(app).post("/api/v1/progress/food").set("Authorization", auth).send({ week: WEEK, today: TODAY, ...body });
    // Made-up nutrients from the app are ignored: the server works them out.
    const res = await food({ day: 5, slot: "snack", items: [{ slug: "samosa", portionIndex: 0, quantity: 2, nutrients: { kcal: 1 } }, { slug: "chai", portionIndex: 0, quantity: 1 }] });
    expect(res.status).toBe(200);
    const day = res.body.days[5];
    expect(day.foods.map((f: { slug: string; amount: string; slot: string }) => [f.slot, f.slug, f.amount])).toEqual([["snack", "samosa", "2 samosas"], ["snack", "chai", "1 cup"]]);
    const samosa = await FoodModel.findOne({ slug: "samosa" }).lean();
    expect(day.foods[0].nutrients.kcal).toBe(Math.round((samosa!.per100g.kcal * samosa!.portions[0]!.grams * 2) / 100));
    const typed = day.foods.reduce((t: number, f: { nutrients: { kcal: number } }) => t + f.nutrients.kcal, 0);
    expect(day.intake.kcal).toBe(typed);
    expect(day.active).toBe(true);
    expect(res.body.targets.calories).toBeGreaterThan(1000);

    // Ticking a planned meal adds its calories to the intake.
    const ticked = await meal(auth, { day: 5, slot: "breakfast", eaten: true });
    const plan = (await request(app).get(`/api/v1/plan/meals?week=${WEEK}`).set("Authorization", auth)).body.plan;
    const breakfast = plan.days[5].meals.find((m: { slot: string }) => m.slot === "breakfast").totals.kcal;
    expect(ticked.body.days[5].intake.kcal).toBe(typed + breakfast);

    const del = await request(app).delete(`/api/v1/progress/food?week=${WEEK}&today=${TODAY}&day=5&id=${day.foods[0].id}`).set("Authorization", auth);
    expect(del.status).toBe(200);
    expect(del.body.days[5].foods.map((f: { slug: string }) => f.slug)).toEqual(["chai"]);
    expect((await request(app).delete(`/api/v1/progress/food?week=${WEEK}&today=${TODAY}&day=5&id=${day.foods[0].id}`).set("Authorization", auth)).status).toBe(404);

    const history = await request(app).get(`/api/v1/progress/history?today=${TODAY}&days=7`).set("Authorization", auth);
    expect(history.body.days.at(-1).kcal).toBe(del.body.days[5].intake.kcal);
    expect(history.body.targetKcal).toBe(res.body.targets.calories);
  });

  it("refuses unknown foods, missing portions, days still to come and too many items", async () => {
    const { auth } = await ready();
    const food = (body: object) => request(app).post("/api/v1/progress/food").set("Authorization", auth).send({ week: WEEK, today: TODAY, ...body });
    expect((await food({ day: 5, slot: "lunch", items: [{ slug: "pizza", portionIndex: 0, quantity: 1 }] })).status).toBe(404);
    expect((await food({ day: 5, slot: "lunch", items: [{ slug: "roti", portionIndex: 7, quantity: 1 }] })).status).toBe(400);
    expect((await food({ day: 6, slot: "lunch", items: [{ slug: "roti", portionIndex: 0, quantity: 1 }] })).status).toBe(409);
    expect((await food({ day: 5, slot: "lunch", items: [{ slug: "roti", portionIndex: 0, quantity: 0 }] })).status).toBe(400);
    expect((await food({ day: 5, slot: "lunch", items: Array(21).fill({ slug: "roti", portionIndex: 0, quantity: 1 }) })).status).toBe(400);
    expect(await DayLog.countDocuments()).toBe(0);
  });

  it("deletes the logs with the account", async () => {
    const { auth } = await ready();
    await meal(auth, { day: 5, slot: "dinner", eaten: true });
    expect(await DayLog.countDocuments()).toBe(1);
    const del = await request(app).delete("/api/v1/auth/account").set("Authorization", auth).send({ password: PASSWORD });
    expect(del.status).toBe(204);
    expect(await DayLog.countDocuments()).toBe(0);
  });
});
