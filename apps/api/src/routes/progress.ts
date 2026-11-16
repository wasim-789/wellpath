/**
 * /api/v1/progress: ticking off the plan, day by day. Every route needs a signed-in user.
 *   GET  /        the week's progress: each day, the week so far, and the streak (?week, today=YYYY-MM-DD)
 *   PUT  /sets    sets done for one exercise ({ week, today, day, slug, sets }), 0 to clear
 *   PUT  /meals   a meal eaten or not ({ week, today, day, slot, eaten })
 *
 * `today` is the user's own date, so days start at their midnight. Days that have not come yet,
 * and weeks that are over, cannot be changed. Both PUTs answer with the updated progress.
 */
import { Router } from "express";
import { z } from "zod";
import { MEAL_SLOTS } from "@wellpath/shared";
import { requireAuth } from "../middleware/requireAuth.js";
import { setMeal, setSets, userToday, weekProgress } from "../services/progress.js";
import { userWeek } from "./plan.js";

export const progressRouter = Router();
progressRouter.use(requireAuth);

const day = z.number().int().min(0).max(6);
const common = { week: z.string().optional(), today: z.string().optional(), day };
const setsBody = z.object({ ...common, slug: z.string().min(1).max(80), sets: z.number().int().min(0).max(10) });
const mealBody = z.object({ ...common, slot: z.enum(MEAL_SLOTS), eaten: z.boolean() });

progressRouter.get("/", async (req, res) => {
  const today = userToday(req.query.today);
  const { saved } = await userWeek(req, req.query.week);
  res.json(await weekProgress(saved.userId, saved, today));
});

progressRouter.put("/sets", async (req, res) => {
  const body = setsBody.parse(req.body);
  const today = userToday(body.today);
  const { saved } = await userWeek(req, body.week, { editing: true });
  await setSets(saved.userId, saved, body.day, body.slug, body.sets, today);
  res.json(await weekProgress(saved.userId, saved, today));
});

progressRouter.put("/meals", async (req, res) => {
  const body = mealBody.parse(req.body);
  const today = userToday(body.today);
  const { saved } = await userWeek(req, body.week, { editing: true });
  await setMeal(saved.userId, saved, body.day, body.slot, body.eaten, today);
  res.json(await weekProgress(saved.userId, saved, today));
});
