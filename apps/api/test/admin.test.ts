/** Admin content routes and the audit log, against a throwaway in-memory MongoDB. */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { ExerciseModel } from "../src/models/Exercise.js";
import { FoodModel } from "../src/models/Food.js";
import { Session } from "../src/models/Session.js";
import { User } from "../src/models/User.js";
import { seedContent } from "../src/seed/index.js";
import { SEED_EXERCISES } from "../src/seed/exercises.js";
import { SEED_FOODS } from "../src/seed/foods.js";

const app = createApp();
const ADMIN = "/api/v1/admin";
const PASSWORD = "long-enough-pw";

let db: MongoMemoryServer;

beforeAll(async () => {
  db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  await Promise.all([User.init(), Session.init(), FoodModel.init(), ExerciseModel.init(), AuditLog.init()]);
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({}), FoodModel.deleteMany({}), ExerciseModel.deleteMany({}), AuditLog.deleteMany({})]);
  await seedContent();
});

afterAll(async () => {
  await mongoose.disconnect();
  await db.stop();
});

/** Registers an account. With admin, promotes it and signs in to the admin panel. Returns an Authorization header. */
async function signIn(email: string, { admin = false } = {}) {
  const reg = await request(app).post("/api/v1/auth/register").send({ name: "Test", email, password: PASSWORD });
  if (!admin) return `Bearer ${reg.body.accessToken}`;
  await User.updateOne({ email }, { role: "admin" });
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password: PASSWORD });
  return `Bearer ${res.body.accessToken}`;
}

const food = (overrides: Record<string, unknown> = {}) => ({
  ...SEED_FOODS.find((f) => f.slug === "roti")!,
  slug: "makai-roti",
  name: "Makai roti",
  ...overrides,
});

describe("admin access", () => {
  it("needs a signed-in admin", async () => {
    expect((await request(app).get(`${ADMIN}/foods`)).status).toBe(401);
    const user = await signIn("user@example.com");
    expect((await request(app).get(`${ADMIN}/foods`).set("Authorization", user)).status).toBe(403);
  });

  it("stops working as soon as admin access is removed, even with a valid token", async () => {
    const auth = await signIn("boss@example.com", { admin: true });
    expect((await request(app).get(`${ADMIN}/foods`).set("Authorization", auth)).status).toBe(200);
    await User.updateOne({ email: "boss@example.com" }, { role: "user" });
    expect((await request(app).get(`${ADMIN}/foods`).set("Authorization", auth)).status).toBe(403);
  });
});

describe("admin foods", () => {
  it("lists every food in name order", async () => {
    const res = await request(app).get(`${ADMIN}/foods`).set("Authorization", await signIn("a@example.com", { admin: true }));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(SEED_FOODS.length);
    const names = res.body.items.map((f: { name: string }) => f.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
    expect(res.body.items[0]).not.toHaveProperty("_id");
  });

  it("adds a valid food and records it", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const res = await request(app).post(`${ADMIN}/foods`).set("Authorization", auth).send(food());
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ slug: "makai-roti", name: "Makai roti", verified: false });
    expect(await AuditLog.findOne({ action: "Added food" })).toMatchObject({ target: "Makai roti", actorEmail: "a@example.com" });
  });

  it("refuses bad values, duplicate slugs and missing variants", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const post = (body: object) => request(app).post(`${ADMIN}/foods`).set("Authorization", auth).send(body);

    const bad = await post(food({ per100g: { kcal: 900, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 0 } }));
    expect(bad.status).toBe(400);
    expect(bad.body.details).toHaveProperty("per100g");
    expect((await post(food({ slug: "roti" }))).status).toBe(409);
    expect((await post(food({ variantOf: "no-such-food" }))).status).toBe(400);
    expect((await post(food({ variantOf: "makai-roti" }))).status).toBe(400);
  });

  it("edits a food, keeps its slug, and notes what changed", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const roti = SEED_FOODS.find((f) => f.slug === "roti")!;
    const put = (body: object) => request(app).put(`${ADMIN}/foods/roti`).set("Authorization", auth).send(body);

    const res = await put({ ...roti, nameRoman: "chapati", treat: true });
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ nameRoman: "chapati", treat: true });
    expect((await AuditLog.findOne({ action: "Edited food" }))?.detail).toBe("Changed nameRoman, treat");

    expect((await put({ ...roti, slug: "chapati" })).status).toBe(400);
    expect((await request(app).put(`${ADMIN}/foods/nope`).set("Authorization", auth).send({ ...roti, slug: "nope" })).status).toBe(404);
  });

  it("does not log an edit that changes nothing", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const roti = SEED_FOODS.find((f) => f.slug === "roti")!;
    expect((await request(app).put(`${ADMIN}/foods/roti`).set("Authorization", auth).send(roti)).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: "Edited food" })).toBe(0);
  });

  it("verifies a food once", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const verify = () => request(app).post(`${ADMIN}/foods/roti/verify`).set("Authorization", auth);
    expect((await verify()).body.item.verified).toBe(true);
    expect((await verify()).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: "Verified food" })).toBe(1);
    expect((await request(app).post(`${ADMIN}/foods/nope/verify`).set("Authorization", auth)).status).toBe(404);
  });

  it("will not delete a food that others are versions of", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const parent = SEED_FOODS.find((f) => SEED_FOODS.some((v) => v.variantOf === f.slug))!;
    const blocked = await request(app).delete(`${ADMIN}/foods/${parent.slug}`).set("Authorization", auth);
    expect(blocked.status).toBe(409);

    const del = await request(app).delete(`${ADMIN}/foods/roti`).set("Authorization", auth);
    expect(del.status).toBe(204);
    expect(await FoodModel.exists({ slug: "roti" })).toBeNull();
    expect(await AuditLog.findOne({ action: "Deleted food" })).toMatchObject({ target: "Roti (chapati)" });
  });
});

describe("admin exercises", () => {
  it("spells out removed safety tags in the audit log", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const squat = SEED_EXERCISES.find((e) => e.slug === "bodyweight-squat")!;
    const res = await request(app).put(`${ADMIN}/exercises/bodyweight-squat`).set("Authorization", auth).send({ ...squat, loads: [] });
    expect(res.status).toBe(200);
    expect((await AuditLog.findOne({ action: "Edited exercise" }))?.detail).toBe(`Changed loads; safety tags removed: ${squat.loads.join(", ")}`);
  });

  it("refuses an exercise with both reps and seconds", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const plank = SEED_EXERCISES.find((e) => e.slug === "plank")!;
    const res = await request(app).post(`${ADMIN}/exercises`).set("Authorization", auth).send({ ...plank, slug: "plank-2", reps: 10, seconds: 30 });
    expect(res.status).toBe(400);
  });
});

describe("admin safety rules", () => {
  it("shows each rule with the exercises it leaves out and who it applies to", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    await User.updateOne({ email: "a@example.com" }, { profile: { sex: "male", age: 30, heightCm: 175, weightKg: 80, activityLevel: "light", goal: "maintain", conditions: ["knee_pain"], dietType: "vegetarian", workoutMinutes: 30, consentedAt: new Date() } });
    const res = await request(app).get(`${ADMIN}/safety-rules`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.exerciseCount).toBe(SEED_EXERCISES.length);

    const knee = res.body.rules.find((r: { condition: string }) => r.condition === "knee_pain");
    expect(knee.blockedLoads).toEqual(["deep_knee_bend", "jumping"]);
    expect(knee.blockedExercises.map((e: { slug: string }) => e.slug)).toContain("bodyweight-squat");
    expect(knee.usersAffected).toBe(1);
    expect(knee.notice).toMatch(/Knee pain/);
    expect(knee.beginnerLeft.strength).toBeGreaterThanOrEqual(4);

    const diabetes = res.body.rules.find((r: { condition: string }) => r.condition === "diabetes");
    expect(diabetes.blockedExercises).toEqual([]);
  });
});

describe("audit log", () => {
  it("records admin sign-in and sign-out, newest first", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const login = await request(app).post("/api/v1/admin/auth/login").send({ email: "a@example.com", password: PASSWORD });
    const cookie = login.headers["set-cookie"];
    await request(app).post("/api/v1/admin/auth/logout").set("Cookie", cookie);

    const res = await request(app).get(`${ADMIN}/audit`).set("Authorization", auth);
    expect(res.body.entries.map((e: { action: string }) => e.action)).toEqual(["Signed out", "Signed in", "Signed in"]);
    expect(res.body.entries[0]).toMatchObject({ actor: "a@example.com", target: "Admin panel" });
    expect(res.body.next).toBeNull();
  });

  it("does not log app (non-admin) sign-ins", async () => {
    await signIn("user@example.com");
    await request(app).post("/api/v1/auth/login").send({ email: "user@example.com", password: PASSWORD });
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it("pages through older entries", async () => {
    const auth = await signIn("a@example.com", { admin: true });
    const admin = await User.findOne({ email: "a@example.com" });
    await AuditLog.insertMany(Array.from({ length: 60 }, (_, i) => ({ actorId: admin!._id, actorEmail: "a@example.com", action: "Test", target: `#${i}` })));

    const first = await request(app).get(`${ADMIN}/audit`).set("Authorization", auth);
    expect(first.body.entries).toHaveLength(50);
    const second = await request(app).get(`${ADMIN}/audit?before=${first.body.next}`).set("Authorization", auth);
    expect(second.body.entries).toHaveLength(11);
    expect(second.body.next).toBeNull();
    expect((await request(app).get(`${ADMIN}/audit?before=nope`).set("Authorization", auth)).status).toBe(400);
  });

  it("keeps an admin's entries but removes their email when they delete their account", async () => {
    await signIn("a@example.com", { admin: true });
    const other = await signIn("b@example.com", { admin: true });
    const appLogin = await request(app).post("/api/v1/auth/login").send({ email: "a@example.com", password: PASSWORD });
    const del = await request(app).delete("/api/v1/auth/account").set("Authorization", `Bearer ${appLogin.body.accessToken}`).send({ password: PASSWORD });
    expect(del.status).toBe(204);

    const res = await request(app).get(`${ADMIN}/audit`).set("Authorization", other);
    const actors = res.body.entries.map((e: { actor: string }) => e.actor);
    expect(actors).toContain("Deleted account");
    expect(actors).not.toContain("a@example.com");
  });
});
