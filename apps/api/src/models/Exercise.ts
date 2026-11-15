/** A home exercise the planner can use. Shape matches exerciseSchema in @wellpath/shared. */
import { Schema, model } from "mongoose";
import { EQUIPMENT, EXERCISE_LEVELS, EXERCISE_LOADS, EXERCISE_TYPES, MUSCLE_GROUPS } from "@wellpath/shared";

const exerciseSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: EXERCISE_TYPES, required: true },
    level: { type: String, enum: EXERCISE_LEVELS, required: true },
    equipment: { type: String, enum: EQUIPMENT, required: true },
    muscleGroups: { type: [{ type: String, enum: MUSCLE_GROUPS }], required: true },
    // Safety rules filter on these, so they must always be present (an empty list means "no special stress").
    loads: { type: [{ type: String, enum: EXERCISE_LOADS }], required: true, default: [] },
    sets: { type: Number, required: true },
    reps: Number,
    seconds: Number,
    met: { type: Number, required: true },
    steps: { type: [String], required: true },
  },
  { timestamps: true },
);

export const ExerciseModel = model("Exercise", exerciseSchema);
