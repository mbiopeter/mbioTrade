"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useAccount } from "@/context/account-context";
import { useToast } from "@/context/toast-context";
import { disconnectGoogle } from "@/lib/google-sync";
import { resetAllMbioTradeStorage } from "@/lib/storage";

export function ResetSection() {
  const account = useAccount();
  const { toast } = useToast();
  const [armed, setArmed] = useState(false);

  const resetEverything = () => {
    if (!armed) {
      setArmed(true);
      toast({
        title: "Confirm full reset",
        message: "Select the reset button once more to clear this browser.",
        tone: "info",
      });
      return;
    }

    account.disconnect();
    disconnectGoogle();
    resetAllMbioTradeStorage();
    window.location.assign("/terminal");
  };

  return (
    <section className="card settings-section danger-zone">
      <div className="settings-title">
        <div className="settings-icon danger">
          <RotateCcw />
        </div>
        <div>
          <h2>Reset MbioTrade</h2>
          <p>Return this browser to the clean v14 factory workspace.</p>
        </div>
      </div>

      <p className="muted">
        This removes local and session data, strategy preferences, signals, journals,
        App ID, Google settings and any remembered API key. Your Deriv positions remain
        at Deriv and return after reconnection.
      </p>

      <button
        type="button"
        className="btn danger-btn"
        onClick={resetEverything}
        onBlur={() => setArmed(false)}
      >
        <RotateCcw size={16} />
        {armed ? "Confirm reset everything" : "Reset everything to default"}
      </button>
    </section>
  );
}
