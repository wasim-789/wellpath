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

  it("deletes the logs with the account", async () => {
    const { auth } = await ready();
    await meal(auth, { day: 5, slot: "dinner", eaten: true });
    expect(await DayLog.countDocuments()).toBe(1);
    const del = await request(app).delete("/api/v1/auth/account").set("Authorization", auth).send({ password: PASSWORD });
    expect(del.status).toBe(204);
    expect(await DayLog.countDocuments()).toBe(0);
  });
});
