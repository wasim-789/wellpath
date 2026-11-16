/**
 * What a user did on one day: the sets they ticked off for each exercise, the meals they ate,
 * the water they drank and their weigh-in.
 * One document per user per date. `active` is stored so streaks can be counted with one query.
 */
import { Schema, model } from "mongoose";
import { MEAL_SLOTS } from "@wellpath/shared";

const dayLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** The calendar day, YYYY-MM-DD. */
    date: { type: String, required: true },
    weekStart: { type: String, required: true },
    day: { type: Number, required: true, min: 0, max: 6 },
    /** Sets done per exercise slug. */
    sets: { type: Schema.Types.Mixed, default: {} },
    meals: { type: [{ type: String, enum: MEAL_SLOTS }], default: [] },
    /**
     * Foods the user typed in ("2 roti aur daal"), each with its meal, portion and nutrients worked out by the
     * server from the food library: { id, slot, slug, name, quantity, portionIndex, amount, grams, nutrients }.
     */
    foods: { type: [Schema.Types.Mixed], default: [] },
    /** Glasses of water (250 ml). */
    water: { type: Number, default: 0, min: 0 },
    /** Morning weigh-in, when the user logged one. */
    weightKg: { type: Number, min: 25, max: 300 },
    /** True when anything at all was done that day. */
    active: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false },
);

dayLogSchema.index({ userId: 1, date: 1 }, { unique: true });
dayLogSchema.index({ userId: 1, active: 1, date: -1 });

export const DayLog = model("DayLog", dayLogSchema);
