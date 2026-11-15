/**
 * Deterministic home workout planner. Same exercises + same profile + same seed = same week, every time.
 *
 * How many days: enough to reach the WHO guideline of 150 minutes a week at the person's session length,
 * between 3 and 5 days, and fewer for people who are mostly sitting now (start gently).
 * Level comes from activity, capped at beginner for people aged 60+ and during pregnancy.
 * Every session is a warm-up, a main block and a cool-down that fit the minutes the person has.
 * Strength days rotate legs, push, pull and core. Cardio days alternate cardio with core and finish with a walk.
 * Only exercises that pass the safety rules (safety.ts) and need nothing more than a chair, wall, step or
 * water bottles are used.
 *
 * Reasons are codes with numbers, not sentences, so the apps can translate them (see workoutReasonText).
 */
import {
  EXERCISE_LEVELS,
  type ActivityLevel,
  type Condition,
  type Equipment,
  type Exercise,
  type ExerciseLevel,
  type ExerciseType,
  type Goal,
  type MuscleGroup,
} from "@wellpath/shared";
import { CONDITION_BLOCKS, PREGNANCY_BLOCKS, safeExercises } from "./safety";
import { jitter } from "./seeded";

/** WHO: adults should get at least 150 minutes of moderate activity a week. */
export const WEEKLY_MINUTES_GOAL = 150;

/** Most workout days a week for each activity level. People who sit most of the day start with 3. */
const MAX_DAYS: Record<ActivityLevel, number> = { sedentary: 3, light: 4, moderate: 5, active: 5, very_active: 5 };
const MIN_DAYS = 3;

/** Which days (Monday = 0) to train, with rest days spread out. Sunday is always a rest day. */
const DAY_PATTERNS: Record<number, readonly number[]> = { 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5] };

const LEVEL_FROM_ACTIVITY: Record<ActivityLevel, ExerciseLevel> = {
  sedentary: "beginner",
  light: "beginner",
  moderate: "intermediate",
  active: "intermediate",
  very_active: "advanced",
};

/** From this age, workouts stay at beginner level. */
export const OLDER_ADULT_AGE = 60;

/** Equipment most homes have. A resistance band is left out because we never ask whether you own one. */
export const HOME_EQUIPMENT: readonly Equipment[] = ["none", "chair", "wall", "step", "water_bottles"];

export type Focus = "strength" | "cardio";

/** Workout focus for each training day in order, by goal. */
const FOCUS_PATTERN: Record<Goal, readonly Focus[]> = {
  lose_weight: ["cardio", "strength", "cardio", "strength", "cardio"],
  gain_weight: ["strength", "strength", "cardio", "strength", "strength"],
  maintain: ["strength", "cardio", "strength", "cardio", "strength"],
  general_fitness: ["strength", "cardio", "strength", "cardio", "strength"],
};

/** Strength days work these in turn, so every session covers the whole body. */
const STRENGTH_ROTATION: readonly (readonly MuscleGroup[])[] = [["legs", "glutes"], ["chest", "shoulders", "arms"], ["back"], ["core"]];

/** Seconds per repetition at a slow, controlled pace. */
const TEMPO_SECONDS = 3;
/** Moving to the next exercise and getting set. */
const TRANSITION_SECONDS = 15;
/** Rest between sets. Beginners rest longer. */
const REST_SECONDS: Record<ExerciseType, number> = { strength: 30, cardio: 20, mobility: 10 };
const BEGINNER_EXTRA_REST = 15;
/** Exercises this long (a brisk walk) are one steady block, sized in 5-minute steps. */
const STEADY_SECONDS = 300;
const STEADY_STEP = 300;
const MAX_STEADY_SECONDS = 30 * 60;
/** A main block never has more than this many exercises; spare time goes to extra sets or a walk. */
const MAX_MAIN_EXERCISES = 8;
const MAX_SETS = 4;
/** Energy used while resting between sets. */
const REST_MET = 2;

export type WorkoutReasonCode =
  | "workout_days"
  | "workout_level"
  | "level_capped_age"
  | "level_capped_pregnancy"
  | "condition_exercises"
  | "pregnancy_exercises"
  | "diabetes_exercise"
  | "home_equipment"
  | "strength_day"
  | "cardio_day"
  | "session_time"
  | "rest_day"
  | "few_safe_exercises";

export type WorkoutReason = { code: WorkoutReasonCode; params?: Record<string, string | number> };

export type PlannedExercise = {
  slug: string;
  name: string;
  type: ExerciseType;
  equipment: Equipment;
  muscleGroups: MuscleGroup[];
  sets: number;
  reps?: number;
  seconds?: number;
  restSeconds: number;
  /** Ready to show: "3 × 12 reps", "2 × 30 s", "15 min". */
  amount: string;
  /** Time for every set, rest and the move to the next exercise. */
  durationSeconds: number;
  kcal: number;
  steps: string[];
  /** True when the person swapped this exercise for an alternative. */
  swapped?: boolean;
  /** The exercise the planner chose, kept while a swap is in place so it can be put back. */
  original?: PlannedExercise;
};

export type WorkoutSession = {
  focus: Focus;
  warmup: PlannedExercise[];
  main: PlannedExercise[];
  cooldown: PlannedExercise[];
  minutes: number;
  kcal: number;
  reasons: WorkoutReason[];
};

export type WorkoutDay = { day: number; session: WorkoutSession | null; reasons: WorkoutReason[] };

export type WorkoutPlan = {
  daysPerWeek: number;
  minutesPerSession: number;
  level: ExerciseLevel;
  days: WorkoutDay[];
  reasons: WorkoutReason[];
};

export type WorkoutPlanInput = {
  profile: {
    age: number;
    weightKg: number;
    activityLevel: ActivityLevel;
    goal: Goal;
    conditions?: readonly Condition[];
    pregnantOrBreastfeeding?: boolean;
    workoutMinutes: number;
  };
  exercises: readonly Exercise[];
  /** Any text. Use the user id plus the week, so each week differs but reloads do not. */
  seed: string;
};

/* ---------- small helpers ---------- */

const levelIndex = (l: ExerciseLevel) => EXERCISE_LEVELS.indexOf(l);
const isSteady = (e: Exercise) => (e.seconds ?? 0) >= STEADY_SECONDS;

/** Training days a week: enough for 150 minutes, between 3 and the most this activity level should start with. */
export function workoutDaysPerWeek(activityLevel: ActivityLevel, minutes: number): number {
  return Math.min(MAX_DAYS[activityLevel], Math.max(MIN_DAYS, Math.ceil(WEEKLY_MINUTES_GOAL / minutes)));
}

/** The hardest level to plan, and why it was lowered if it was. */
export function workoutLevel(profile: WorkoutPlanInput["profile"]): { level: ExerciseLevel; cappedBy?: "age" | "pregnancy" } {
  const level = LEVEL_FROM_ACTIVITY[profile.activityLevel];
  if (level === "beginner") return { level };
  if (profile.pregnantOrBreastfeeding) return { level: "beginner", cappedBy: "pregnancy" };
  if (profile.age >= OLDER_ADULT_AGE) return { level: "beginner", cappedBy: "age" };
  return { level };
}

/** "3 × 12 reps", "2 × 30 s", "1 × 10 reps", "15 min". */
export function formatSets(sets: number, reps?: number, seconds?: number): string {
  if (seconds !== undefined && seconds >= 60 && sets === 1) return `${Math.round(seconds / 60)} min`;
  return reps !== undefined ? `${sets} × ${reps} reps` : `${sets} × ${seconds} s`;
}

type Choice = { exercise: Exercise; sets: number; seconds?: number };

function restFor(e: Exercise, level: ExerciseLevel) {
  return REST_SECONDS[e.type] + (level === "beginner" && e.type === "strength" ? BEGINNER_EXTRA_REST : 0);
}

function workSeconds(e: Exercise, sets: number, seconds = e.seconds) {
  return sets * (e.reps !== undefined ? e.reps * TEMPO_SECONDS : seconds!);
}

function durationOf({ exercise, sets, seconds }: Choice, level: ExerciseLevel) {
  return workSeconds(exercise, sets, seconds) + (sets - 1) * restFor(exercise, level) + TRANSITION_SECONDS;
}

function toPlanned(p: Choice, level: ExerciseLevel, weightKg: number): PlannedExercise {
  const e = p.exercise;
  const seconds = e.reps === undefined ? (p.seconds ?? e.seconds) : undefined;
  const work = workSeconds(e, p.sets, seconds);
  const duration = durationOf(p, level);
  const kcal = Math.round((e.met * weightKg * work + REST_MET * weightKg * (duration - work)) / 3600);
  return {
    slug: e.slug,
    name: e.name,
    type: e.type,
    equipment: e.equipment,
    muscleGroups: [...e.muscleGroups],
    sets: p.sets,
    ...(e.reps !== undefined ? { reps: e.reps } : { seconds }),
    restSeconds: restFor(e, level),
    amount: formatSets(p.sets, e.reps, seconds),
    durationSeconds: duration,
    kcal,
    steps: [...e.steps],
  };
}

type History = { lastSession: Set<string>; weekCount: Map<string, number> };

/** Lower is better: tie-breaking, variety across the week, and the person's own level first. */
function penalty(e: Exercise, level: ExerciseLevel, ctx: { seed: string; day: number; history: History }) {
  let s = 0.3 * jitter(ctx.seed, ctx.day, e.slug);
  if (ctx.history.lastSession.has(e.slug)) s += 1;
  s += 0.2 * (ctx.history.weekCount.get(e.slug) ?? 0);
  if (levelIndex(e.level) < levelIndex(level)) s += 0.15;
  return s;
}

/**
 * Adds exercises from `turns` (called once per turn, returning candidates in order of preference)
 * while they fit in `budget` seconds. Each exercise is used once per session; sets drop to fit, but never
 * below `minSets` (a single set of a strength move is not worth the setup).
 */
function fill(budget: number, turns: (turn: number) => Exercise[], used: Set<string>, level: ExerciseLevel, maxItems: number, maxTurns: number, minSets = 1) {
  const picks: Choice[] = [];
  let left = budget;
  let idle = 0;
  for (let turn = 0; turn < maxTurns && picks.length < maxItems && idle < maxTurns; turn++) {
    const e = turns(turn).find((x) => !used.has(x.slug));
    if (!e) { idle++; continue; }
    let added = false;
    for (let sets = e.sets; sets >= Math.min(minSets, e.sets); sets--) {
      const p = { exercise: e, sets };
      if (durationOf(p, level) <= left) {
        picks.push(p);
        used.add(e.slug);
        left -= durationOf(p, level);
        added = true;
        break;
      }
    }
    idle = added ? 0 : idle + 1;
  }
  return { picks, left };
}

/* ---------- the planner ---------- */

/** Safety first: the condition rules, then pregnancy, then level and home equipment. */
export function usableExercises<T extends Exercise>(profile: WorkoutPlanInput["profile"], exercises: readonly T[]): T[] {
  const { level } = workoutLevel(profile);
  return safeExercises(exercises, profile.conditions ?? []).filter(
    (e) =>
      levelIndex(e.level) <= levelIndex(level) &&
      HOME_EQUIPMENT.includes(e.equipment) &&
      !(profile.pregnantOrBreastfeeding && e.loads.some((l) => PREGNANCY_BLOCKS.includes(l))),
  );
}

export function planWorkouts({ profile, exercises, seed }: WorkoutPlanInput): WorkoutPlan {
  const conditions = profile.conditions ?? [];
  const minutes = profile.workoutMinutes;
  const daysPerWeek = workoutDaysPerWeek(profile.activityLevel, minutes);
  const { level, cappedBy } = workoutLevel(profile);

  const usable = usableExercises(profile, exercises);
  const of = (type: ExerciseType) => usable.filter((e) => e.type === type);
  const strength = of("strength");
  const cardio = of("cardio").filter((e) => !isSteady(e));
  const steady = of("cardio").filter(isSteady);
  const mobility = of("mobility");
  // Moving mobility (cat-cow, shoulder rolls) warms you up; held stretches belong in the cool-down.
  const moving = mobility.filter((e) => e.reps !== undefined);
  const stretches = mobility.filter((e) => e.reps === undefined);
  const core = strength.filter((e) => e.muscleGroups.includes("core"));

  const history: History = { lastSession: new Set(), weekCount: new Map() };
  const trainingDays = DAY_PATTERNS[daysPerWeek];
  const days: WorkoutDay[] = [];
  let thin = false;

  for (let day = 0; day < 7; day++) {
    const index = trainingDays.indexOf(day);
    if (index < 0) {
      days.push({ day, session: null, reasons: [{ code: "rest_day" }] });
      continue;
    }
    const focus = FOCUS_PATTERN[profile.goal][index];
    const ctx = { seed, day, history };
    const rank = (list: Exercise[]) => [...list].sort((a, b) => penalty(a, level, ctx) - penalty(b, level, ctx));
    const used = new Set<string>();
    const budget = minutes * 60;
    const edge = Math.max(120, Math.round(budget * 0.15));

    // Warm-up: an easy cardio move, then moving mobility. Cool-down: held stretches.
    const easyCardio = rank(cardio.filter((e) => e.level === "beginner"));
    const warm = fill(edge, (t) => (t === 0 ? easyCardio : rank(moving)), used, level, 3, 3);
    const cool = fill(edge, () => rank(stretches), used, level, 3, 3);
    let mainBudget = budget - (edge - warm.left) - (edge - cool.left);
    const walk = rank(steady)[0];
    const walkBlock = (seconds: number) => Math.min(MAX_STEADY_SECONDS, Math.floor((seconds - TRANSITION_SECONDS) / STEADY_STEP) * STEADY_STEP);

    // Cardio days keep about half the main block for a steady walk, so they are not mostly core work.
    let walkSeconds = focus === "cardio" && walk ? walkBlock(mainBudget / 2) : 0;
    if (walkSeconds < STEADY_STEP) walkSeconds = 0;
    mainBudget -= walkSeconds ? walkSeconds + TRANSITION_SECONDS : 0;

    const res =
      focus === "strength"
        ? fill(mainBudget, (t) => rank(strength.filter((e) => e.muscleGroups.some((m) => STRENGTH_ROTATION[t % 4].includes(m)))), used, level, MAX_MAIN_EXERCISES, MAX_MAIN_EXERCISES * 2, 2)
        : fill(mainBudget, (t) => rank(t % 2 === 0 ? cardio : core), used, level, MAX_MAIN_EXERCISES, MAX_MAIN_EXERCISES * 2, 2);
    const main = res.picks;
    mainBudget = res.left;

    // Spare time: an extra set on each exercise, then a steady walk to finish.
    for (const p of main) {
      const extra = durationOf({ ...p, sets: p.sets + 1 }, level) - durationOf(p, level);
      if (p.sets < MAX_SETS && extra <= mainBudget) {
        p.sets++;
        mainBudget -= extra;
      }
    }
    // Whatever is left joins the walk (cardio days) or becomes one at the end (strength days).
    const extraWalk = walk ? walkBlock(mainBudget + (walkSeconds ? TRANSITION_SECONDS : 0)) : 0;
    const totalWalk = Math.min(MAX_STEADY_SECONDS, walkSeconds + Math.max(0, extraWalk));
    if (walk && totalWalk >= STEADY_STEP) main.push({ exercise: walk, sets: 1, seconds: totalWalk });
    if (main.length < 3) thin = true;

    const planned = (list: Choice[]) => list.map((p) => toPlanned(p, level, profile.weightKg));
    const session: WorkoutSession = {
      focus,
      warmup: planned(warm.picks),
      main: planned(main),
      cooldown: planned(cool.picks),
      minutes: 0,
      kcal: 0,
      reasons: [],
    };
    const all = [...session.warmup, ...session.main, ...session.cooldown];
    session.minutes = Math.round(all.reduce((t, e) => t + e.durationSeconds, 0) / 60);
    session.kcal = all.reduce((t, e) => t + e.kcal, 0);
    session.reasons = [
      focus === "strength" ? { code: "strength_day" } : { code: "cardio_day" },
      { code: "session_time", params: { minutes: session.minutes, budget: minutes } },
    ];

    history.lastSession = new Set(all.map((e) => e.slug));
    for (const e of [...session.main]) history.weekCount.set(e.slug, (history.weekCount.get(e.slug) ?? 0) + 1);
    days.push({ day, session, reasons: [] });
  }

  const reasons: WorkoutReason[] = [
    { code: "workout_days", params: { days: daysPerWeek, minutes, weekly: daysPerWeek * minutes } },
    { code: "workout_level", params: { level, activity: profile.activityLevel } },
  ];
  if (cappedBy === "age") reasons.push({ code: "level_capped_age", params: { age: OLDER_ADULT_AGE } });
  if (cappedBy === "pregnancy") reasons.push({ code: "level_capped_pregnancy" });
  for (const c of conditions) if (CONDITION_BLOCKS[c].length) reasons.push({ code: "condition_exercises", params: { condition: c } });
  if (profile.pregnantOrBreastfeeding) reasons.push({ code: "pregnancy_exercises" });
  if (conditions.includes("diabetes")) reasons.push({ code: "diabetes_exercise" });
  reasons.push({ code: "home_equipment" });
  if (thin) reasons.push({ code: "few_safe_exercises" });

  return { daysPerWeek, minutesPerSession: minutes, level, days, reasons };
}

/* ---------- saved plans: checking and swapping ---------- */

const BLOCKS = ["warmup", "main", "cooldown"] as const;
type Block = (typeof BLOCKS)[number];

const sessionExercises = (s: WorkoutSession) => [...s.warmup, ...s.main, ...s.cooldown];

/**
 * True while every exercise in a saved plan still exists and is still safe for this person.
 * When an admin deletes an exercise or tags it as unsafe, the saved plan must be rebuilt.
 */
export function workoutPlanFits(plan: WorkoutPlan, profile: WorkoutPlanInput["profile"], exercises: readonly Exercise[]): boolean {
  const ok = new Set(usableExercises(profile, exercises).map((e) => e.slug));
  return plan.days.every((d) => !d.session || sessionExercises(d.session).every((e) => ok.has(e.slug) && (!e.original || ok.has(e.original.slug))));
}

function findExercise(plan: WorkoutPlan, day: number, slug: string): { session: WorkoutSession; block: Block; index: number } {
  const session = plan.days[day]?.session;
  if (session) {
    for (const block of BLOCKS) {
      const index = session[block].findIndex((e) => e.slug === slug);
      if (index >= 0) return { session, block, index };
    }
  }
  throw new RangeError(`Day ${day} has no exercise ${slug}`);
}

/** How much two exercises work the same muscles, from 0 to 1. */
const overlap = (a: readonly MuscleGroup[], b: readonly MuscleGroup[]) => a.filter((m) => b.includes(m)).length / Math.max(a.length, 1);

/**
 * Other exercises that could take this one's place: the same kind (warm-up move, stretch, cardio, or a
 * strength move for the same muscles), safe for this person, not already in the session, and sized to
 * take about the same time.
 */
export function exerciseAlternatives(input: WorkoutPlanInput & { plan: WorkoutPlan; day: number; slug: string; count?: number }): PlannedExercise[] {
  const { plan, day, slug, profile, seed, count = 3 } = input;
  const { session, block, index } = findExercise(plan, day, slug);
  const current = session[block][index];
  const level = plan.level;
  const inSession = new Set(sessionExercises(session).flatMap((e) => [e.slug, ...(e.original ? [e.original.slug] : [])]));
  const currentSteady = (current.seconds ?? 0) >= STEADY_SECONDS && current.type === "cardio";

  const candidates = usableExercises(profile, input.exercises).filter((e) => {
    if (inSession.has(e.slug)) return false;
    if (block === "cooldown") return e.type === "mobility" && e.reps === undefined;
    if (block === "warmup") return current.type === "cardio" ? e.type === "cardio" && e.level === "beginner" && !isSteady(e) : e.type === "mobility" && e.reps !== undefined;
    if (currentSteady) return e.type === "cardio" && isSteady(e);
    if (current.type === "cardio") return e.type === "cardio" && !isSteady(e);
    return e.type === current.type && overlap(current.muscleGroups, e.muscleGroups) > 0;
  });

  const minSets = block === "main" ? 2 : 1;
  const sized = candidates.flatMap((e) => {
    if (isSteady(e)) return [{ exercise: e, sets: 1, seconds: current.seconds }];
    // As many sets as fit in the time the current exercise takes (plus a little), within the usual range.
    for (let sets = Math.min(MAX_SETS, Math.max(e.sets, current.sets)); sets >= Math.min(minSets, e.sets); sets--) {
      if (durationOf({ exercise: e, sets }, level) <= current.durationSeconds + 30) return [{ exercise: e, sets }];
    }
    return [];
  });

  const score = (c: Choice) => -overlap(current.muscleGroups, c.exercise.muscleGroups) + 0.3 * jitter(seed, day, c.exercise.slug) + (levelIndex(c.exercise.level) < levelIndex(level) ? 0.15 : 0);
  return sized
    .sort((a, b) => score(a) - score(b))
    .slice(0, count)
    .map((c) => toPlanned(c, level, profile.weightKg));
}

/** The plan with one exercise changed and that session's minutes and calories worked out again. */
function withExercise(plan: WorkoutPlan, day: number, slug: string, make: (current: PlannedExercise) => PlannedExercise): WorkoutPlan {
  const { session, block, index } = findExercise(plan, day, slug);
  const next = { ...session, [block]: session[block].map((e, i) => (i === index ? make(e) : e)) } as WorkoutSession;
  const all = sessionExercises(next);
  next.minutes = Math.round(all.reduce((t, e) => t + e.durationSeconds, 0) / 60);
  next.kcal = all.reduce((t, e) => t + e.kcal, 0);
  next.reasons = next.reasons.map((r) => (r.code === "session_time" ? { ...r, params: { ...r.params, minutes: next.minutes } } : r));
  const days = [...plan.days];
  days[day] = { ...plan.days[day], session: next };
  return { ...plan, days };
}

/** Swap one exercise for an alternative, keeping the planned one so it can be put back. */
export function replaceExercise(plan: WorkoutPlan, day: number, slug: string, replacement: PlannedExercise): WorkoutPlan {
  return withExercise(plan, day, slug, (current) => {
    const original = current.original ?? current;
    if (replacement.slug === original.slug) return original;
    return { ...replacement, swapped: true, original };
  });
}

/** Put one swapped exercise back to what the planner chose. `slug` is the exercise shown now. */
export const restoreExercise = (plan: WorkoutPlan, day: number, slug: string): WorkoutPlan =>
  withExercise(plan, day, slug, (current) => current.original ?? current);

/* ---------- English text for reasons (the apps may translate the codes instead) ---------- */

const CONDITION_TEXT: Record<Condition, string> = {
  knee_pain: "knee pain: no deep squats, lunges or jumping",
  lower_back_pain: "back pain: no heavy bending, twisting, back arching or jumping",
  shoulder_injury: "your shoulder: no overhead lifting or putting your weight on your arms",
  high_blood_pressure: "high blood pressure: no long breath-holding holds or very hard bursts",
  diabetes: "diabetes",
};

export function workoutReasonText({ code, params = {} }: WorkoutReason): string {
  const p = params;
  switch (code) {
    case "workout_days": return `${p.days} workouts a week of about ${p.minutes} minutes, ${p.weekly} minutes in all. The WHO suggests at least 150 minutes of activity a week.`;
    case "workout_level": return `${String(p.level)[0].toUpperCase()}${String(p.level).slice(1)} exercises, to match how active you are now.`;
    case "level_capped_age": return `Exercises stay at beginner level from age ${p.age}, to keep joints and balance safe.`;
    case "level_capped_pregnancy": return "Exercises stay at beginner level during pregnancy and breastfeeding.";
    case "condition_exercises": return `Exercises are chosen around ${CONDITION_TEXT[p.condition as Condition] ?? String(p.condition)}.`;
    case "pregnancy_exercises": return "No jumping, very hard efforts, back arching or breath-holding holds. Check with your doctor or midwife before starting.";
    case "diabetes_exercise": return "Keep a small snack nearby in case your blood sugar drops, and check it before exercise if you use insulin.";
    case "home_equipment": return "Everything can be done at home with a chair, a wall, a stair or two water bottles.";
    case "strength_day": return "Strength day: legs, push, pull and core, so the whole body gets worked.";
    case "cardio_day": return "Cardio day: get your heart rate up, with core work in between to catch your breath.";
    case "session_time": return `About ${p.minutes} minutes including warm-up, rest and cool-down, to fit your ${p.budget} minutes.`;
    case "rest_day": return "Rest day. Muscles get stronger while you rest. A gentle walk is fine if you feel like it.";
    case "few_safe_exercises": return "Only a few exercises are safe for your answers, so some workouts are short. An admin can add gentler exercises.";
  }
}
