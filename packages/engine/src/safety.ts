/**
 * Exercise safety rules. They live in code, not the database, so they are reviewed in pull requests,
 * tested on every change, and can never be weakened by an admin edit.
 * They are conservative wellness rules, not medical advice: each condition also shows a doctor notice.
 */
import { type Condition, type Exercise, type ExerciseLoad, LOAD_LABEL } from "@wellpath/shared";

/** Loads each condition rules out. An exercise with any blocked load is never planned. */
export const CONDITION_BLOCKS: Record<Condition, readonly ExerciseLoad[]> = {
  knee_pain: ["deep_knee_bend", "jumping"],
  lower_back_pain: ["spine_bending", "spine_twisting", "spine_loading", "jumping"],
  shoulder_injury: ["overhead", "shoulder_weight_bearing"],
  high_blood_pressure: ["breath_holding", "high_intensity"],
  // Diabetes changes nothing about which exercises are safe; it gets a doctor notice instead.
  diabetes: [],
};

/** Every load blocked by at least one of the user's conditions. */
export function blockedLoads(conditions: readonly Condition[]): Set<ExerciseLoad> {
  return new Set(conditions.flatMap((c) => CONDITION_BLOCKS[c]));
}

type Loaded = { loads: readonly ExerciseLoad[] };

/** Why an exercise is unsafe for these conditions, or null if it is safe. */
export function unsafeReason(exercise: Loaded, conditions: readonly Condition[]): string | null {
  const blocked = blockedLoads(conditions);
  const hit = exercise.loads.filter((l) => blocked.has(l));
  return hit.length ? `Left out because it involves ${hit.map((l) => LOAD_LABEL[l]).join(" and ")}.` : null;
}

export const isExerciseSafe = (exercise: Loaded, conditions: readonly Condition[]) => unsafeReason(exercise, conditions) === null;

/** Only the exercises that are safe for every one of these conditions. */
export const safeExercises = <T extends Pick<Exercise, "loads">>(exercises: readonly T[], conditions: readonly Condition[]): T[] =>
  exercises.filter((e) => isExerciseSafe(e, conditions));
