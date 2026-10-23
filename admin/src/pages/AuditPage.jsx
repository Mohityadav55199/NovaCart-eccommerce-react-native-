import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "../lib/api";
import { describeError, ERROR_HINT } from "../lib/errors";

const FILTERS = [
  { id: "", label: "Everything" },
  { id: "order", label: "Orders and refunds" },
  { id: "user", label: "Roles" },
  { id: "product", label: "Products" },
  { id: "vendor", label: "Vendors" },
];

const LABELS = {
  "order.refund": "Refunded an order",
  "order.refund.request": "Asked for a refund approval",
  "order.refund.approve": "Approved a refund",
  "order.refund.reject": "Rejected a refund",
  "order.status": "Changed an order's status",
  "order.item.status": "Changed an item's status",
  "user.roles": "Changed roles",
  "product.approve": "Approved a product",
  "product.reject": "Rejected a product",
  "product.delete": "Deleted a product",
  "vendor.pause": "Paused a vendor",
  "vendor.resume": "Resumed a vendor",
};

const formatTime = (value) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const describeDetails = (entry) => {
  const d = entry.details || {};
  const parts = [];
  if (d.amount !== undefined) parts.push(`$${Number(d.amount).toFixed(2)}`);
  if (d.status) parts.push(d.status);
  if (d.before && d.after) parts.push(`${d.before.join(", ")} to ${d.after.join(", ")}`);
  if (d.reason || d.note) parts.push(`"${d.reason || d.note}"`);
  return parts.join(" · ");
};

// every refund, role change and review, with who did it and when (admins only)
function AuditPage() {
  const [filter, setFilter] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["audit", filter],
    queryFn: () => auditApi.getAll({ action: filter || undefined, limit: 150 }),
  });

  const entries = data?.entries || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-base-content/70">Who did what, and when. Entries cannot be edited.</p>
      </div>

      <div className="tabs tabs-box w-fit max-w-full overflow-x-auto">
        {FILTERS.map(({ id, label }) => (
          <button key={id} className={`tab ${filter === id ? "tab-active" : ""}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          {isError ? (
            <div className="text-center py-12 text-error">Failed to load the audit log ({describeError(error)}). {ERROR_HINT}</div>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-base-content/60">Nothing recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>What</th>
                    <th>On</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry._id}>
                      <td className="whitespace-nowrap text-sm opacity-70">{formatTime(entry.at)}</td>
                      <td>
                        <div className="font-medium">{entry.actorName}</div>
                        <div className="text-xs opacity-60 capitalize">{entry.actorRole}</div>
                      </td>
                      <td>{LABELS[entry.action] || entry.action}</td>
                      <td className="text-sm">
                        {entry.target?.type}
                        {entry.target?.label ? `: ${entry.target.label}` : entry.target?.id ? ` #${String(entry.target.id).slice(-8).toUpperCase()}` : ""}
                      </td>
                      <td className="text-sm opacity-80">{describeDetails(entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuditPage;
