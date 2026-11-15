/**
 * A user's saved plan for one week: the meals and workouts exactly as shown, swaps included.
 * Saved the first time the week is opened, so it stays the same all week even if the food or
 * exercise library changes. It is rebuilt when the profile changes, when the user asks for a new
 * plan, or when a food or exercise in it is deleted or becomes unsafe for them.
 */
import { Schema, model } from "mongoose";

const weekPlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Monday of the plan week, YYYY-MM-DD. */
    weekStart: { type: String, required: true },
    /** The answers (and planner version) the plan was built from. A different key means rebuild. */
    profileKey: { type: String, required: true },
    /** How many times the user asked for new meals or workouts this week. Part of the seed. */
    mealsVersion: { type: Number, required: true, default: 0 },
    workoutsVersion: { type: Number, required: true, default: 0 },
    meals: { type: Schema.Types.Mixed, required: true },
    workouts: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);
weekPlanSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export const WeekPlan = model("WeekPlan", weekPlanSchema);
