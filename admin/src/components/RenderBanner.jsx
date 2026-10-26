import { useState } from "react";
import { CloudLightningIcon, XIcon } from "lucide-react";

export default function RenderBanner({ dismissible = false, className = "" }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="status"
      className={`rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200 flex items-start gap-2.5 shadow-sm ${className}`}
    >
      <CloudLightningIcon className="size-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 leading-relaxed">
        <span className="font-semibold text-amber-300">Render Free Tier:</span> The API automatically
        spins down after 15 minutes of inactivity to conserve free instance hours. The first request may take
        ~30–50 seconds while the server boots up.
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-amber-400/70 hover:text-amber-200 p-0.5 rounded transition"
          aria-label="Dismiss banner"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
