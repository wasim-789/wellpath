/** A food the planner can use. Shape matches foodSchema in @wellpath/shared. */
import { Schema, model } from "mongoose";
import { DIET_TYPES, FOOD_CATEGORIES, MEAL_SLOTS, PORTION_UNITS } from "@wellpath/shared";

const nutrients = {
  kcal: { type: Number, required: true },
  proteinG: { type: Number, required: true },
  carbsG: { type: Number, required: true },
  fatG: { type: Number, required: true },
  fiberG: { type: Number, required: true },
};

const foodSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    nameRoman: { type: String, trim: true },
    category: { type: String, enum: FOOD_CATEGORIES, required: true },
    dietCategory: { type: String, enum: DIET_TYPES, required: true, index: true },
    mealSlots: { type: [{ type: String, enum: MEAL_SLOTS }], required: true },
    per100g: { type: new Schema(nutrients, { _id: false }), required: true },
    portions: {
      type: [new Schema({ unit: { type: String, enum: PORTION_UNITS, required: true }, label: { type: String, required: true }, grams: { type: Number, required: true } }, { _id: false })],
      required: true,
    },
    variantOf: { type: String },
    treat: { type: Boolean, required: true },
    source: { type: new Schema({ name: { type: String, required: true }, note: String }, { _id: false }), required: true },
    verified: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

export const FoodModel = model("Food", foodSchema);
