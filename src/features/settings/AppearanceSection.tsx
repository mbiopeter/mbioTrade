"use client";

import { Palette, RefreshCcw, Save, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Input } from "@/components/ui/controls";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import { DEFAULT_ACCENT } from "@/lib/app-config";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function AppearanceSection() {
  const { preferences, updatePreferences } = useApp();
  const { toast } = useToast();
  const [accentInput, setAccentInput] = useState(preferences.accent);

  useEffect(() => {
    setAccentInput(preferences.accent);
  }, [preferences.accent]);

  const commitAccent = () => {
    if (!HEX_COLOR.test(accentInput)) {
      setAccentInput(preferences.accent);
      toast({
        title: "Accent not changed",
        message: "Use a six-digit hexadecimal color such as #20e58b.",
        tone: "error",
      });
      return;
    }

    updatePreferences({ accent: accentInput.toLowerCase() });
    toast({
      title: "Accent applied",
      message: "Buttons, navigation, charts and focus states now use this color.",
      tone: "success",
    });
  };

  const resetAccent = () => {
    setAccentInput(DEFAULT_ACCENT);
    updatePreferences({ accent: DEFAULT_ACCENT });
    toast({
      title: "Default accent restored",
      message: "The MbioTrade neon-green theme is active everywhere.",
      tone: "success",
    });
  };

  return (
    <section className="card settings-section">
      <div className="settings-title">
        <div className="settings-icon">
          <Palette />
        </div>
        <div>
          <h2>Appearance</h2>
          <p>The dark navy terminal and neon-green accent are the default.</p>
        </div>
      </div>

      <Field label="Accent color">
        <div className="color-field">
          <input
            type="color"
            aria-label="Choose accent color"
            value={HEX_COLOR.test(accentInput) ? accentInput : preferences.accent}
            onChange={(event) => {
              setAccentInput(event.target.value);
              updatePreferences({ accent: event.target.value });
            }}
          />
          <Input
            value={accentInput}
            maxLength={7}
            spellCheck={false}
            onChange={(event) => setAccentInput(event.target.value)}
            onBlur={commitAccent}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitAccent();
              }
            }}
          />
        </div>
      </Field>

      <div className="theme-preview">
        <Zap />
        <div>
          <b>MbioTrade terminal accent</b>
          <span>
            Primary buttons, active navigation, chart markers, focus rings and trade
            highlights inherit the chosen color.
          </span>
        </div>
      </div>

      <div className="button-row">
        <button type="button" className="btn secondary" onClick={resetAccent}>
          <RefreshCcw size={16} />
          Reset accent
        </button>
        <button type="button" className="btn primary" onClick={commitAccent}>
          <Save size={16} />
          Save preference
        </button>
      </div>
    </section>
  );
}
