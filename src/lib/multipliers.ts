import type { AcceptedMultiplier } from "./types";

export const ACCEPTED_MULTIPLIERS = [
  100, 200, 300, 500, 800,
] as const satisfies readonly AcceptedMultiplier[];

export const DEFAULT_MULTIPLIER: AcceptedMultiplier = 100;

const REMOVED_MULTIPLIERS = new Set([5, 10, 20, 30, 50]);

/** Values offered in v13 that must be reviewed before any new execution. */
export function isRemovedMultiplier(value: unknown): boolean {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !value.trim()) return false;
  return REMOVED_MULTIPLIERS.has(Number(value));
}

export function isAcceptedMultiplier(value: unknown): value is AcceptedMultiplier {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !value.trim()) return false;
  const number = Number(value);
  return (
    Number.isInteger(number) &&
    ACCEPTED_MULTIPLIERS.includes(number as AcceptedMultiplier)
  );
}

export function sanitizeMultiplier(
  value: unknown,
  fallback: AcceptedMultiplier = DEFAULT_MULTIPLIER,
): AcceptedMultiplier {
  if (isAcceptedMultiplier(value)) return Number(value) as AcceptedMultiplier;
  if (isRemovedMultiplier(value)) return DEFAULT_MULTIPLIER;
  return isAcceptedMultiplier(fallback) ? fallback : DEFAULT_MULTIPLIER;
}

export function assertAcceptedMultiplier(
  value: unknown,
): asserts value is AcceptedMultiplier {
  if (!isAcceptedMultiplier(value)) {
    throw new Error(
      `Multiplier is not in acceptable range. Accepts ${ACCEPTED_MULTIPLIERS.join(",")}.`,
    );
  }
}
