/**
 * One admin action: who did what to which item.
 * The actor's email is copied in, so the log still reads well after roles change.
 * Entries are never edited. When an admin deletes their account, their email is replaced (see services/accounts).
 */
import { Schema, model, type InferSchemaType } from "mongoose";

const auditLogSchema = new Schema({
  at: { type: Date, required: true, default: Date.now, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  actorEmail: { type: String, required: true },
  action: { type: String, required: true },
  target: { type: String, required: true },
  /** Extra context, such as which fields changed. */
  detail: { type: String },
});

export type AuditLogEntry = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model("AuditLog", auditLogSchema);
