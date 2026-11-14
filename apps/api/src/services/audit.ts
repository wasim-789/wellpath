/** Writing to the admin audit log. */
import type { Types } from "mongoose";
import { AuditLog } from "../models/AuditLog.js";

export type Actor = { id: Types.ObjectId | string; email: string };

export async function recordAudit(actor: Actor, action: string, target: string, detail?: string): Promise<void> {
  await AuditLog.create({ actorId: actor.id, actorEmail: actor.email, action, target, detail: detail || undefined });
}

/** Top-level fields whose values differ, for the "changed: ..." note. */
export function changedFields<T extends object>(before: T, after: T): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as (keyof T)[]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(String);
}
