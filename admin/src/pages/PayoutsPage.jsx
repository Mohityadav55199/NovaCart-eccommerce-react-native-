import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, WalletIcon } from "lucide-react";
import { vendorApi } from "../lib/api";
import { describeError } from "../lib/errors";
import { formatDate } from "../lib/utils";

const STATUS = {
  paid: { label: "Paid", badge: "badge-success" },
  waiting_for_account: { label: "Waiting for payout setup", badge: "badge-warning" },
  processing: { label: "Processing", badge: "badge-info" },
  failed: { label: "Failed, will retry", badge: "badge-error" },
  none: { label: "Pending", badge: "badge-ghost" },
};

const money = (value) => `$${(value || 0).toFixed(2)}`;

// vendors: set up Stripe payouts and see what they earned. Admins: the platform's totals.
function PayoutsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["payouts"],
    queryFn: vendorApi.payouts,
  });

  const connect = useMutation({
    mutationFn: vendorApi.connect,
    // Stripe hosts the setup form: send the person there
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => alert(describeError(err)),
  });

  const returned = new URLSearchParams(window.location.search).get("connected");
  const isPlatform = data?.scope === "platform";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{isPlatform ? "Payouts overview" : "Payouts"}</h1>
        <p className="text-base-content/70">
          {isPlatform
            ? "What vendors have been paid and what the platform kept."
            : `You receive ${100 - (data?.feePercent ?? 10)}% of each delivered item. The store keeps ${data?.feePercent ?? 10}%.`}
        </p>
      </div>

      {isLoading && <span className="loading loading-spinner loading-lg" />}
      {isError && <div role="alert" className="alert alert-error"><span>Failed to load payouts ({describeError(error)}).</span></div>}

      {data && (
        <>
          {!isPlatform && (
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">
                  <WalletIcon className="size-5" /> Payout account
                </h2>

                {data.account.payoutsEnabled ? (
                  <p className="flex items-center gap-2 text-success">
                    <CheckCircle2Icon className="size-5" /> Connected. Your share is paid automatically when an item is delivered.
                  </p>
                ) : (
                  <>
                    <p className="text-base-content/70">
                      {data.account.connected
                        ? "Your Stripe setup is not finished yet. Finish it to receive money."
                        : "Connect a bank account through Stripe to get paid. It takes a few minutes."}
                      {returned && !data.account.connected ? " (If you just returned from Stripe, refresh in a moment.)" : ""}
                    </p>
                    <div className="card-actions">
                      <button className="btn btn-primary" onClick={() => connect.mutate()} disabled={connect.isPending}>
                        {connect.isPending ? <span className="loading loading-spinner loading-sm" /> : data.account.connected ? "Continue setup" : "Set up payouts"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
            <div className="stat">
              <div className="stat-title">{isPlatform ? "Paid to vendors" : "Paid to you"}</div>
              <div className="stat-value text-success">{money(data.totals.paid)}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Waiting</div>
              <div className="stat-value">{money(data.totals.waiting)}</div>
              <div className="stat-desc">{isPlatform ? "Delivered, not paid yet" : "Delivered, paid once your account is ready"}</div>
            </div>
            {data.totals.failed > 0 && (
              <div className="stat">
                <div className="stat-title">Failed</div>
                <div className="stat-value text-error">{money(data.totals.failed)}</div>
              </div>
            )}
            {isPlatform && (
              <div className="stat">
                <div className="stat-title">Platform fees kept</div>
                <div className="stat-value">{money(data.totals.platformFees)}</div>
              </div>
            )}
          </div>

          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Recent deliveries</h2>
              {data.recent.length === 0 ? (
                <p className="text-base-content/60">Nothing delivered yet. Earnings appear here once an item is delivered.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Sold for</th>
                        <th>{isPlatform ? "Vendor share" : "Your share"}</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((row, index) => {
                        const status = STATUS[row.status] || STATUS.none;
                        return (
                          <tr key={`${row.orderId}-${index}`}>
                            <td>
                              {row.name} × {row.quantity}
                              <div className="text-xs opacity-60">#{String(row.orderId).slice(-8).toUpperCase()}</div>
                            </td>
                            <td>{money(row.gross)}</td>
                            <td>{row.net === null ? "-" : money(row.net)}</td>
                            <td>
                              <span className={`badge ${status.badge} h-auto py-1 whitespace-nowrap`}>{status.label}</span>
                              {row.error && <div className="text-xs text-error mt-1">{row.error}</div>}
                            </td>
                            <td className="text-sm opacity-60">{row.at ? formatDate(row.at) : ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PayoutsPage;
