/**
 * A meal the user swapped for one of the planner's alternatives. The plan itself is never stored:
 * it is rebuilt on each request and these swaps are put back in. Cleared when the profile changes.
 */
import { Schema, model } from "mongoose";
import { MEAL_SLOTS } from "@wellpath/shared";

const mealSwapSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Monday of the plan week, YYYY-MM-DD. */
    weekStart: { type: String, required: true },
    day: { type: Number, required: true, min: 0, max: 6 },
    slot: { type: String, enum: MEAL_SLOTS, required: true },
    items: {
      type: [new Schema({ slug: { type: String, required: true }, portionIndex: { type: Number, required: true }, quantity: { type: Number, required: true } }, { _id: false })],
      required: true,
    },
  },
  { timestamps: true },
);
mealSwapSchema.index({ userId: 1, weekStart: 1, day: 1, slot: 1 }, { unique: true });

export const MealSwap = model("MealSwap", mealSwapSchema);
