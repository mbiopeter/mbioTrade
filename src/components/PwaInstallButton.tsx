"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, MonitorSmartphone, Share2, X } from "lucide-react";

type InstallOutcome = { outcome: "accepted" | "dismissed"; platform?: string };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallOutcome> };
type IosNavigator = Navigator & { standalone?: boolean };

function installed() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as IosNavigator).standalone === true;
}

function installationPlatform(): "ios" | "android" | "desktop" {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(agent)) return "android";
  return "desktop";
}

export function PwaInstallButton() {
  const promptEvent = useRef<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setIsInstalled(installed());
    setPlatform(installationPlatform());
    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      promptEvent.current = event as InstallPromptEvent;
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstalling(false);
      setIsOpen(false);
      promptEvent.current = null;
      setFeedback("mbioTraders is installed on this device.");
    };
    const onDisplayChanged = () => setIsInstalled(installed());
    const media = window.matchMedia("(display-mode: standalone)");
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener("change", onDisplayChanged);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/notification-sw.js", { scope: "/" }).catch(() => {
        setFeedback("Install support is unavailable right now. You can still use the browser's install menu.");
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener("change", onDisplayChanged);
    };
  }, []);

  const onInstall = async () => {
    if (installed()) {
      setIsInstalled(true);
      setIsOpen(true);
      return;
    }
    const available = promptEvent.current;
    if (available) {
      setInstalling(true);
      setFeedback("");
      try {
        await available.prompt();
        const choice = await available.userChoice;
        if (choice.outcome === "accepted") {
          setFeedback("Installation accepted. Your device will add the app shortly.");
        } else {
          setFeedback("Installation dismissed. You can install it later.");
        }
      } catch {
        setFeedback("Use your browser's menu to install mbioTraders.");
        setIsOpen(true);
      } finally {
        promptEvent.current = null;
        setInstalling(false);
      }
      return;
    }
    setIsOpen(true);
  };

  return <>
    <button
      type="button"
      className={`mbiotraders-install-button ${isInstalled ? "installed" : ""}`}
      onClick={() => void onInstall()}
      disabled={installing}
      aria-label={isInstalled ? "mbioTraders app installed" : "Install mbioTraders app on this device"}
      title={isInstalled ? "mbioTraders is installed" : "Install mbioTraders on your desktop or phone"}
    >
      {isInstalled ? <Check size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
      <span>{isInstalled ? "Installed" : installing ? "Installing" : "Install App"}</span>
    </button>
    <span className="sr-only" role="status" aria-live="polite">{feedback}</span>
    {isOpen && <div className="mbiotraders-install-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setIsOpen(false);
    }}>
      <section className="mbiotraders-install-dialog" role="dialog" aria-modal="true" aria-labelledby="mbiotraders-install-title">
        <button type="button" className="mbiotraders-install-close" onClick={() => setIsOpen(false)} aria-label="Close install instructions"><X size={18} /></button>
        <span className="mbiotraders-install-emblem" aria-hidden="true"><MonitorSmartphone size={27} /></span>
        <h2 id="mbiotraders-install-title">{isInstalled ? "mbioTraders is installed" : "Install mbioTraders"}</h2>
        {isInstalled ? <p>The app can be opened from your home screen or your computer's apps list.</p>
          : platform === "ios" ? <>
            <p>On your iPhone or iPad, open this page in your browser and follow these steps:</p>
            <ol><li>Tap <Share2 size={15} aria-hidden="true" /> <strong>Share</strong> in the browser toolbar.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>. Open mbioTraders from your home screen.</li></ol>
          </> : platform === "android" ? <>
            <p>To add mbioTraders to your Android home screen:</p>
            <ol><li>Open this page in Chrome or a compatible browser.</li><li>Tap the browser <strong>⋮ menu</strong>.</li><li>Select <strong>Install app</strong> or <strong>Add to Home screen</strong> and confirm.</li></ol>
          </> : <>
            <p>Install mbioTraders as an app on your computer:</p>
            <ol><li>Open this page in Chrome or Microsoft Edge.</li><li>Click the install icon in the address bar, or open the browser menu.</li><li>Choose <strong>Install mbioTraders</strong> and confirm.</li></ol>
          </>}
        <p className="mbiotraders-install-caveat">Use HTTPS (or localhost). Installation adds an app shortcut and standalone window. Live quotes, signals and alerts require internet access; signal notifications only run while the app is open.</p>
        <button type="button" className="mbiotraders-install-done" onClick={() => setIsOpen(false)}>Got it</button>
      </section>
    </div>}
  </>;
}
