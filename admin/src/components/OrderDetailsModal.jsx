import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { orderApi } from "../lib/api";
import { describeError } from "../lib/errors";
import { useRole } from "../lib/role";
import { capitalizeText, formatDate, getOrderStatusBadge } from "../lib/utils";

const FLOW = ["pending", "shipped", "delivered"];

// statuses an item can be moved to: admins may set any, vendors only move forward
const statusOptions = (current, role) =>
  role === "admin" ? FLOW : FLOW.filter((status) => FLOW.indexOf(status) >= FLOW.indexOf(current));

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

function ItemRow({ order, item, canEdit }) {
  const { role } = useRole();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState(item.status);
  const [carrier, setCarrier] = useState(item.carrier || "");
  const [trackingNumber, setTrackingNumber] = useState(item.trackingNumber || "");

  const mutation = useMutation({
    mutationFn: orderApi.updateItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (error) => alert(describeError(error)),
  });

  const dirty =
    status !== item.status ||
    carrier !== (item.carrier || "") ||
    trackingNumber !== (item.trackingNumber || "");

  return (
    <div className="rounded-xl bg-base-200 p-3">
      <div className="flex items-center gap-3">
        {item.image ? (
          <img src={item.image} alt={item.name} className="size-14 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="size-14 rounded-lg bg-base-300 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{item.name}</p>
          <p className="text-sm opacity-70">
            {item.quantity} × ${item.price.toFixed(2)} = ${(item.quantity * item.price).toFixed(2)}
          </p>
        </div>
        <div className={`badge ${getOrderStatusBadge(item.status)} whitespace-nowrap`}>
          {capitalizeText(item.status)}
        </div>
      </div>

      {canEdit && item.status !== "cancelled" && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <select
            className="select select-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={mutation.isPending}
          >
            {statusOptions(item.status, role).map((option) => (
              <option key={option} value={option}>
                {capitalizeText(option)}
              </option>
            ))}
          </select>
          <input
            className="input input-sm"
            placeholder="Carrier (e.g. DHL)"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            maxLength={60}
          />
          <input
            className="input input-sm"
            placeholder="Tracking number"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            maxLength={80}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={!dirty || mutation.isPending}
            onClick={() =>
              mutation.mutate({ orderId: order._id, itemId: item._id, status, carrier, trackingNumber })
            }
          >
            {mutation.isPending ? <span className="loading loading-spinner loading-xs" /> : "Save"}
          </button>
        </div>
      )}

      {!canEdit && item.trackingNumber && (
        <p className="mt-2 text-sm opacity-70">
          {item.carrier ? `${item.carrier}: ` : "Tracking: "}
          {item.trackingNumber}
        </p>
      )}
    </div>
  );
}

function OrderDetailsModal({ order, onClose }) {
  const { role } = useRole();
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: orderApi.cancel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => alert(describeError(error)),
  });

  const bulkMutation = useMutation({
    mutationFn: orderApi.updateStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (error) => alert(describeError(error)),
  });

  const handleCancel = () => {
    const reason = window.prompt(
      `Cancel this order and refund $${order.totalPrice.toFixed(2)} to the customer?\n\nOptional reason (the customer sees it):`,
      ""
    );
    if (reason === null) return; // pressed Cancel in the prompt
    cancelMutation.mutate({ orderId: order._id, reason });
  };

  const canEdit = order.status !== "cancelled";
  const pricing = order.pricing;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-3xl">
        <button className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" onClick={onClose} aria-label="Close">
          <XIcon className="size-4" />
        </button>

        <div className="flex flex-wrap items-center gap-3 pr-8">
          <h3 className="font-bold text-xl">Order #{order._id.slice(-8).toUpperCase()}</h3>
          <div className={`badge ${getOrderStatusBadge(order.status)}`}>{capitalizeText(order.status)}</div>
          <span className="text-sm opacity-60">{formatDateTime(order.createdAt)}</span>
        </div>

        {/* CUSTOMER */}
        <div className="mt-4 rounded-xl bg-base-200 p-3 text-sm">
          <p className="font-semibold">{order.shippingAddress.fullName}</p>
          <p className="opacity-80">
            {order.shippingAddress.streetAddress}, {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
            {order.shippingAddress.zipCode}
          </p>
          <p className="opacity-80">{order.shippingAddress.phoneNumber}</p>
          {role === "admin" && order.user?.email && <p className="opacity-60">{order.user.email}</p>}
        </div>

        {/* CANCELLATION */}
        {order.status === "cancelled" && order.cancellation && (
          <div role="alert" className="alert alert-error mt-4 text-sm">
            <span>
              Cancelled by {order.cancellation.by} on {formatDate(order.cancellation.at)}
              {order.cancellation.reason ? `: "${order.cancellation.reason}"` : ""}.{" "}
              {order.cancellation.refundAmount > 0 &&
                `$${order.cancellation.refundAmount.toFixed(2)} was refunded.`}
            </span>
          </div>
        )}

        {/* ITEMS */}
        <div className="mt-4 space-y-2">
          <h4 className="font-semibold">Items</h4>
          {order.orderItems.map((item) => (
            <ItemRow key={item._id} order={order} item={item} canEdit={canEdit} />
          ))}
          {role === "vendor" && (
            <p className="text-xs opacity-60">You only see the items you sell. Other items in this order belong to other sellers.</p>
          )}
        </div>

        {/* TOTALS */}
        <div className="mt-4 text-sm space-y-1">
          {role === "admin" && pricing?.subtotal !== undefined ? (
            <>
              <div className="flex justify-between"><span className="opacity-70">Subtotal</span><span>${pricing.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between">
                <span className="opacity-70">Shipping</span>
                <span>{pricing.shipping === 0 ? "FREE" : `$${pricing.shipping.toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between"><span className="opacity-70">Tax</span><span>${pricing.tax.toFixed(2)}</span></div>
            </>
          ) : null}
          <div className="flex justify-between font-bold text-base">
            <span>{role === "vendor" ? "Your items" : "Total"}</span>
            <span>${(role === "vendor" ? order.myTotal : order.totalPrice).toFixed(2)}</span>
          </div>
        </div>

        {/* TIMELINE */}
        {order.statusHistory?.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">Timeline</h4>
            <ul className="steps steps-vertical text-sm w-full">
              {[...order.statusHistory].reverse().map((event, index) => (
                <li key={index} className="step step-primary justify-start text-left">
                  <div>
                    <p>{event.note || capitalizeText(event.status)}</p>
                    <p className="text-xs opacity-60">
                      {formatDateTime(event.at)} · {event.by}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ADMIN ACTIONS */}
        {role === "admin" && canEdit && (
          <div className="modal-action justify-between flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm">
              Set all items to
              <select
                className="select select-sm"
                value=""
                disabled={bulkMutation.isPending}
                onChange={(e) => e.target.value && bulkMutation.mutate({ orderId: order._id, status: e.target.value })}
              >
                <option value="">choose…</option>
                {FLOW.map((status) => (
                  <option key={status} value={status}>
                    {capitalizeText(status)}
                  </option>
                ))}
              </select>
            </label>

            {order.status === "pending" ? (
              <button className="btn btn-error btn-sm" onClick={handleCancel} disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? <span className="loading loading-spinner loading-xs" /> : "Cancel & refund"}
              </button>
            ) : (
              <span className="text-xs opacity-60">Shipped orders can no longer be cancelled</span>
            )}
          </div>
        )}
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}

export default OrderDetailsModal;
