"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Field, Input } from "@/components/ui/controls";
import {
  DEFAULT_TRADE_AMOUNT,
  isValidTradeAmount,
  MIN_TRADE_AMOUNT,
  sanitizeTradeAmount,
} from "@/lib/trade-amount";

export type TradeAmountSettingProps = {
  value: number;
  onChange: (value: number) => void;
};

export function TradeAmountSetting({
  value,
  onChange,
}: TradeAmountSettingProps) {
  const [draft, setDraft] = useState(value.toFixed(2));
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDraft(value.toFixed(2));
  }, [value]);

  const commit = () => {
    if (!isValidTradeAmount(draft)) {
      setError(
        `Enter an amount of at least $${MIN_TRADE_AMOUNT.toFixed(2)}.`,
      );
      setDraft(value.toFixed(2));
      return;
    }

    const amount = sanitizeTradeAmount(draft, DEFAULT_TRADE_AMOUNT);
    setError(undefined);
    setDraft(amount.toFixed(2));
    onChange(amount);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  return (
    <Field
      label="Trade amount"
      hint={`Deriv multiplier stake. Default $${DEFAULT_TRADE_AMOUNT.toFixed(2)}; minimum $${MIN_TRADE_AMOUNT.toFixed(2)}.`}
      error={error}
    >
      <Input
        type="number"
        inputMode="decimal"
        min={MIN_TRADE_AMOUNT}
        step={0.01}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(undefined);
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
}
