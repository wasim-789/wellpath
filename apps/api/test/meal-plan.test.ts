/**
 * The meal planner with the real starter foods, across many kinds of people,
 * and the GET /api/v1/plan/meals endpoint against a throwaway in-memory MongoDB.
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { calculateDailyTargets, dietAllows, isFoodAllowed, planMeals } from "@wellpath/engine";
import { CONDITIONS, DIET_TYPES, type Condition, type DietType, type Profile } from "@wellpath/shared";
import { createApp } from "../src/app.js";
import { weekFromNow, weekStart } from "../src/routes/plan.js";
import { FoodModel } from "../src/models/Food.js";
import { WeekPlan } from "../src/models/WeekPlan.js";
import { Session } from "../src/models/Session.js";
import { User } from "../src/models/User.js";
import { seedContent } from "../src/seed/index.js";
import { SEED_FOODS } from "../src/seed/foods.js";

const people: { label: string; profile: Profile }[] = [];
for (const [sex, age, heightCm, weightKg] of [["female", 22, 155, 48], ["female", 35, 162, 85], ["male", 28, 178, 72], ["male", 50, 170, 110], ["male", 19, 185, 70]] as const) {
  for (const goal of ["lose_weight", "maintain", "gain_weight"] as const) {
    people.push({ label: `${sex} ${age}y ${weightKg}kg ${goal}`, profile: { sex, age, heightCm, weightKg, activityLevel: "light", goal, conditions: [] } as Profile });
  }
}

describe("meal plans from the starter foods", () => {
  const cases = people.flatMap((p) => DIET_TYPES.map((dietType) => [`${p.label}, ${dietType}`, p.profile, dietType] as const));

  it.each(cases)("%s: full, on target and within the diet", (_label, profile, dietType: DietType) => {
    const targets = calculateDailyTargets(profile);
    const started = performance.now();
    const plan = planMeals({ targets, dietType, foods: SEED_FOODS, seed: "test|2026-11-16" });
    expect(performance.now() - started).toBeLessThan(1000);

    for (const day of plan.days) {
      expect(Math.abs(day.totals.kcal - targets.calories), `day ${day.day}: ${day.totals.kcal} vs ${targets.calories}`).toBeLessThanOrEqual(targets.calories * 0.1);
      for (const meal of day.meals) {
        expect(meal.items.length, `${meal.slot} on day ${day.day}`).toBeGreaterThan(0);
        for (const item of meal.items) {
          const food = SEED_FOODS.find((f) => f.slug === item.slug)!;
          expect(dietAllows(dietType, food), item.slug).toBe(true);
          expect(food.mealSlots).toContain(meal.slot);
        }
      }
    }
  });

  it.each(DIET_TYPES)("gives a %s at least 15 different foods a week (not counting roti, rice and drinks)", (dietType) => {
    const plan = planMeals({ targets: { calories: 1800, proteinG: 100 }, dietType, foods: SEED_FOODS, seed: "test|2026-11-16" });
    const foods = new Set(plan.days.flatMap((d) => d.meals.flatMap((m) => m.items.filter((i) => i.role !== "staple" && i.role !== "drink").map((i) => i.slug))));
    expect(foods.size).toBeGreaterThanOrEqual(15);
  });

  const conditionCases = people.flatMap((p) =>
    ([["diabetes"], ["high_blood_pressure"], ["diabetes", "high_blood_pressure"]] as Condition[][]).flatMap((conditions) =>
      DIET_TYPES.map((dietType) => [`${p.label}, ${dietType}, ${conditions.join(" + ")}`, p.profile, dietType, conditions] as const),
    ),
  );

  it.each(conditionCases)("%s: still full and on target, with no food the condition rules out", (_label, profile, dietType: DietType, conditions) => {
    const targets = calculateDailyTargets(profile);
    const plan = planMeals({ targets, dietType, conditions, foods: SEED_FOODS, seed: "test|2026-11-16" });
    for (const day of plan.days) {
      expect(Math.abs(day.totals.kcal - targets.calories), `day ${day.day}`).toBeLessThanOrEqual(targets.calories * 0.1);
      for (const meal of day.meals) {
        expect(meal.items.length, `${meal.slot} on day ${day.day}`).toBeGreaterThan(0);
        for (const item of meal.items) expect(isFoodAllowed(SEED_FOODS.find((f) => f.slug === item.slug)!, conditions), item.slug).toBe(true);
      }
    }
  });

  it.each([[["diabetes"]], [["high_blood_pressure"]], [[...CONDITIONS]]] as [Condition[]][])("never plans a treat for %j", (conditions) => {
    const plan = planMeals({ targets: { calories: 2400, proteinG: 120 }, dietType: "non_vegetarian", conditions, foods: SEED_FOODS, seed: "test|2026-11-16" });
    const treats = plan.days.flatMap((d) => d.meals.flatMap((m) => m.items)).filter((i) => SEED_FOODS.find((f) => f.slug === i.slug)!.treat);
    expect(treats).toEqual([]);
  });
});

describe("weekStart", () => {
  it.each([
    ["2026-11-16T10:00:00Z", "2026-11-16"], // Monday
    ["2026-11-22T23:59:00Z", "2026-11-16"], // Sunday
    ["2026-11-15T00:00:00Z", "2026-11-09"], // Sunday
    ["2027-01-01T12:00:00Z", "2026-12-28"], // across the new year
  ])("%s starts on %s", (date, monday) => expect(weekStart(new Date(date))).toBe(monday));
});

describe("GET /api/v1/plan/meals", () => {
  const app = createApp();
  const MEALS = "/api/v1/plan/meals";
  const answers = {
    sex: "female", age: 28, heightCm: 163, weightKg: 68, activityLevel: "light", goal: "lose_weight",
    conditions: ["diabetes"], pregnantOrBreastfeeding: false, dietType: "vegetarian", workoutMinutes: 30, healthDataConsent: true,
  };
  let db: MongoMemoryServer;

  beforeAll(async () => {
    db = await MongoMemoryServer.create();
    await mongoose.connect(db.getUri());
    await Promise.all([User.init(), Session.init(), FoodModel.init(), WeekPlan.init()]);
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Session.deleteMany({}), FoodModel.deleteMany({}), WeekPlan.deleteMany({})]);
    await seedContent();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await db.stop();
  });

  async function signUp(email = "sara@example.com") {
    const res = await request(app).post("/api/v1/auth/register").send({ name: "Sara", email, password: "long-enough-pw" });
    return `Bearer ${res.body.accessToken}`;
  }

  it("needs sign-in and a finished onboarding", async () => {
    expect((await request(app).get(MEALS)).status).toBe(401);
    const res = await request(app).get(MEALS).set("Authorization", await signUp());
    expect(res.status).toBe(409);
  });

  it("plans this week from the saved profile", async () => {
    const auth = await signUp();
    await request(app).put("/api/v1/profile").set("Authorization", auth).send(answers);
    const res = await request(app).get(MEALS).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe(weekStart(new Date()));
    expect(res.body.plan.days).toHaveLength(7);
    expect(res.body.plan.dietType).toBe("vegetarian");
    expect(res.body.plan.reasons.map((r: { code: string }) => r.code)).toContain("no_treat_condition");

    const profile = await request(app).get("/api/v1/profile").set("Authorization", auth);
    expect(res.body.plan.target.calories).toBe(profile.body.targets.calories);
  });

  it("returns the same plan on every request, and a different one for another week or person", async () => {
    const auth = await signUp();
    await request(app).put("/api/v1/profile").set("Authorization", auth).send(answers);
    const get = (query = "", who = auth) => request(app).get(`${MEALS}${query}`).set("Authorization", who);

    const [next, after] = [weekFromNow(1), weekFromNow(2)];
    const a = await get(`?week=${next}`);
    expect((await get(`?week=${next}`)).body).toEqual(a.body);
    expect((await get(`?week=${after}`)).body.plan.days).not.toEqual(a.body.plan.days);

    const other = await signUp("ali@example.com");
    await request(app).put("/api/v1/profile").set("Authorization", other).send(answers);
    expect((await get(`?week=${next}`, other)).body.plan.days).not.toEqual(a.body.plan.days);
  });

  it("refuses a week that is not a Monday date, or is too far away", async () => {
    const auth = await signUp();
    await request(app).put("/api/v1/profile").set("Authorization", auth).send(answers);
    const tuesday = new Date(Date.parse(weekFromNow(1)) + 86_400_000).toISOString().slice(0, 10);
    for (const week of [tuesday, "next", "2026-13-01", weekFromNow(5), weekFromNow(-53)]) {
      expect((await request(app).get(`${MEALS}?week=${week}`).set("Authorization", auth)).status, week).toBe(400);
    }
  });

  it("rebuilds a saved plan when a food in it is deleted", async () => {
    const auth = await signUp();
    await request(app).put("/api/v1/profile").set("Authorization", auth).send(answers);
    await FoodModel.deleteMany({ slug: { $in: ["daal-masoor", "daal-chana", "daal-mash"] } });
    const res = await request(app).get(MEALS).set("Authorization", auth);
    const slugs = res.body.plan.days.flatMap((d: { meals: { items: { slug: string }[] }[] }) => d.meals.flatMap((m) => m.items.map((i) => i.slug)));
    expect(slugs).not.toContain("daal-masoor");
  });

  describe("swapping a meal", () => {
    const WEEK = weekFromNow(1);
    const at = { day: 6, slot: "lunch" } as const;
    type Meal = { slot: string; swapped?: boolean; items: { slug: string; portionIndex: number; quantity: number }[] };
    const lunch = (body: { plan: { days: { meals: Meal[] }[] } }) => body.plan.days[at.day].meals.find((m) => m.slot === at.slot)!;
    const choice = (m: Meal) => m.items.map(({ slug, portionIndex, quantity }) => ({ slug, portionIndex, quantity }));

    async function ready() {
      const auth = await signUp();
      await request(app).put("/api/v1/profile").set("Authorization", auth).send(answers);
      const alt = await request(app).get(`${MEALS}/alternatives?week=${WEEK}&day=${at.day}&slot=${at.slot}`).set("Authorization", auth);
      expect(alt.status).toBe(200);
      return { auth, options: alt.body.options as Meal[] };
    }
    const put = (auth: string, items: unknown) => request(app).put(`${MEALS}/swap`).set("Authorization", auth).send({ week: WEEK, ...at, items });
    const get = (auth: string) => request(app).get(`${MEALS}?week=${WEEK}`).set("Authorization", auth);

    it("offers other plates, and keeps the one picked on every reload", async () => {
      const { auth, options } = await ready();
      const original = lunch((await get(auth)).body);
      expect(options.length).toBeGreaterThan(0);
      expect(options.map(choice)).not.toContainEqual(choice(original));

      const res = await put(auth, choice(options[0]));
      expect(res.status).toBe(200);
      expect(choice(lunch(res.body))).toEqual(choice(options[0]));
      expect(lunch(res.body).swapped).toBe(true);
      expect(lunch((await get(auth)).body)).toEqual(lunch(res.body));

      const back = await request(app).delete(`${MEALS}/swap?week=${WEEK}&day=${at.day}&slot=${at.slot}`).set("Authorization", auth);
      expect(back.status).toBe(200);
      expect(lunch(back.body)).toEqual(original);
      expect(lunch((await get(auth)).body)).toEqual(original);
    });

    it("only saves a plate the planner offered", async () => {
      const { auth } = await ready();
      // Chicken karahi is not vegetarian, so the planner would never offer it to this user.
      const res = await put(auth, [{ slug: "chicken-karahi", portionIndex: 0, quantity: 1 }, { slug: "roti", portionIndex: 0, quantity: 2 }]);
      expect(res.status).toBe(409);
      expect(lunch((await get(auth)).body).swapped).toBeUndefined();
    });

    it("refuses a bad day, meal or item list", async () => {
      const { auth, options } = await ready();
      for (const q of ["day=7&slot=lunch", "day=1&slot=brunch", "slot=lunch"]) {
        expect((await request(app).get(`${MEALS}/alternatives?week=${WEEK}&${q}`).set("Authorization", auth)).status, q).toBe(400);
      }
      expect((await put(auth, [])).status).toBe(400);
      expect((await request(app).put(`${MEALS}/swap`).set("Authorization", auth).send({ week: WEEK, day: 9, slot: "lunch", items: choice(options[0]) })).status).toBe(400);
    });

    it("starts over when the answers change, and is deleted with the account", async () => {
      const { auth, options } = await ready();
      await put(auth, choice(options[0]));
      await request(app).put("/api/v1/profile").set("Authorization", auth).send({ ...answers, weightKg: 66 });
      expect(lunch((await get(auth)).body).swapped).toBeUndefined();
      expect(await WeekPlan.countDocuments()).toBe(1);
      expect((await request(app).delete("/api/v1/auth/account").set("Authorization", auth).send({ password: "long-enough-pw" })).status).toBe(204);
      expect(await WeekPlan.countDocuments()).toBe(0);
    });
  });
});
