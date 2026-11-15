/**
 * /api/v1/plan
 *   POST   /preview                  targets from onboarding answers (no sign-in, used by the landing page calculator)
 *   GET    /meals                    this week's meal plan (?week=YYYY-MM-DD, a Monday, for another week)
 *   GET    /meals/alternatives       other plates for one meal (?week, day=0-6, slot)
 *   PUT    /meals/swap               swap one meal for one of those alternatives
 *   DELETE /meals/swap               put one meal back to the original plan (?week, day, slot)
 *   GET    /workouts                 this week's home workouts (?week like /meals)
 *   GET    /workouts/alternatives    other exercises for one exercise (?week, day, slug)
 *   PUT    /workouts/swap            swap one exercise for one of those alternatives
 *   DELETE /workouts/swap            put one exercise back (?week, day, slug of the exercise shown now)
 *   POST   /rebuild                  make new meals or new workouts for the week ({ week, part })
 *
 * Plans are saved per week (services/weekPlan.ts), so a week stays the same until the answers change,
 * the user asks for a new one, or something in it is deleted or becomes unsafe.
 */
import { type Request, Router } from "express";
import { z } from "zod";
import {
  calculateDailyTargets,
  exerciseAlternatives,
  mealAlternatives,
  mealChoice,
  planMeals,
  planWorkouts,
  replaceExercise,
  replaceMeal,
  restoreExercise,
  restoreMeal,
  sameChoice,
} from "@wellpath/engine";
import { MEAL_SLOTS, profileSchema } from "@wellpath/shared";
import { HttpError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { User, toSavedProfile } from "../models/User.js";
import { isPastWeek, loadWeek, saveWeek } from "../services/weekPlan.js";

export const planRouter = Router();

planRouter.post("/preview", (req, res) => {
  const profile = profileSchema.parse(req.body); // throws ZodError -> 400 via error handler
  res.json({ targets: calculateDailyTargets(profile) });
});

const DAY_MS = 24 * 60 * 60 * 1000;
/** Plans can be opened for past weeks up to a year back, and up to 4 weeks ahead. */
const WEEKS_BACK = 52;
const WEEKS_AHEAD = 4;

/** The Monday (UTC) of the week containing this date, as YYYY-MM-DD. */
export function weekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** The Monday `weeks` weeks from this one (negative for earlier). */
export const weekFromNow = (weeks: number, now = new Date()) => weekStart(new Date(Date.parse(weekStart(now)) + weeks * 7 * DAY_MS));

export function requestedWeek(value: unknown, now = new Date()): string {
  if (value === undefined) return weekStart(now);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, "week must be a date like 2026-11-16");
  }
  const monday = weekStart(new Date(`${value}T00:00:00Z`));
  if (monday !== value) throw new HttpError(400, "week must be a Monday");
  if (monday < weekFromNow(-WEEKS_BACK, now) || monday > weekFromNow(WEEKS_AHEAD, now)) {
    throw new HttpError(400, `Plans are available from ${WEEKS_BACK} weeks ago to ${WEEKS_AHEAD} weeks ahead`);
  }
  return monday;
}

/** Which day: 0 is Monday. Query values arrive as text, so day is coerced. */
const dayField = z.coerce.number().int().min(0).max(6);
const mealRef = z.object({ day: dayField, slot: z.enum(MEAL_SLOTS) });
const exerciseRef = z.object({ day: dayField, slug: z.string().min(1).max(80) });

const mealSwapBody = mealRef.extend({
  week: z.string().optional(),
  items: z
    .array(z.object({ slug: z.string().min(1).max(80), portionIndex: z.number().int().min(0).max(20), quantity: z.number().positive().max(10) }))
    .min(1)
    .max(6),
});
const exerciseSwapBody = exerciseRef.extend({ week: z.string().optional(), replacement: z.string().min(1).max(80) });
const rebuildBody = z.object({ week: z.string().optional(), part: z.enum(["meals", "workouts"]) });

/** The signed-in user's saved week, built or refreshed as needed. */
async function week(req: Request, weekValue: unknown, { editing = false } = {}) {
  const weekStart = requestedWeek(weekValue);
  const user = await User.findById(req.auth!.userId);
  if (!user || user.status !== "active") throw new HttpError(401, "Not signed in");
  const profile = toSavedProfile(user);
  if (!profile) throw new HttpError(409, "Finish onboarding first, so we know what to plan for.");
  if (editing && isPastWeek(weekStart)) throw new HttpError(409, "That week is over, so its plan can no longer be changed.");
  return { profile, ...(await loadWeek(user._id, profile, weekStart)) };
}

/** Day, meal or exercise not in the plan (a rest day, or an exercise swapped away meanwhile). */
function notInPlan<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof RangeError) throw new HttpError(404, "That is not in your plan any more. Reload the page.");
    throw err;
  }
}

/* ---------- meals ---------- */

planRouter.get("/meals", requireAuth, async (req, res) => {
  const { saved } = await week(req, req.query.week);
  res.json({ weekStart: saved.weekStart, plan: saved.meals });
});

planRouter.get("/meals/alternatives", requireAuth, async (req, res) => {
  const { day, slot } = mealRef.parse(req.query);
  const { saved, inputs } = await week(req, req.query.week);
  const options = mealAlternatives({ ...inputs.meals(saved.mealsVersion), plan: saved.meals, day, slot });
  res.json({ weekStart: saved.weekStart, day, slot, options });
});

planRouter.put("/meals/swap", requireAuth, async (req, res) => {
  const { day, slot, items, week: weekValue } = mealSwapBody.parse(req.body);
  const { saved, inputs } = await week(req, weekValue, { editing: true });
  // Only a plate the planner itself offered can be saved, so a swap always follows the diet and safety rules.
  const offered = mealAlternatives({ ...inputs.meals(saved.mealsVersion), plan: saved.meals, day, slot }).find((o) => sameChoice(mealChoice(o), items));
  if (!offered) throw new HttpError(409, "Those options have changed. Please pick again.");
  const next = await saveWeek({ ...saved, meals: replaceMeal(saved.meals, day, slot, offered) });
  res.json({ weekStart: next.weekStart, plan: next.meals });
});

planRouter.delete("/meals/swap", requireAuth, async (req, res) => {
  const { day, slot } = mealRef.parse(req.query);
  const { saved } = await week(req, req.query.week, { editing: true });
  const next = await saveWeek({ ...saved, meals: restoreMeal(saved.meals, day, slot) });
  res.json({ weekStart: next.weekStart, plan: next.meals });
});

/* ---------- workouts ---------- */

planRouter.get("/workouts", requireAuth, async (req, res) => {
  const { saved } = await week(req, req.query.week);
  res.json({ weekStart: saved.weekStart, plan: saved.workouts });
});

planRouter.get("/workouts/alternatives", requireAuth, async (req, res) => {
  const { day, slug } = exerciseRef.parse(req.query);
  const { saved, inputs } = await week(req, req.query.week);
  const options = notInPlan(() => exerciseAlternatives({ ...inputs.workouts(saved.workoutsVersion), plan: saved.workouts, day, slug }));
  res.json({ weekStart: saved.weekStart, day, slug, options });
});

planRouter.put("/workouts/swap", requireAuth, async (req, res) => {
  const { day, slug, replacement, week: weekValue } = exerciseSwapBody.parse(req.body);
  const { saved, inputs } = await week(req, weekValue, { editing: true });
  const options = notInPlan(() => exerciseAlternatives({ ...inputs.workouts(saved.workoutsVersion), plan: saved.workouts, day, slug }));
  const pick = options.find((o) => o.slug === replacement);
  if (!pick) throw new HttpError(409, "Those options have changed. Please pick again.");
  const next = await saveWeek({ ...saved, workouts: replaceExercise(saved.workouts, day, slug, pick) });
  res.json({ weekStart: next.weekStart, plan: next.workouts });
});

planRouter.delete("/workouts/swap", requireAuth, async (req, res) => {
  const { day, slug } = exerciseRef.parse(req.query);
  const { saved } = await week(req, req.query.week, { editing: true });
  const next = await saveWeek({ ...saved, workouts: notInPlan(() => restoreExercise(saved.workouts, day, slug)) });
  res.json({ weekStart: next.weekStart, plan: next.workouts });
});

/* ---------- a new plan ---------- */

planRouter.post("/rebuild", requireAuth, async (req, res) => {
  const { part, week: weekValue } = rebuildBody.parse(req.body);
  const { saved, inputs } = await week(req, weekValue, { editing: true });
  if (part === "meals") {
    const mealsVersion = saved.mealsVersion + 1;
    const next = await saveWeek({ ...saved, mealsVersion, meals: planMeals(inputs.meals(mealsVersion)) });
    res.json({ weekStart: next.weekStart, plan: next.meals });
  } else {
    const workoutsVersion = saved.workoutsVersion + 1;
    const next = await saveWeek({ ...saved, workoutsVersion, workouts: planWorkouts(inputs.workouts(workoutsVersion)) });
    res.json({ weekStart: next.weekStart, plan: next.workouts });
  }
});
