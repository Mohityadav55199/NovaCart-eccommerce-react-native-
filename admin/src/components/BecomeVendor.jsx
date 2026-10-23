import { useState } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StoreIcon } from "lucide-react";
import { userApi } from "../lib/api";
import { describeError } from "../lib/errors";

// anyone can start selling: one field, and the account becomes a vendor right away
function BecomeVendor({ me, setMode }) {
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const [storeName, setStoreName] = useState(`${me.name}'s Store`.slice(0, 60));

  const mutation = useMutation({
    mutationFn: () => userApi.becomeVendor(storeName.trim()),
    // awaited, so the button keeps spinning until the gate knows the new role and opens the dashboard
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const valid = storeName.trim().length >= 2;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        className="card bg-base-100 shadow-xl max-w-md w-full"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) mutation.mutate();
        }}
      >
        <div className="card-body gap-3">
          <StoreIcon className="size-12 text-primary mx-auto" />
          <h1 className="card-title text-2xl justify-center">Start selling on NovaCart</h1>
          <p className="text-center text-base-content/70 text-sm">
            You are signed in as <b>{me.email}</b>. Create your store to add products, manage orders and add tracking.
            You can still shop as a customer with the same account.
          </p>

          <label className="form-control w-full">
            <span className="label-text mb-1">Store name</span>
            <input
              className="input input-bordered w-full"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </label>

          {mutation.isError && <p className="text-error text-sm">{describeError(mutation.error)}</p>}

          <button className="btn btn-primary" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? <span className="loading loading-spinner loading-sm" /> : "Become a vendor"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("customer")}>
            Not now, continue as a customer
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => signOut({ redirectUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}

export default BecomeVendor;
