"use client";

import { useEffect, useState } from "react";
import { analyticsMeasurementId, isAnalyticsDisabled, updateAnalyticsPreference } from "@/lib/analytics";

export function AnalyticsPreferences() {
  const [disabled, setDisabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => setDisabled(isAnalyticsDisabled()), []);

  if (!analyticsMeasurementId()) return <p>Google Analytics is not configured for this environment.</p>;
  return <div data-analytics-ignore="true" className="mbiotraders-privacy-control">
    <p>Analytics on this browser: <strong>{disabled === null ? "Checking" : disabled ? "Off" : "On"}</strong></p>
    <button type="button" disabled={disabled === null} onClick={() => {
      if (disabled === null) return;
      if (!updateAnalyticsPreference(!disabled)) {
        setMessage("Your browser did not allow saving this preference. Check its privacy settings.");
        return;
      }
      setDisabled(!disabled);
      setMessage("Preference saved. Refresh to apply it to the Google Analytics tag.");
    }}>{disabled ? "Enable analytics" : "Disable analytics"}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
