/**
 * /api/v1/plan
 *   POST   /preview                targets from onboarding answers (no sign-in, used by the landing page calculator)
 *   GET    /meals                  this week's meal plan for the signed-in user (?week=YYYY-MM-DD, a Monday, for another week)
 *   GET    /meals/alternatives     other plates for one meal (?week, day=0-6, slot)
 *   PUT    /meals/swap             swap one meal for one of those alternatives
 *   DELETE /meals/swap             put one meal back to the original plan (?week, day, slot)
 *
 * The meal plan is rebuilt on each request. It is deterministic (seeded by user and week),
 * so the same week shows the same meals until the profile or the food library changes.
 * Swaps are the only thing stored, and they are cleared when the profile changes.
 */
import { type Request, Router } from "express";
import { z } from "zod";
import { calculateDailyTargets, mealAlternatives, mealChoice, planMeals, sameChoice, type MealSwap as Swap } from "@wellpath/engine";
import { type Food, MEAL_SLOTS, profileSchema } from "@wellpath/shared";
import { HttpError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { FoodModel } from "../models/Food.js";
import { MealSwap } from "../models/MealSwap.js";
import { User, toSavedProfile } from "../models/User.js";

export const planRouter = Router();

planRouter.post("/preview", (req, res) => {
  const profile = profileSchema.parse(req.body); // throws ZodError -> 400 via error handler
  res.json({ targets: calculateDailyTargets(profile) });
});

/** The Monday (UTC) of the week containing this date, as YYYY-MM-DD. */
export function weekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function requestedWeek(value: unknown): string {
  if (value === undefined) return weekStart(new Date());
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, "week must be a date like 2026-11-16");
  }
  const monday = weekStart(new Date(`${value}T00:00:00Z`));
  if (monday !== value) throw new HttpError(400, "week must be a Monday");
  return monday;
}

/** Which meal: day 0 is Monday. Query values arrive as text, so day is coerced. */
const mealRef = z.object({ day: z.coerce.number().int().min(0).max(6), slot: z.enum(MEAL_SLOTS) });

const swapBody = mealRef.extend({
  week: z.string().optional(),
  items: z
    .array(z.object({ slug: z.string().min(1).max(80), portionIndex: z.number().int().min(0).max(20), quantity: z.number().positive().max(10) }))
    .min(1)
    .max(6),
});

/** Everything the planner needs for this user and week, including their saved swaps. */
async function planInput(req: Request, weekValue: unknown) {
  const week = requestedWeek(weekValue);
  const user = await User.findById(req.auth!.userId);
  if (!user || user.status !== "active") throw new HttpError(401, "Not signed in");
  const profile = toSavedProfile(user);
  if (!profile) throw new HttpError(409, "Finish onboarding first, so we know what to plan for.");

  const targets = calculateDailyTargets(profile);
  const [foods, swaps] = await Promise.all([
    FoodModel.find({}, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }).lean<Food[]>(),
    MealSwap.find({ userId: user._id, weekStart: week }, { _id: 0, day: 1, slot: 1, items: 1 }).lean<Swap[]>(),
  ]);
  return {
    user,
    week,
    input: {
      targets: { calories: targets.calories, proteinG: targets.proteinG },
      dietType: profile.dietType,
      conditions: profile.conditions,
      foods,
      seed: `${user.id}|${week}`,
      swaps,
    },
  };
}

planRouter.get("/meals", requireAuth, async (req, res) => {
  const { week, input } = await planInput(req, req.query.week);
  res.json({ weekStart: week, plan: planMeals(input) });
});

planRouter.get("/meals/alternatives", requireAuth, async (req, res) => {
  const { day, slot } = mealRef.parse(req.query);
  const { week, input } = await planInput(req, req.query.week);
  res.json({ weekStart: week, day, slot, options: mealAlternatives({ ...input, day, slot }) });
});

planRouter.put("/meals/swap", requireAuth, async (req, res) => {
  const { day, slot, items, week: weekValue } = swapBody.parse(req.body);
  const { user, week, input } = await planInput(req, weekValue);
  // Only a plate the planner itself offered can be saved, so a swap always follows the diet and safety rules.
  const offered = mealAlternatives({ ...input, day, slot }).some((option) => sameChoice(mealChoice(option), items));
  if (!offered) throw new HttpError(409, "Those options have changed. Please pick again.");

  await MealSwap.updateOne({ userId: user._id, weekStart: week, day, slot }, { $set: { items } }, { upsert: true });
  const swaps = [...input.swaps.filter((s) => !(s.day === day && s.slot === slot)), { day, slot, items }];
  res.json({ weekStart: week, plan: planMeals({ ...input, swaps }) });
});

planRouter.delete("/meals/swap", requireAuth, async (req, res) => {
  const { day, slot } = mealRef.parse(req.query);
  const { user, week, input } = await planInput(req, req.query.week);
  await MealSwap.deleteOne({ userId: user._id, weekStart: week, day, slot });
  const swaps = input.swaps.filter((s) => !(s.day === day && s.slot === slot));
  res.json({ weekStart: week, plan: planMeals({ ...input, swaps }) });
});
