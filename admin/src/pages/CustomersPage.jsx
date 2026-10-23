import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { describeError, ERROR_HINT } from "../lib/errors";
import Avatar from "../components/Avatar";
import { customerApi } from "../lib/api";
import { useRole } from "../lib/role";
import { useSensitive, wasCancelled } from "../lib/reverify";
import { formatDate } from "../lib/utils";

function CustomersPage() {
  const { can } = useRole();
  const canManage = can("customers:manage");
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["customers"],
    queryFn: customerApi.getAll,
  });

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };
  const fail = (err) => {
    if (!wasCancelled(err)) alert(describeError(err));
  };

  // role changes ask Clerk to re-confirm the admin's identity when the server requires it
  const setRolesCall = useSensitive(customerApi.setRoles);
  const rolesMutation = useMutation({ mutationFn: setRolesCall, onSuccess: done, onError: fail });
  const pauseMutation = useMutation({ mutationFn: customerApi.pause, onSuccess: done, onError: fail });

  const customers = data?.customers || [];

  const toggle = (customer, role, enabled) => {
    const message =
      role === "vendor"
        ? enabled
          ? `Make ${customer.name} a vendor? They can sell their own products and manage their orders.`
          : `Remove ${customer.name}'s vendor role? Their products come off sale and they cannot become a vendor again by themselves.`
        : enabled
          ? `Give ${customer.name} the support role? They can see all orders and customers and refund up to the support limit.`
          : `Remove ${customer.name}'s support role?`;
    if (window.confirm(message)) rolesMutation.mutate({ id: customer._id, [role]: enabled });
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-base-content/70 mt-1">
          {customers.length} {customers.length === 1 ? "person" : "people"} registered
        </p>
      </div>

      {/* CUSTOMERS TABLE */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          {isError ? (
            <div className="text-center py-12 text-error">Failed to load customers ({describeError(error)}). {ERROR_HINT}</div>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12 text-base-content/60">
              <p className="text-xl font-semibold mb-2">No customers yet</p>
              <p className="text-sm">Customers will appear here once they sign up</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Addresses</th>
                    <th>Joined Date</th>
                  </tr>
                </thead>

                <tbody>
                  {customers.map((customer) => {
                    const isAdmin = customer.roles?.includes("admin");
                    const isVendor = customer.roles?.includes("vendor");
                    const isSupport = customer.roles?.includes("support");
                    const paused = customer.vendorProfile?.paused;

                    return (
                      <tr key={customer._id}>
                        <td className="flex items-center gap-3">
                          <Avatar src={customer.imageUrl} name={customer.name} />
                          <div>
                            <div className="font-semibold">{customer.name}</div>
                            {isVendor && customer.vendorProfile?.storeName && (
                              <div className="text-xs opacity-60">{customer.vendorProfile.storeName}</div>
                            )}
                          </div>
                        </td>

                        <td>{customer.email}</td>

                        <td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isAdmin && <span className="badge badge-primary">Admin</span>}
                            {isSupport && <span className="badge badge-secondary">Support</span>}
                            {isVendor && <span className={`badge ${paused ? "badge-warning" : "badge-accent"}`}>{paused ? "Vendor (paused)" : "Vendor"}</span>}
                            {!isAdmin && !isSupport && !isVendor && <span className="badge badge-ghost">Customer</span>}
                          </div>

                          {canManage && !isAdmin && (
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="toggle toggle-xs"
                                  checked={!!isVendor}
                                  disabled={rolesMutation.isPending}
                                  onChange={(e) => toggle(customer, "vendor", e.target.checked)}
                                />
                                Vendor
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="toggle toggle-xs"
                                  checked={!!isSupport}
                                  disabled={rolesMutation.isPending}
                                  onChange={(e) => toggle(customer, "support", e.target.checked)}
                                />
                                Support
                              </label>
                              {isVendor && (
                                <button
                                  className="btn btn-xs"
                                  disabled={pauseMutation.isPending}
                                  onClick={() =>
                                    window.confirm(
                                      paused
                                        ? `Let ${customer.name} sell again? Their products go back on sale.`
                                        : `Pause ${customer.name}'s selling? Their products come off sale and they cannot add new ones. Open orders can still be shipped.`
                                    ) && pauseMutation.mutate({ id: customer._id, paused: !paused })
                                  }
                                >
                                  {paused ? "Resume selling" : "Pause selling"}
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        <td>
                          <div className="badge badge-ghost">{customer.addressCount || 0} address(es)</div>
                        </td>

                        <td>
                          <span className="text-sm opacity-60">{formatDate(customer.createdAt)}</span>
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
    </div>
  );
}
export default CustomersPage;
