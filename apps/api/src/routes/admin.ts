/**
 * /api/v1/admin: content management for the admin panel. Every route needs an active admin,
 * and every change is written to the audit log.
 *
 *   GET    /foods                 all foods
 *   POST   /foods                 add a food
 *   PUT    /foods/:slug           replace a food (the slug never changes, plans will refer to it)
 *   POST   /foods/:slug/verify    mark a food's values as checked
 *   DELETE /foods/:slug           delete a food (refused while other foods are variants of it)
 *   ...the same for /exercises, without verify
 *   GET    /safety-rules          the condition rules from the engine (exercises and foods), with their effect on the library
 *   GET    /audit                 audit log, newest first (?before=<id> for the next page)
 */
import { Router } from "express";
import { isValidObjectId, mongo, type Model } from "mongoose";
import type { z } from "zod";
import { CONDITION_BLOCKS, CONDITION_FOOD_RULES, conditionNotices, isExerciseSafe, isFoodAllowed, isFoodLimited } from "@wellpath/engine";
import { CONDITIONS, EXERCISE_TYPES, type Exercise, type Food, exerciseSchema, foodSchema } from "@wellpath/shared";
import { HttpError } from "../middleware/errors.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { AuditLog } from "../models/AuditLog.js";
import { ExerciseModel } from "../models/Exercise.js";
import { FoodModel } from "../models/Food.js";
import { User } from "../models/User.js";
import { changedFields, recordAudit } from "../services/audit.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const HIDDEN = { _id: 0, __v: 0, createdAt: 0 } as const;
const isDuplicateKey = (err: unknown) => err instanceof mongo.MongoServerError && err.code === 11000;

type Slugged = { slug: string; name: string };

type ContentOptions<T extends Slugged> = {
  path: string;
  noun: string;
  model: Model<T>;
  schema: z.ZodType<T>;
  /** Extra checks before saving, such as "variantOf must point at a real food". */
  check?: (item: T) => Promise<void>;
  /** Refuse to delete when something depends on the item. */
  checkDelete?: (item: T) => Promise<void>;
  /** A clearer note than the list of changed fields, for changes that matter for safety. */
  describe?: (before: T, after: T, changed: string[]) => string;
};

/** Registers list, add, replace and delete routes for one kind of content. */
function contentRoutes<T extends Slugged>({ path, noun, model, schema, check, checkDelete, describe }: ContentOptions<T>) {
  const label = noun[0].toUpperCase() + noun.slice(1);

  const findOne = async (slug: string) => {
    const doc = await model.findOne({ slug }, HIDDEN).lean<T & { updatedAt: Date }>();
    if (!doc) throw new HttpError(404, `${label} not found`);
    return doc;
  };

  /** The stored item in schema shape, so it compares cleanly with a new version. */
  const normalise = (doc: T & { updatedAt?: Date }): T => {
    const { updatedAt: _updatedAt, ...rest } = doc;
    const parsed = schema.safeParse(rest);
    return parsed.success ? parsed.data : (rest as T);
  };

  adminRouter.get(path, async (_req, res) => {
    const items = await model.find({}, HIDDEN).sort({ name: 1 }).lean();
    res.json({ items });
  });

  adminRouter.post(path, async (req, res) => {
    const item = schema.parse(req.body);
    await check?.(item);
    try {
      await model.create(item);
    } catch (err) {
      if (isDuplicateKey(err)) throw new HttpError(409, `Another ${noun} already uses the slug "${item.slug}"`);
      throw err;
    }
    await recordAudit(req.admin!, `Added ${noun}`, item.name);
    res.status(201).json({ item: await findOne(item.slug) });
  });

  adminRouter.put(`${path}/:slug`, async (req, res) => {
    const slug = String(req.params.slug);
    const item = schema.parse(req.body);
    if (item.slug !== slug) throw new HttpError(400, "The slug cannot be changed");
    const before = normalise(await findOne(slug));
    await check?.(item);
    const changed = changedFields(before, item);
    if (changed.length) {
      const doc = await model.findOne({ slug });
      if (!doc) throw new HttpError(404, `${label} not found`);
      doc.overwrite(item);
      await doc.save();
      await recordAudit(req.admin!, `Edited ${noun}`, item.name, describe?.(before, item, changed) ?? `Changed ${changed.join(", ")}`);
    }
    res.json({ item: await findOne(slug) });
  });

  adminRouter.delete(`${path}/:slug`, async (req, res) => {
    const item = normalise(await findOne(String(req.params.slug)));
    await checkDelete?.(item);
    await model.deleteOne({ slug: item.slug });
    await recordAudit(req.admin!, `Deleted ${noun}`, item.name);
    res.status(204).end();
  });
}

contentRoutes<Food>({
  path: "/foods",
  noun: "food",
  model: FoodModel as unknown as Model<Food>,
  schema: foodSchema as z.ZodType<Food>,
  async check(food) {
    if (!food.variantOf) return;
    if (food.variantOf === food.slug) throw new HttpError(400, "A food cannot be a variant of itself");
    if (!(await FoodModel.exists({ slug: food.variantOf }))) throw new HttpError(400, `There is no food with the slug "${food.variantOf}"`);
  },
  async checkDelete(food) {
    const variants = await FoodModel.find({ variantOf: food.slug }, { name: 1 }).lean();
    if (variants.length) {
      throw new HttpError(409, `These foods are versions of ${food.name}: ${variants.map((v) => v.name).join(", ")}. Change or delete them first.`);
    }
  },
  describe(before, after, changed) {
    if (changed.length === 1 && changed[0] === "verified") return after.verified ? "Marked verified" : "Marked unverified";
    return `Changed ${changed.join(", ")}`;
  },
});

contentRoutes<Exercise>({
  path: "/exercises",
  noun: "exercise",
  model: ExerciseModel as unknown as Model<Exercise>,
  schema: exerciseSchema as z.ZodType<Exercise>,
  // Safety tags decide who sees an exercise, so the log spells out exactly what changed.
  describe(before, after, changed) {
    const notes = [`Changed ${changed.join(", ")}`];
    const removed = before.loads.filter((l) => !after.loads.includes(l));
    const added = after.loads.filter((l) => !before.loads.includes(l));
    if (removed.length) notes.push(`safety tags removed: ${removed.join(", ")}`);
    if (added.length) notes.push(`safety tags added: ${added.join(", ")}`);
    return notes.join("; ");
  },
});

adminRouter.post("/foods/:slug/verify", async (req, res) => {
  const slug = String(req.params.slug);
  const food = await FoodModel.findOneAndUpdate({ slug, verified: false }, { verified: true }, { projection: HIDDEN, new: true }).lean();
  if (food) await recordAudit(req.admin!, "Verified food", food.name);
  else if (!(await FoodModel.exists({ slug }))) throw new HttpError(404, "Food not found");
  res.json({ item: await FoodModel.findOne({ slug }, HIDDEN).lean() });
});

/** The engine's rules, read-only, with how they affect the current exercise library and users. */
adminRouter.get("/safety-rules", async (_req, res) => {
  const exercises = await ExerciseModel.find({}, { slug: 1, name: 1, type: 1, level: 1, loads: 1 }).sort({ name: 1 }).lean();
  const foods = await FoodModel.find({}, { _id: 0, slug: 1, name: 1, tags: 1 }).sort({ name: 1 }).lean<Pick<Food, "slug" | "name" | "tags">[]>();
  const pick = (list: typeof foods) => list.map((f) => ({ slug: f.slug, name: f.name }));
  const rules = await Promise.all(
    CONDITIONS.map(async (condition) => {
      const safe = exercises.filter((e) => isExerciseSafe(e, [condition]));
      const beginnerLeft = Object.fromEntries(
        EXERCISE_TYPES.map((t) => [t, safe.filter((e) => e.level === "beginner" && e.type === t).length]),
      );
      return {
        condition,
        blockedLoads: CONDITION_BLOCKS[condition],
        notice: conditionNotices([condition])[0],
        blockedExercises: exercises.filter((e) => !isExerciseSafe(e, [condition])).map((e) => ({ slug: e.slug, name: e.name })),
        beginnerLeft,
        avoidTags: CONDITION_FOOD_RULES[condition].avoid,
        limitTags: CONDITION_FOOD_RULES[condition].limit,
        blockedFoods: pick(foods.filter((f) => !isFoodAllowed(f, [condition]))),
        limitedFoods: pick(foods.filter((f) => isFoodAllowed(f, [condition]) && isFoodLimited(f, [condition]))),
        usersAffected: await User.countDocuments({ "profile.conditions": condition }),
      };
    }),
  );
  res.json({ rules, exerciseCount: exercises.length });
});

const PAGE_SIZE = 50;

adminRouter.get("/audit", async (req, res) => {
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  if (before !== undefined && !isValidObjectId(before)) throw new HttpError(400, "Invalid cursor");
  const docs = await AuditLog.find(before ? { _id: { $lt: before } } : {})
    .sort({ _id: -1 })
    .limit(PAGE_SIZE + 1)
    .lean();
  const page = docs.slice(0, PAGE_SIZE);
  res.json({
    entries: page.map((e) => ({ id: String(e._id), at: e.at, actor: e.actorEmail, action: e.action, target: e.target, detail: e.detail ?? null })),
    next: docs.length > PAGE_SIZE ? String(page[page.length - 1]._id) : null,
  });
});
