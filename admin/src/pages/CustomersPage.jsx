import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { describeError, ERROR_HINT } from "../lib/errors";
import Avatar from "../components/Avatar";
import { customerApi } from "../lib/api";
import { formatDate } from "../lib/utils";

function CustomersPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["customers"],
    queryFn: customerApi.getAll,
  });

  const queryClient = useQueryClient();
  const roleMutation = useMutation({
    mutationFn: customerApi.setRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
    onError: (err) => alert(describeError(err)),
  });

  const customers = data?.customers || [];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-base-content/70 mt-1">
          {customers.length} {customers.length === 1 ? "customer" : "customers"} registered
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
                    <th>Role</th>
                    <th>Addresses</th>
                    <th>Wishlist</th>
                    <th>Joined Date</th>
                  </tr>
                </thead>

                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer._id}>
                      <td className="flex items-center gap-3">
                        <Avatar src={customer.imageUrl} name={customer.name} />
                        <div className="font-semibold">{customer.name}</div>
                      </td>

                      <td>{customer.email}</td>
                      <td>
                        {customer.role === "admin" ? (
                          <div className="badge badge-primary">Admin</div>
                        ) : (
                          <select
                            className="select select-sm"
                            value={customer.role}
                            disabled={roleMutation.isPending}
                            onChange={(e) => {
                              const role = e.target.value;
                              const message =
                                role === "vendor"
                                  ? `Make ${customer.name} a vendor? They will be able to manage their own products and orders in this admin site.`
                                  : `Make ${customer.name} a regular customer? They will lose access to this admin site.`;
                              if (window.confirm(message)) roleMutation.mutate({ id: customer._id, role });
                            }}
                          >
                            <option value="customer">Customer</option>
                            <option value="vendor">Vendor</option>
                          </select>
                        )}
                      </td>

                      <td>
                        <div className="badge badge-ghost">
                          {customer.addresses?.length || 0} address(es)
                        </div>
                      </td>

                      <td>
                        <div className="badge badge-ghost">
                          {customer.wishlist?.length || 0} item(s)
                        </div>
                      </td>

                      <td>
                        <span className="text-sm opacity-60">{formatDate(customer.createdAt)}</span>
                      </td>
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
export default CustomersPage;
