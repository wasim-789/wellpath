/**
 * /api/v1/progress: tracking the plan, day by day. Every route needs a signed-in user.
 *   GET    /          the week's progress: each day, the week so far, the streak, the water goal (?week, today=YYYY-MM-DD)
 *   PUT    /sets      sets done for one exercise ({ week, today, day, slug, sets }), 0 to clear
 *   PUT    /meals     a meal eaten or not ({ week, today, day, slot, eaten })
 *   PUT    /water     glasses of water drunk ({ week, today, day, glasses })
 *   PUT    /weight    a weigh-in ({ today, date?, weightKg }); date defaults to today
 *   DELETE /weight    remove a weigh-in (?today, date)
 *   GET    /history   day-by-day numbers for the charts (?today, days=7|30|90)
 *   GET    /foods     the food library for the food picker (names, Roman Urdu names, portions)
 *   POST   /food/read what a piece of text says was eaten ({ text }), without saving anything
 *   POST   /food      add foods to one meal ({ week, today, day, slot, items: [{ slug, portionIndex, quantity }] })
 *   DELETE /food      remove one typed-in food (?week, today, day, id)
 *
 * `today` is the user's own date, so days start at their midnight. Days that have not come yet,
 * and weeks that are over, cannot be changed. The PUTs on a week answer with the updated week's progress.
 */
import { type Request, Router } from "express";
import { z } from "zod";
import { MEAL_SLOTS } from "@wellpath/shared";
import { HttpError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { User, toSavedProfile } from "../models/User.js";
import { readFoodText, type LogFood } from "@wellpath/engine";
import { FoodModel } from "../models/Food.js";
import {
  HISTORY_RANGES, history, logFoods, removeFood, removeWeight, setMeal, setSets, setWater, setWeight, userToday, weekProgress,
} from "../services/progress.js";
import { userWeek } from "./plan.js";

export const progressRouter = Router();
progressRouter.use(requireAuth);

const day = z.number().int().min(0).max(6);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must look like 2026-11-16").refine((v) => !Number.isNaN(Date.parse(v)), "Not a real date");
const common = { week: z.string().optional(), today: z.string().optional(), day };
const setsBody = z.object({ ...common, slug: z.string().min(1).max(80), sets: z.number().int().min(0).max(10) });
const mealBody = z.object({ ...common, slot: z.enum(MEAL_SLOTS), eaten: z.boolean() });
const waterBody = z.object({ ...common, glasses: z.number().int().min(0).max(30) });
const weightBody = z.object({ today: z.string().optional(), date: date.optional(), weightKg: z.number().min(25).max(300) });
const readBody = z.object({ text: z.string().trim().min(1, "Type what you ate").max(500) });
const foodBody = z.object({
  ...common,
  slot: z.enum(MEAL_SLOTS),
  items: z.array(z.object({ slug: z.string().min(1).max(80), portionIndex: z.number().int().min(0).max(20), quantity: z.number().min(0.25).max(20) })).min(1).max(20),
});
const foodRef = z.object({ day: z.coerce.number().int().min(0).max(6), id: z.string().uuid() });

/** The food library, with only what the text reader and the picker need. */
const library = () => FoodModel.find({}, { _id: 0, slug: 1, name: 1, nameRoman: 1, per100g: 1, portions: 1 }).sort({ name: 1 }).lean<LogFood[]>();

const historyQuery =z.object({ days: z.coerce.number().refine((n) => (HISTORY_RANGES as readonly number[]).includes(n), "days must be 7, 30 or 90").default(30) });

/** The signed-in user and their saved answers, for routes that are not about one week. */
async function profileOf(req: Request) {
  const user = await User.findById(req.auth!.userId);
  if (!user || user.status !== "active") throw new HttpError(401, "Not signed in");
  const profile = toSavedProfile(user);
  if (!profile) throw new HttpError(409, "Finish onboarding first, so we know what to plan for.");
  return { userId: user._id, profile };
}

progressRouter.get("/", async (req, res) => {
  const today = userToday(req.query.today);
  const { saved, profile } = await userWeek(req, req.query.week);
  res.json(await weekProgress(saved.userId, saved, today, profile));
});

progressRouter.put("/sets", async (req, res) => {
  const body = setsBody.parse(req.body);
  const today = userToday(body.today);
  const { saved, profile } = await userWeek(req, body.week, { editing: true });
  await setSets(saved.userId, saved, body.day, body.slug, body.sets, today);
  res.json(await weekProgress(saved.userId, saved, today, profile));
});

progressRouter.put("/meals", async (req, res) => {
  const body = mealBody.parse(req.body);
  const today = userToday(body.today);
  const { saved, profile } = await userWeek(req, body.week, { editing: true });
  await setMeal(saved.userId, saved, body.day, body.slot, body.eaten, today);
  res.json(await weekProgress(saved.userId, saved, today, profile));
});

progressRouter.put("/water", async (req, res) => {
  const body = waterBody.parse(req.body);
  const today = userToday(body.today);
  const { saved, profile } = await userWeek(req, body.week, { editing: true });
  await setWater(saved.userId, saved, body.day, body.glasses, today);
  res.json(await weekProgress(saved.userId, saved, today, profile));
});

progressRouter.put("/weight", async (req, res) => {
  const body = weightBody.parse(req.body);
  const today = userToday(body.today);
  const { userId } = await profileOf(req);
  await setWeight(userId, body.date ?? today, body.weightKg, today);
  res.status(204).end();
});

progressRouter.delete("/weight", async (req, res) => {
  const today = userToday(req.query.today);
  const day = date.parse(req.query.date);
  const { userId } = await profileOf(req);
  await removeWeight(userId, day, today);
  res.status(204).end();
});

progressRouter.get("/history", async (req, res) => {
  const today = userToday(req.query.today);
  const { days } = historyQuery.parse(req.query);
  const { userId, profile } = await profileOf(req);
  res.json(await history(userId, today, days, profile));
});

/* ---------- typed-in food ---------- */

progressRouter.get("/foods", async (_req, res) => {
  const foods = await library();
  // per100g lets the app show calories while the person edits; the server still works them out again on save.
  res.json({ foods: foods.map((f) => ({ slug: f.slug, name: f.name, nameRoman: f.nameRoman, per100g: f.per100g, portions: f.portions.map((p) => ({ unit: p.unit, label: p.label, grams: p.grams })) })) });
});

progressRouter.post("/food/read", async (req, res) => {
  const { text } = readBody.parse(req.body);
  res.json(readFoodText(text, await library()));
});

progressRouter.post("/food", async (req, res) => {
  const body = foodBody.parse(req.body);
  const today = userToday(body.today);
  const { saved, profile } = await userWeek(req, body.week, { editing: true });
  await logFoods(saved.userId, saved, body.day, body.slot, body.items, today, await library());
  res.json(await weekProgress(saved.userId, saved, today, profile));
});

progressRouter.delete("/food", async (req, res) => {
  const { day, id } = foodRef.parse(req.query);
  const today = userToday(req.query.today);
  const { saved, profile } = await userWeek(req, req.query.week, { editing: true });
  await removeFood(saved.userId, saved, day, id, today);
  res.json(await weekProgress(saved.userId, saved, today, profile));
});
