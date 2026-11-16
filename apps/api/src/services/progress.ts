/**
 * Daily progress: ticking off workout sets and eaten meals, water and weigh-ins, and the summaries
 * built from them (each day, the week so far, the streak, and the history behind the charts).
 *
 * Sets and meals are always measured against the week's saved plan, so a swapped or rebuilt plan
 * simply counts what is in it now.
 */
import type { Types } from "mongoose";
import { foodItem, sumNutrients, waterTarget, weightTrend, type LogFood, type WaterTarget } from "@wellpath/engine";
import { randomUUID } from "node:crypto";
import type { MealSlot, Nutrients, SavedProfile } from "@wellpath/shared";
import { HttpError } from "../middleware/errors.js";
import { DayLog } from "../models/DayLog.js";
import { WeekPlan } from "../models/WeekPlan.js";
import type { SavedWeek } from "./weekPlan.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** The calendar date of a plan day. */
export const dateOf = (weekStart: string, day: number) => iso(dayNumber(weekStart) + day * DAY_MS);

/** The Monday of a date's week, and which day of that week it is (0 is Monday). */
export function weekOf(date: string): { weekStart: string; day: number } {
  const t = dayNumber(date);
  const day = (new Date(t).getUTCDay() + 6) % 7;
  return { weekStart: iso(t - day * DAY_MS), day };
}

/**
 * The user's own date, as sent by the app (their time zone decides when a day starts).
 * Anything more than a day away from the server's date is refused, so "today" cannot be moved to unlock future days.
 */
export function userToday(value: unknown, now = Date.now()): string {
  if (value === undefined) return iso(now);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, "today must be a date like 2026-11-16");
  }
  if (Math.abs(Date.parse(`${value}T12:00:00Z`) - now) > 1.5 * DAY_MS) throw new HttpError(400, "today does not match the current date");
  return value;
}

/** A food the user typed in, as saved. */
export type FoodEntry = {
  id: string;
  slot: MealSlot;
  slug: string;
  name: string;
  quantity: number;
  portionIndex: number;
  amount: string;
  grams: number;
  nutrients: Nutrients;
};

type Log = { date: string; day: number; sets: Record<string, number>; meals: MealSlot[]; foods?: FoodEntry[]; water?: number; weightKg?: number };

export type DayProgress = {
  day: number;
  date: string;
  sets: Record<string, number>;
  meals: MealSlot[];
  /** Exercises fully done, of the day's exercises. Null on a rest day. */
  workout: { done: number; total: number; complete: boolean } | null;
  /** Meals eaten, of the meals planned. */
  eaten: { done: number; total: number };
  /** Foods typed in this day. */
  foods: FoodEntry[];
  /** Eaten so far: the planned meals ticked off plus the foods typed in. */
  intake: { kcal: number; proteinG: number };
  water: number;
  weightKg: number | null;
  /** Something was done this day. */
  active: boolean;
};

export type WeekProgress = {
  weekStart: string;
  today: string;
  days: DayProgress[];
  week: { workoutsDone: number; workoutsPlanned: number; mealsEaten: number; mealsPlanned: number; activeDays: number };
  streak: { current: number; best: number };
  water: WaterTarget;
  /** The day's targets from the meal plan, to compare intake with. */
  targets: { calories: number; proteinG: number };
  /** The most recent weigh-in up to today, if any. */
  lastWeight: { date: string; weightKg: number } | null;
};

const isActive = (log: Pick<Log, "sets" | "meals" | "foods" | "water" | "weightKg">) =>
  log.meals.length > 0 || (log.foods?.length ?? 0) > 0 || Object.values(log.sets).some((n) => n > 0) || (log.water ?? 0) > 0 || log.weightKg !== undefined;

function dayProgress(saved: SavedWeek | null, date: string, day: number, log: Log | undefined): DayProgress {
  const sets = log?.sets ?? {};
  const session = saved?.workouts.days[day]?.session;
  const exercises = session ? [...session.warmup, ...session.main, ...session.cooldown] : [];
  const done = exercises.filter((e) => (sets[e.slug] ?? 0) >= e.sets).length;
  const planned = saved?.meals.days[day]?.meals.filter((m) => m.items.length) ?? [];
  // Without the week's plan (a week never opened), every logged meal counts.
  const meals = saved ? (log?.meals ?? []).filter((slot) => planned.some((m) => m.slot === slot)) : (log?.meals ?? []);
  const foods = log?.foods ?? [];
  const eaten = sumNutrients([...planned.filter((m) => meals.includes(m.slot)).map((m) => m.totals), ...foods.map((f) => f.nutrients)]);
  return {
    day,
    date,
    sets,
    meals,
    workout: session ? { done, total: exercises.length, complete: exercises.length > 0 && done === exercises.length } : null,
    eaten: { done: meals.length, total: saved ? planned.length : meals.length },
    foods,
    intake: { kcal: eaten.kcal, proteinG: eaten.proteinG },
    water: log?.water ?? 0,
    weightKg: log?.weightKg ?? null,
    active: log ? isActive(log) : false,
  };
}

/** Current and best run of consecutive active days. Today counts once something is done; until then the run up to yesterday stands. */
async function streak(userId: Types.ObjectId, today: string) {
  const dates = (await DayLog.find({ userId, active: true, date: { $lte: today } }, { date: 1 }).sort({ date: 1 }).lean()).map((d) => d.date);
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const d of dates) {
    const t = Date.parse(d);
    run = prev && t - prev === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  const last = dates.at(-1);
  const yesterday = iso(Date.parse(today) - DAY_MS);
  const current = last === today || last === yesterday ? run : 0;
  return { current, best };
}

async function lastWeight(userId: Types.ObjectId, today: string) {
  const log = await DayLog.findOne({ userId, date: { $lte: today }, weightKg: { $exists: true } }, { date: 1, weightKg: 1 }).sort({ date: -1 }).lean();
  return log?.weightKg !== undefined && log.weightKg !== null ? { date: log.date, weightKg: log.weightKg } : null;
}

const waterFor = (profile: SavedProfile, weightKg?: number) =>
  waterTarget(weightKg ?? profile.weightKg, { pregnantOrBreastfeeding: profile.pregnantOrBreastfeeding });

export async function weekProgress(userId: Types.ObjectId, saved: SavedWeek, today: string, profile: SavedProfile): Promise<WeekProgress> {
  const logs = await DayLog.find({ userId, weekStart: saved.weekStart }).lean<Log[]>();
  const byDay = new Map(logs.map((l) => [l.day, l]));
  const days = Array.from({ length: 7 }, (_, d) => dayProgress(saved, dateOf(saved.weekStart, d), d, byDay.get(d)));
  const [run, weight] = await Promise.all([streak(userId, today), lastWeight(userId, today)]);
  return {
    weekStart: saved.weekStart,
    today,
    days,
    week: {
      workoutsDone: days.filter((d) => d.workout?.complete).length,
      workoutsPlanned: days.filter((d) => d.workout).length,
      mealsEaten: days.reduce((t, d) => t + d.eaten.done, 0),
      mealsPlanned: days.reduce((t, d) => t + d.eaten.total, 0),
      activeDays: days.filter((d) => d.active).length,
    },
    streak: run,
    water: waterFor(profile, weight?.weightKg),
    targets: { calories: saved.meals.target.calories, proteinG: saved.meals.target.proteinG },
    lastWeight: weight,
  };
}

/** Refuses days that have not come yet: they can be ticked off on the day. */
function checkDate(date: string, today: string) {
  if (date > today) throw new HttpError(409, "That day has not come yet. You can tick it off on the day.");
}

/** Reads, changes and saves one day's log, keeping `active` in step. */
async function save(userId: Types.ObjectId, date: string, change: (log: Log) => Log) {
  const { weekStart, day } = weekOf(date);
  const current = (await DayLog.findOne({ userId, date }).lean<Log>()) ?? { date, day, sets: {}, meals: [] };
  const next = change({ ...current, sets: { ...current.sets }, meals: [...current.meals], foods: [...(current.foods ?? [])] });
  const $set = { weekStart, day, sets: next.sets, meals: next.meals, foods: next.foods ?? [], water: next.water ?? 0, active: isActive(next) };
  await DayLog.updateOne(
    { userId, date },
    next.weightKg === undefined ? { $set, $unset: { weightKg: 1 } } : { $set: { ...$set, weightKg: next.weightKg } },
    { upsert: true },
  );
}

/** Sets done for one exercise on one day (0 clears it). */
export async function setSets(userId: Types.ObjectId, saved: SavedWeek, day: number, slug: string, sets: number, today: string) {
  const date = dateOf(saved.weekStart, day);
  checkDate(date, today);
  const session = saved.workouts.days[day]?.session;
  const exercise = session && [...session.warmup, ...session.main, ...session.cooldown].find((e) => e.slug === slug);
  if (!exercise) throw new HttpError(404, "That exercise is not in this day's workout. Reload the page.");
  if (sets > exercise.sets) throw new HttpError(400, `${exercise.name} has ${exercise.sets} sets`);
  await save(userId, date, (log) => {
    if (sets) log.sets[slug] = sets;
    else delete log.sets[slug];
    return log;
  });
}

/** Marks one meal as eaten, or not. */
export async function setMeal(userId: Types.ObjectId, saved: SavedWeek, day: number, slot: MealSlot, eaten: boolean, today: string) {
  const date = dateOf(saved.weekStart, day);
  checkDate(date, today);
  if (!saved.meals.days[day]?.meals.some((m) => m.slot === slot && m.items.length)) throw new HttpError(404, "That meal is not in this day's plan.");
  await save(userId, date, (log) => {
    log.meals = eaten ? [...new Set([...log.meals, slot])] : log.meals.filter((m) => m !== slot);
    return log;
  });
}

/** Glasses of water drunk on one day. */
export async function setWater(userId: Types.ObjectId, saved: SavedWeek, day: number, glasses: number, today: string) {
  const date = dateOf(saved.weekStart, day);
  checkDate(date, today);
  await save(userId, date, (log) => ({ ...log, water: glasses }));
}

/** How far back a weigh-in can be added or removed. */
export const WEIGHT_DAYS_BACK = 90;

function checkWeightDate(date: string, today: string) {
  checkDate(date, today);
  if (dayNumber(today) - dayNumber(date) > WEIGHT_DAYS_BACK * DAY_MS) throw new HttpError(400, `Weigh-ins can be added for the last ${WEIGHT_DAYS_BACK} days`);
}

/** Saves a weigh-in for a date (today by default). */
export async function setWeight(userId: Types.ObjectId, date: string, weightKg: number, today: string) {
  checkWeightDate(date, today);
  await save(userId, date, (log) => ({ ...log, weightKg: Math.round(weightKg * 10) / 10 }));
}

/** Removes a weigh-in logged by mistake. */
export async function removeWeight(userId: Types.ObjectId, date: string, today: string) {
  checkWeightDate(date, today);
  if (!(await DayLog.exists({ userId, date, weightKg: { $exists: true } }))) throw new HttpError(404, "There is no weigh-in on that day.");
  await save(userId, date, (log) => {
    delete log.weightKg;
    return log;
  });
}

/** Most foods that can be typed in for one day: plenty for real eating, and a limit on misuse. */
export const MAX_FOODS_PER_DAY = 60;

export type FoodChoice = { slug: string; portionIndex: number; quantity: number };

/**
 * Adds foods to one meal of one day. Each must be in the food library, and the nutrients are always worked
 * out here from the library, so what is saved never depends on numbers sent by the app.
 */
export async function logFoods(userId: Types.ObjectId, saved: SavedWeek, day: number, slot: MealSlot, choices: FoodChoice[], today: string, library: readonly LogFood[]) {
  const date = dateOf(saved.weekStart, day);
  checkDate(date, today);
  const bySlug = new Map(library.map((f) => [f.slug, f]));
  const entries: FoodEntry[] = choices.map((c) => {
    const food = bySlug.get(c.slug);
    if (!food) throw new HttpError(404, `There is no food called "${c.slug}". Pick it again from the list.`);
    if (!food.portions[c.portionIndex]) throw new HttpError(400, `${food.name} has no portion number ${c.portionIndex}`);
    const item = foodItem(food, c.portionIndex, c.quantity);
    return { id: randomUUID(), slot, slug: item.slug, name: item.name, quantity: item.quantity, portionIndex: item.portionIndex, amount: item.amount, grams: item.grams, nutrients: item.nutrients };
  });
  await save(userId, date, (log) => {
    if ((log.foods?.length ?? 0) + entries.length > MAX_FOODS_PER_DAY) throw new HttpError(400, `A day can hold up to ${MAX_FOODS_PER_DAY} foods.`);
    return { ...log, foods: [...(log.foods ?? []), ...entries] };
  });
}

/** Removes one typed-in food. */
export async function removeFood(userId: Types.ObjectId, saved: SavedWeek, day: number, id: string, today: string) {
  const date = dateOf(saved.weekStart, day);
  checkDate(date, today);
  const log = await DayLog.findOne({ userId, date, "foods.id": id }, { _id: 1 }).lean();
  if (!log) throw new HttpError(404, "That food is not in your log any more.");
  await save(userId, date, (l) => ({ ...l, foods: (l.foods ?? []).filter((f) => f.id !== id) }));
}

export const HISTORY_RANGES = [7, 30, 90] as const;

export type History = {
  from: string;
  to: string;
  days: { date: string; weightKg: number | null; water: number; meals: number; kcal: number; workout: { done: number; total: number } | null }[];
  trend: { date: string; trendKg: number }[];
  water: WaterTarget;
  /** The calorie target from the most recent week plan in the range, for the calories chart. */
  targetKcal: number | null;
};

/** Day-by-day numbers for the charts: weight (with its 7-day trend), water, meals eaten and workouts. */
export async function history(userId: Types.ObjectId, today: string, days: number, profile: SavedProfile): Promise<History> {
  const to = today;
  const from = iso(dayNumber(today) - (days - 1) * DAY_MS);
  // Seven extra days before the range, so the trend line starts with a full average.
  const trendFrom = iso(dayNumber(from) - 7 * DAY_MS);
  const logs = await DayLog.find({ userId, date: { $gte: trendFrom, $lte: to } }).sort({ date: 1 }).lean<Log[]>();
  const weeks = [...new Set(Array.from({ length: days }, (_, i) => weekOf(iso(dayNumber(from) + i * DAY_MS)).weekStart))];
  const plans = await WeekPlan.find({ userId, weekStart: { $in: weeks } }).lean<SavedWeek[]>();
  const planFor = new Map(plans.map((p) => [p.weekStart, p]));
  const byDate = new Map(logs.map((l) => [l.date, l]));

  const series = Array.from({ length: days }, (_, i) => {
    const date = iso(dayNumber(from) + i * DAY_MS);
    const { weekStart, day } = weekOf(date);
    const p = dayProgress(planFor.get(weekStart) ?? null, date, day, byDate.get(date));
    return { date, weightKg: p.weightKg, water: p.water, meals: p.eaten.done, kcal: p.intake.kcal, workout: p.workout && { done: p.workout.done, total: p.workout.total } };
  });
  const weighIns = logs.filter((l) => l.weightKg !== undefined && l.weightKg !== null).map((l) => ({ date: l.date, weightKg: l.weightKg! }));
  const latest = weighIns.at(-1)?.weightKg;
  const newest = [...plans].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  return { from, to, days: series, trend: weightTrend(weighIns).filter((t) => t.date >= from), water: waterFor(profile, latest), targetKcal: newest?.meals.target.calories ?? null };
}
