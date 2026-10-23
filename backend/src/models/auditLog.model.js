import mongoose from "mongoose";

// Who did what, to what, and when. Written for every money or permission change and never edited.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String, default: "system" },
    actorRole: { type: String, default: "system" },
    action: { type: String, required: true }, // e.g. "order.refund", "user.role", "product.review"
    target: {
      type: { type: String }, // "order" | "user" | "product"
      id: String,
      label: String,
    },
    details: { type: mongoose.Schema.Types.Mixed },
    ip: String,
  },
  { timestamps: { createdAt: "at", updatedAt: false } }
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ action: 1, at: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
