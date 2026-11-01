"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCcw, WifiOff } from "lucide-react";

export const CONNECTION_TOAST_DURATION_MS = 5_000;

type ConnectionRetryToastProps = {
  
  contextKey: string;
  
  retrying: boolean;
};





export function ConnectionRetryToast({
  contextKey,
  retrying,
}: ConnectionRetryToastProps) {
  const [visible, setVisible] = useState(false);
  const notified = useRef(false);
  const previousContext = useRef(contextKey);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previousContext.current !== contextKey) {
      previousContext.current = contextKey;
      notified.current = false;
      setVisible(false);
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (!retrying) {
      notified.current = false;
      return;
    }

    if (notified.current) return;
    notified.current = true;
    setVisible(true);

    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setVisible(false);
    }, CONNECTION_TOAST_DURATION_MS);
  }, [contextKey, retrying]);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    },
    [],
  );

  if (!visible) return null;

  return (
    <div
      className="mbiotraders-connection-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="mbiotraders-connection-toast-icon" aria-hidden="true">
        <WifiOff size={18} />
      </span>
      <div className="mbiotraders-connection-toast-copy">
        <strong>Retrying connection…</strong>
        <span>Restoring your live market feed</span>
      </div>
      <RefreshCcw
        className="mbiotraders-connection-toast-spinner"
        size={17}
        aria-hidden="true"
      />
      <div className="mbiotraders-connection-toast-timer" aria-hidden="true" />
    </div>
  );
}
