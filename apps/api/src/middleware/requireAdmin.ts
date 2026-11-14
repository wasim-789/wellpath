/**
 * Lets only active admins through, and exposes them as req.admin.
 * The token's role claim is not enough on its own: an admin removed with make-admin --remove
 * would keep a valid token for up to 15 minutes, so the database is checked on every request.
 */
import type { RequestHandler } from "express";
import { User } from "../models/User.js";
import type { Actor } from "../services/audit.js";
import { HttpError } from "./errors.js";
import { requireAuth } from "./requireAuth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: Actor;
    }
  }
}

const checkAdmin: RequestHandler = async (req, _res, next) => {
  if (req.auth?.role !== "admin") throw new HttpError(403, "Admins only");
  const user = await User.findById(req.auth.userId, { email: 1, role: 1, status: 1 });
  if (!user || user.status !== "active") throw new HttpError(401, "Not signed in");
  if (user.role !== "admin") throw new HttpError(403, "Admins only");
  req.admin = { id: user._id, email: user.email };
  next();
};

export const requireAdmin: RequestHandler[] = [requireAuth, checkAdmin];
