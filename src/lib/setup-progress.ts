export type SetupQualification = { name: string; ok: boolean };
export type SetupDirection = "BUY" | "SELL" | "WAIT";

export type SetupBanner = {
  message: string;
  tone: "up" | "down" | "flat";
  completed: number;
  total: number;
};

export function nextSetupBanner(
  criteria: readonly SetupQualification[],
  status: SetupDirection,
  activeDirection?: "BUY" | "SELL" | null,
): SetupBanner {
  const completed = criteria.filter((criterion) => criterion.ok).length;
  const total = criteria.length;
  if (activeDirection) {
    return { message: `${activeDirection} active`, tone: activeDirection === "BUY" ? "up" : "down", completed, total };
  }

  const pending = criteria.find((criterion) => !criterion.ok);
  if (pending) {
    const name = pending.name;
    let qualification = name;
    if (name === "Fresh 5m candles") qualification = "fresh, consecutive 5m candles";
    else if (/^\d+-day higher momentum$/.test(name)) qualification = `${name.replace(" higher momentum", "")} H1/H4/D1 momentum`;
    else if (name === "Five higher frames aligned") qualification = "15m, 30m, 1H, 4H and 1D alignment";
    else if (name === "H1 trend strength") qualification = "H1 trend strength (ADX 16+)";
    else if (name === "5m countertrend pullback") qualification = "5m countertrend pullback";
    else if (name === "Two strong 5m candles (60%+)") qualification = "two strong 5m closes (60%+ body)";
    else if (name === "Third-candle open + swing SL + 2R") qualification = "third-candle open, earlier swing SL and 2R target";
    return { message: `Waiting for ${qualification}`, tone: "flat", completed, total };
  }

  if (status === "BUY" || status === "SELL") {
    return { message: `${status} setup qualified`, tone: status === "BUY" ? "up" : "down", completed, total };
  }
  return { message: "Checking technical qualifications", tone: "flat", completed, total };
}
