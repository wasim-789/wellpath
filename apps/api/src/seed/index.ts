/**
 * Loads the starter foods and exercises into the database.
 * By default it only adds items that are missing, so admin edits (and verified values) are never lost.
 * With force, it overwrites every seeded item with the version in code.
 */
import type { Model } from "mongoose";
import { exerciseSchema, foodSchema } from "@wellpath/shared";
import { ExerciseModel } from "../models/Exercise.js";
import { FoodModel } from "../models/Food.js";
import { SEED_EXERCISES } from "./exercises.js";
import { SEED_FOODS } from "./foods.js";

export type SeedCounts = { added: number; updated: number; unchanged: number };

async function upsertAll<T extends { slug: string }>(model: Model<T>, items: readonly T[], force: boolean): Promise<SeedCounts> {
  const counts: SeedCounts = { added: 0, updated: 0, unchanged: 0 };
  for (const item of items) {
    if (force) {
      const result = await model.replaceOne({ slug: item.slug }, item, { upsert: true });
      if (result.upsertedCount) counts.added++;
      else counts.updated++;
    } else if (await model.exists({ slug: item.slug })) {
      // An update would still bump updatedAt, so existing items are not touched at all.
      counts.unchanged++;
    } else {
      await model.create(item);
      counts.added++;
    }
  }
  return counts;
}

export async function seedContent({ force = false } = {}) {
  // Refuse to write anything if the seed data itself is invalid.
  for (const f of SEED_FOODS) foodSchema.parse(f);
  for (const e of SEED_EXERCISES) exerciseSchema.parse(e);
  return {
    foods: await upsertAll(FoodModel as unknown as Model<(typeof SEED_FOODS)[number]>, SEED_FOODS, force),
    exercises: await upsertAll(ExerciseModel as unknown as Model<(typeof SEED_EXERCISES)[number]>, SEED_EXERCISES, force),
  };
}
