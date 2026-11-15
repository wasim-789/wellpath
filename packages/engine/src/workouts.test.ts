import { describe, expect, it } from "vitest";
import { CONDITIONS, type Exercise } from "@wellpath/shared";
import { CONDITION_BLOCKS, PREGNANCY_BLOCKS } from "./safety";
import {
  exerciseAlternatives,
  formatSets,
  planWorkouts,
  replaceExercise,
  restoreExercise,
  workoutDaysPerWeek,
  workoutLevel,
  workoutPlanFits,
  workoutReasonText,
  type WorkoutPlan,
  type WorkoutReason,
} from "./workouts";

/** A small library covering every type, level and a few risky loads. */
const make = (slug: string, e: Partial<Exercise> & Pick<Exercise, "type" | "level" | "muscleGroups">): Exercise => ({
  slug,
  name: slug,
  equipment: "none",
  loads: [],
  sets: 3,
  met: 3.5,
  steps: ["Step one.", "Step two."],
  ...(e.seconds === undefined ? { reps: 10 } : {}),
  ...e,
});

const EXERCISES: Exercise[] = [
  make("squat", { type: "strength", level: "beginner", muscleGroups: ["legs", "glutes"], loads: ["deep_knee_bend"] }),
  make("sit-to-stand", { type: "strength", level: "beginner", muscleGroups: ["legs"], equipment: "chair" }),
  make("bridge", { type: "strength", level: "beginner", muscleGroups: ["glutes"] }),
  make("lunge", { type: "strength", level: "intermediate", muscleGroups: ["legs"], loads: ["deep_knee_bend"] }),
  make("jump-squat", { type: "strength", level: "advanced", muscleGroups: ["legs"], loads: ["jumping", "high_intensity"] }),
  make("wall-push", { type: "strength", level: "beginner", muscleGroups: ["chest", "arms"], equipment: "wall" }),
  make("knee-push", { type: "strength", level: "beginner", muscleGroups: ["chest"], loads: ["shoulder_weight_bearing"] }),
  make("bottle-press", { type: "strength", level: "beginner", muscleGroups: ["shoulders"], loads: ["overhead"], equipment: "water_bottles" }),
  make("band-row", { type: "strength", level: "beginner", muscleGroups: ["back"], equipment: "resistance_band" }),
  make("bird-dog", { type: "strength", level: "beginner", muscleGroups: ["back", "core"] }),
  make("superman", { type: "strength", level: "beginner", muscleGroups: ["back"], loads: ["spine_loading"] }),
  make("dead-bug", { type: "strength", level: "beginner", muscleGroups: ["core"] }),
  make("crunch", { type: "strength", level: "beginner", muscleGroups: ["core"], loads: ["spine_bending"] }),
  make("plank", { type: "strength", level: "intermediate", muscleGroups: ["core"], loads: ["breath_holding"], seconds: 30 }),
  make("march", { type: "cardio", level: "beginner", muscleGroups: ["full_body"], seconds: 120, sets: 2 }),
  make("step-touch", { type: "cardio", level: "beginner", muscleGroups: ["full_body"], seconds: 120, sets: 2 }),
  make("jacks", { type: "cardio", level: "intermediate", muscleGroups: ["full_body"], loads: ["jumping", "high_intensity"], seconds: 45, met: 8 }),
  make("walk", { type: "cardio", level: "beginner", muscleGroups: ["full_body"], seconds: 600, sets: 1 }),
  make("cat-cow", { type: "mobility", level: "beginner", muscleGroups: ["back"], sets: 1 }),
  make("shoulder-rolls", { type: "mobility", level: "beginner", muscleGroups: ["shoulders"], sets: 2 }),
  make("hamstring-stretch", { type: "mobility", level: "beginner", muscleGroups: ["legs"], seconds: 30, sets: 2 }),
  make("hip-stretch", { type: "mobility", level: "beginner", muscleGroups: ["glutes"], seconds: 30, sets: 2 }),
  make("twist", { type: "mobility", level: "beginner", muscleGroups: ["back"], loads: ["spine_twisting"], seconds: 30, sets: 2 }),
];

const profile = { age: 30, weightKg: 70, activityLevel: "moderate", goal: "maintain", conditions: [], workoutMinutes: 30 } as const;
const base = { profile, exercises: EXERCISES, seed: "user-1|2026-11-16" };
const sessions = (plan: WorkoutPlan) => plan.days.flatMap((d) => (d.session ? [d.session] : []));
const allSlugs = (plan: WorkoutPlan) => sessions(plan).flatMap((s) => [...s.warmup, ...s.main, ...s.cooldown].map((e) => e.slug));

describe("days and level", () => {
  it.each([
    ["sedentary", 10, 3],
    ["sedentary", 60, 3],
    ["light", 20, 4],
    ["moderate", 30, 5],
    ["moderate", 45, 4],
    ["very_active", 60, 3],
  ] as const)("%s with %i minutes trains %i days", (activity, minutes, days) => expect(workoutDaysPerWeek(activity, minutes)).toBe(days));

  it("takes the level from activity, and keeps older adults and pregnancy at beginner", () => {
    expect(workoutLevel({ ...profile, activityLevel: "light" })).toEqual({ level: "beginner" });
    expect(workoutLevel({ ...profile, activityLevel: "very_active" })).toEqual({ level: "advanced" });
    expect(workoutLevel({ ...profile, age: 64 })).toEqual({ level: "beginner", cappedBy: "age" });
    expect(workoutLevel({ ...profile, pregnantOrBreastfeeding: true })).toEqual({ level: "beginner", cappedBy: "pregnancy" });
  });

  it("formats sets for people", () => {
    expect(formatSets(3, 12)).toBe("3 × 12 reps");
    expect(formatSets(2, undefined, 30)).toBe("2 × 30 s");
    expect(formatSets(1, undefined, 900)).toBe("15 min");
  });
});

describe("planWorkouts", () => {
  it("gives the same week for the same seed, and a different one for another week", () => {
    expect(planWorkouts(base)).toEqual(planWorkouts(base));
    expect(JSON.stringify(planWorkouts({ ...base, seed: "user-1|2026-11-23" }).days)).not.toBe(JSON.stringify(planWorkouts(base).days));
  });

  it("plans 7 days with rest days between, and never trains on Sunday", () => {
    for (const minutes of [10, 20, 30, 45, 60]) {
      const plan = planWorkouts({ ...base, profile: { ...profile, workoutMinutes: minutes } });
      expect(plan.days).toHaveLength(7);
      expect(sessions(plan)).toHaveLength(plan.daysPerWeek);
      expect(plan.days[6].session).toBeNull();
      expect(plan.days[6].reasons[0].code).toBe("rest_day");
    }
  });

  it("fits every session in the time the person has, with a warm-up and a cool-down", () => {
    for (const minutes of [10, 20, 30, 45, 60]) {
      for (const s of sessions(planWorkouts({ ...base, profile: { ...profile, workoutMinutes: minutes } }))) {
        const seconds = [...s.warmup, ...s.main, ...s.cooldown].reduce((t, e) => t + e.durationSeconds, 0);
        expect(seconds, `${minutes} min`).toBeLessThanOrEqual(minutes * 60);
        expect(seconds, `${minutes} min`).toBeGreaterThanOrEqual(minutes * 60 * 0.75);
        expect(s.warmup.length).toBeGreaterThan(0);
        expect(s.cooldown.length).toBeGreaterThan(0);
        expect(s.cooldown.every((e) => e.type === "mobility" && e.seconds !== undefined)).toBe(true);
      }
    }
  });

  it("never plans an exercise the person's conditions rule out", () => {
    for (const c of CONDITIONS) {
      const plan = planWorkouts({ ...base, profile: { ...profile, conditions: [c] } });
      for (const slug of allSlugs(plan)) {
        const loads = EXERCISES.find((e) => e.slug === slug)!.loads;
        expect(loads.filter((l) => CONDITION_BLOCKS[c].includes(l)), `${c}: ${slug}`).toEqual([]);
      }
    }
  });

  it("leaves out jumping, hard efforts and back arching during pregnancy", () => {
    const plan = planWorkouts({ ...base, profile: { ...profile, activityLevel: "very_active", pregnantOrBreastfeeding: true } });
    expect(plan.level).toBe("beginner");
    for (const slug of allSlugs(plan)) expect(EXERCISES.find((e) => e.slug === slug)!.loads.some((l) => PREGNANCY_BLOCKS.includes(l)), slug).toBe(false);
    expect(plan.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["level_capped_pregnancy", "pregnancy_exercises"]));
  });

  it("only uses exercises at or below the person's level, with home equipment", () => {
    const slugs = allSlugs(planWorkouts({ ...base, profile: { ...profile, activityLevel: "light" } }));
    for (const s of ["lunge", "plank", "jacks", "jump-squat", "band-row"]) expect(slugs).not.toContain(s);
  });

  it("works the whole body on strength days and ends cardio days with a walk", () => {
    for (const s of sessions(planWorkouts({ ...base, profile: { ...profile, workoutMinutes: 45 } }))) {
      const groups = new Set(s.main.flatMap((e) => e.muscleGroups));
      if (s.focus === "strength") for (const g of ["legs", "chest", "back", "core"]) expect([...groups].some((x) => x === g || (g === "legs" && x === "glutes"))).toBe(true);
      else expect(s.main.at(-1)!.slug).toBe("walk");
    }
  });

  it("uses at least 2 sets of every main exercise, and does not repeat one in a session", () => {
    for (const s of sessions(planWorkouts(base))) {
      for (const e of s.main) expect(e.sets).toBeGreaterThanOrEqual(Math.min(2, EXERCISES.find((x) => x.slug === e.slug)!.sets));
      const slugs = [...s.warmup, ...s.main, ...s.cooldown].map((e) => e.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("puts more cardio in for weight loss and more strength for weight gain", () => {
    const count = (goal: "lose_weight" | "gain_weight") =>
      sessions(planWorkouts({ ...base, profile: { ...profile, goal } })).filter((s) => s.focus === "cardio").length;
    expect(count("lose_weight")).toBeGreaterThan(count("gain_weight"));
  });

  it("says so when few exercises are safe, instead of failing", () => {
    const plan = planWorkouts({ ...base, exercises: EXERCISES.filter((e) => e.type === "mobility"), profile: { ...profile, conditions: [...CONDITIONS] } });
    expect(plan.reasons.map((r) => r.code)).toContain("few_safe_exercises");
  });
});

describe("workoutReasonText", () => {
  it("has English text for every reason the planner gives", () => {
    const plan = planWorkouts({ ...base, profile: { ...profile, age: 65, conditions: [...CONDITIONS], pregnantOrBreastfeeding: false } });
    const reasons: WorkoutReason[] = [...plan.reasons, ...plan.days.flatMap((d) => [...d.reasons, ...(d.session?.reasons ?? [])])];
    for (const r of reasons) expect(workoutReasonText(r)).toMatch(/\w/);
    expect(workoutReasonText({ code: "workout_days", params: { days: 3, minutes: 30, weekly: 90 } })).toMatch(/^3 workouts a week/);
  });
});

describe("swapping an exercise", () => {
  const plan = planWorkouts(base);
  const day = plan.days.find((d) => d.session?.focus === "strength")!.day;
  const session = plan.days[day].session!;
  const target = session.main.find((e) => e.type === "strength")!;
  const options = exerciseAlternatives({ ...base, plan, day, slug: target.slug });

  it("offers safe exercises of the same kind, for the same muscles, not already in the session", () => {
    expect(options.length).toBeGreaterThan(0);
    const inSession = [...session.warmup, ...session.main, ...session.cooldown].map((e) => e.slug);
    for (const o of options) {
      expect(inSession).not.toContain(o.slug);
      expect(o.type).toBe("strength");
      expect(o.muscleGroups.some((m) => target.muscleGroups.includes(m))).toBe(true);
      expect(o.durationSeconds).toBeLessThanOrEqual(target.durationSeconds + 30);
    }
    const knee = exerciseAlternatives({ ...base, profile: { ...profile, conditions: ["knee_pain"] }, plan, day, slug: target.slug });
    for (const o of knee) expect(EXERCISES.find((e) => e.slug === o.slug)!.loads).not.toContain("deep_knee_bend");
  });

  it("only offers stretches for a cool-down stretch", () => {
    for (const o of exerciseAlternatives({ ...base, plan, day, slug: session.cooldown[0].slug })) {
      expect(o.type).toBe("mobility");
      expect(o.seconds).toBeDefined();
    }
  });

  it("swaps one exercise, updates the session time, and can put it back", () => {
    const after = replaceExercise(plan, day, target.slug, options[0]);
    const swapped = after.days[day].session!.main.find((e) => e.slug === options[0].slug)!;
    expect(swapped.swapped).toBe(true);
    expect(swapped.original).toEqual(target);
    const all = [...after.days[day].session!.warmup, ...after.days[day].session!.main, ...after.days[day].session!.cooldown];
    expect(after.days[day].session!.minutes).toBe(Math.round(all.reduce((t, e) => t + e.durationSeconds, 0) / 60));
    for (const d of after.days) if (d.day !== day) expect(d).toEqual(plan.days[d.day]);
    expect(restoreExercise(after, day, options[0].slug)).toEqual(plan);
    expect(replaceExercise(after, day, options[0].slug, target)).toEqual(plan);
  });

  it("knows when a saved plan is no longer safe or an exercise was deleted", () => {
    expect(workoutPlanFits(plan, profile, EXERCISES)).toBe(true);
    expect(workoutPlanFits(plan, profile, EXERCISES.filter((e) => e.slug !== target.slug))).toBe(false);
    const retagged = EXERCISES.map((e) => (e.slug === target.slug ? { ...e, loads: ["deep_knee_bend" as const] } : e));
    expect(workoutPlanFits(plan, { ...profile, conditions: ["knee_pain"] }, retagged)).toBe(false);
  });
});
