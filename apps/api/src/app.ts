/**
 * Builds the Express app (without starting it), so tests can use it directly.
 */
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { adminRouter } from "./routes/admin.js";
import { adminAuthRouter, authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { planRouter } from "./routes/plan.js";
import { profileRouter } from "./routes/profile.js";
import { errorHandler, notFound } from "./middleware/errors.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(helmet()); // secure HTTP headers
  app.use(cors({ origin: env.corsOrigins, credentials: true })); // only our frontends
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 100 })); // 100 requests/min per IP

  app.use("/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  // notFound here keeps unknown /admin/auth paths a 404 instead of falling through to the admin guard.
  app.use("/api/v1/admin/auth", adminAuthRouter, notFound);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/plan", planRouter);
  app.use("/api/v1/profile", profileRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
