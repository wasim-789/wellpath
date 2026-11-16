/**
 * Daily progress: ticking off workout sets and eaten meals, and the summaries built from them
 * (each day, the week so far, and the streak of days with something done).
 *
 * Progress is always measured against the week's saved plan, so a swapped or rebuilt plan simply
 * counts what is in it now.
 */
import type { Types } from "mongoose";
import type { MealSlot } from "@wellpath/shared";
import { HttpError } from "../middleware/errors.js";
import { DayLog } from "../models/DayLog.js";
import type { SavedWeek } from "./weekPlan.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The calendar date of a plan day. */
export const dateOf = (weekStart: string, day: number) => iso(Date.parse(`${weekStart}T00:00:00Z`) + day * DAY_MS);

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

type Log = { date: string; day: number; sets: Record<string, number>; meals: MealSlot[] };

export type DayProgress = {
  day: number;
  date: string;
  sets: Record<string, number>;
  meals: MealSlot[];
  /** Exercises fully done, of the day's exercises. Null on a rest day. */
  workout: { done: number; total: number; complete: boolean } | null;
  /** Meals eaten, of the meals planned. */
  eaten: { done: number; total: number };
  /** Something was done this day. */
  active: boolean;
};

export type WeekProgress = {
  weekStart: string;
  today: string;
  days: DayProgress[];
  week: { workoutsDone: number; workoutsPlanned: number; mealsEaten: number; mealsPlanned: number; activeDays: number };
  streak: { current: number; best: number };
};

const isActive = (sets: Record<string, number>, meals: readonly string[]) => meals.length > 0 || Object.values(sets).some((n) => n > 0);

function dayProgress(saved: SavedWeek, day: number, log: Log | undefined): DayProgress {
  const sets = log?.sets ?? {};
  const session = saved.workouts.days[day]?.session;
  const exercises = session ? [...session.warmup, ...session.main, ...session.cooldown] : [];
  const done = exercises.filter((e) => (sets[e.slug] ?? 0) >= e.sets).length;
  const planned = saved.meals.days[day]?.meals.filter((m) => m.items.length) ?? [];
  const meals = (log?.meals ?? []).filter((slot) => planned.some((m) => m.slot === slot));
  return {
    day,
    date: dateOf(saved.weekStart, day),
    sets,
    meals,
    workout: session ? { done, total: exercises.length, complete: exercises.length > 0 && done === exercises.length } : null,
    eaten: { done: meals.length, total: planned.length },
    active: isActive(sets, meals),
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

export async function weekProgress(userId: Types.ObjectId, saved: SavedWeek, today: string): Promise<WeekProgress> {
  const logs = await DayLog.find({ userId, weekStart: saved.weekStart }).lean<Log[]>();
  const byDay = new Map(logs.map((l) => [l.day, l]));
  const days = Array.from({ length: 7 }, (_, d) => dayProgress(saved, d, byDay.get(d)));
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
    streak: await streak(userId, today),
  };
}

/** Refuses days that have not come yet: they can be ticked off on the day. */
function checkDay(saved: SavedWeek, day: number, today: string) {
  if (dateOf(saved.weekStart, day) > today) throw new HttpError(409, "That day has not come yet. You can tick it off on the day.");
}

async function save(userId: Types.ObjectId, saved: SavedWeek, day: number, change: (log: Log) => Log) {
  const date = dateOf(saved.weekStart, day);
  const current = (await DayLog.findOne({ userId, date }).lean<Log>()) ?? { date, day, sets: {}, meals: [] };
  const next = change({ ...current, sets: { ...current.sets }, meals: [...current.meals] });
  await DayLog.updateOne(
    { userId, date },
    { $set: { weekStart: saved.weekStart, day, sets: next.sets, meals: next.meals, active: isActive(next.sets, next.meals) } },
    { upsert: true },
  );
}

/** Sets done for one exercise on one day (0 clears it). */
export async function setSets(userId: Types.ObjectId, saved: SavedWeek, day: number, slug: string, sets: number, today: string) {
  checkDay(saved, day, today);
  const session = saved.workouts.days[day]?.session;
  const exercise = session && [...session.warmup, ...session.main, ...session.cooldown].find((e) => e.slug === slug);
  if (!exercise) throw new HttpError(404, "That exercise is not in this day's workout. Reload the page.");
  if (sets > exercise.sets) throw new HttpError(400, `${exercise.name} has ${exercise.sets} sets`);
  await save(userId, saved, day, (log) => {
    if (sets) log.sets[slug] = sets;
    else delete log.sets[slug];
    return log;
  });
}

/** Marks one meal as eaten, or not. */
export async function setMeal(userId: Types.ObjectId, saved: SavedWeek, day: number, slot: MealSlot, eaten: boolean, today: string) {
  checkDay(saved, day, today);
  if (!saved.meals.days[day]?.meals.some((m) => m.slot === slot && m.items.length)) throw new HttpError(404, "That meal is not in this day's plan.");
  await save(userId, saved, day, (log) => {
    log.meals = eaten ? [...new Set([...log.meals, slot])] : log.meals.filter((m) => m !== slot);
    return log;
  });
}
