import { AuditLog } from "../models/auditLog.model.js";

// Records who did what. It must never break the action it describes, so a failed write is only logged.
export async function audit(req, action, target = {}, details = {}) {
  try {
    await AuditLog.create({
      actor: req.user?._id,
      actorName: req.user?.name || "system",
      actorRole: req.role || "system",
      action,
      target,
      details,
      ip: req.ip,
    });
  } catch (error) {
    console.error("Audit log write failed:", error.message);
  }
}
