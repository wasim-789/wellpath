/**
 * /api/v1/progress: tracking the plan, day by day. Every route needs a signed-in user.
 *   GET    /          the week's progress: each day, the week so far, the streak, the water goal (?week, today=YYYY-MM-DD)
 *   PUT    /sets      sets done for one exercise ({ week, today, day, slug, sets }), 0 to clear
 *   PUT    /meals     a meal eaten or not ({ week, today, day, slot, eaten })
 *   PUT    /water     glasses of water drunk ({ week, today, day, glasses })
 *   PUT    /weight    a weigh-in ({ today, date?, weightKg }); date defaults to today
 *   DELETE /weight    remove a weigh-in (?today, date)
 *   GET    /history   day-by-day numbers for the charts (?today, days=7|30|90)
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
import { HISTORY_RANGES, history, removeWeight, setMeal, setSets, setWater, setWeight, userToday, weekProgress } from "../services/progress.js";
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
const historyQuery = z.object({ days: z.coerce.number().refine((n) => (HISTORY_RANGES as readonly number[]).includes(n), "days must be 7, 30 or 90").default(30) });

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
