/**
 * Adds the starter foods and exercises to the database in apps/api/.env.
 *   npm run seed            adds missing items only (safe to run any time)
 *   npm run seed -- --force overwrites seeded items with the code version (loses admin edits)
 */
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { seedContent } from "../src/seed/index.js";

const force = process.argv.includes("--force");

if (!env.MONGODB_URI) {
  console.error("MONGODB_URI is not set in apps/api/.env. Run npm run doctor.");
  process.exit(1);
}

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  const result = await seedContent({ force });
  for (const [name, c] of Object.entries(result)) {
    console.log(`${name.padEnd(10)} added ${c.added}, updated ${c.updated}, unchanged ${c.unchanged}`);
  }
  if (force) console.log("\n--force: seeded items were reset to the code version.");
} finally {
  await mongoose.disconnect();
}
