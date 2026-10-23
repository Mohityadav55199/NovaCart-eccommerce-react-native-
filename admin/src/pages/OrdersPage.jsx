import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { orderApi } from "../lib/api";
import { describeError, ERROR_HINT } from "../lib/errors";
import { useRole } from "../lib/role";
import { capitalizeText, formatDate, getOrderStatusBadge } from "../lib/utils";
import OrderDetailsModal from "../components/OrderDetailsModal";

const FILTERS = ["all", "pending", "shipped", "delivered", "cancelled"];

function OrdersPage() {
  const { role } = useRole();
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);

  const { data: ordersData, isLoading, isError, error } = useQuery({
    queryKey: ["orders"],
    queryFn: orderApi.getAll,
  });

  const allOrders = ordersData?.orders || [];
  const orders = filter === "all" ? allOrders : allOrders.filter((order) => order.status === filter);

  // read the open order from the list so it refreshes after every change
  const selectedOrder = allOrders.find((order) => order._id === selectedId);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-base-content/70">
          {role === "vendor"
            ? "Orders containing your products. Add tracking when you ship."
            : "Track, fulfil and cancel customer orders"}
        </p>
      </div>

      {/* FILTERS */}
      <div className="tabs tabs-box w-fit max-w-full overflow-x-auto">
        {FILTERS.map((name) => (
          <button
            key={name}
            className={`tab ${filter === name ? "tab-active" : ""}`}
            onClick={() => setFilter(name)}
          >
            {capitalizeText(name)}
            {name !== "all" && (
              <span className="ml-1 opacity-60">
                {allOrders.filter((order) => order.status === name).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ORDERS TABLE */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          {isError ? (
            <div className="text-center py-12 text-error">Failed to load orders ({describeError(error)}). {ERROR_HINT}</div>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-base-content/60">
              <p className="text-xl font-semibold mb-2">
                {filter === "all" ? "No orders yet" : `No ${filter} orders`}
              </p>
              <p className="text-sm">Orders will appear here once customers make purchases</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>{role === "vendor" ? "Your total" : "Total"}</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {orders.map((order) => {
                    const totalQuantity = order.orderItems.reduce((sum, item) => sum + item.quantity, 0);

                    return (
                      <tr key={order._id} className="hover cursor-pointer" onClick={() => setSelectedId(order._id)}>
                        <td>
                          <span className="font-medium">#{order._id.slice(-8).toUpperCase()}</span>
                        </td>

                        <td>
                          <div className="font-medium">{order.shippingAddress.fullName}</div>
                          <div className="text-sm opacity-60">
                            {order.shippingAddress.city}, {order.shippingAddress.state}
                          </div>
                        </td>

                        <td>
                          <div className="font-medium">{totalQuantity} items</div>
                          <div className="text-sm opacity-60">
                            {order.orderItems[0]?.name}
                            {order.orderItems.length > 1 && ` +${order.orderItems.length - 1} more`}
                          </div>
                        </td>

                        <td>
                          <span className="font-semibold">
                            ${(order.myTotal ?? order.totalPrice).toFixed(2)}
                          </span>
                        </td>

                        <td>
                          <div className={`badge ${getOrderStatusBadge(order.status)}`}>
                            {capitalizeText(order.status)}
                          </div>
                        </td>

                        <td>
                          <span className="text-sm opacity-60">{formatDate(order.createdAt)}</span>
                        </td>

                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(order._id);
                            }}
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedOrder && <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
export default OrdersPage;
