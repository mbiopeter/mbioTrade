export const DERIV_APP_ID_EXAMPLE = "34N5mW67NQ9BRFoBF2UdF";
export const DERIV_APP_ID_ERROR =
  `Enter a valid alphanumeric Deriv App ID, for example ${DERIV_APP_ID_EXAMPLE}.`;

const DERIV_APP_ID_PATTERN =
  /^(?=.{8,64}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]+$/;

export function normalizeDerivAppId(value: unknown): string {
  return String(value ?? "").trim();
}

export function isValidDerivAppId(value: unknown): boolean {
  return DERIV_APP_ID_PATTERN.test(normalizeDerivAppId(value));
}

export function requireDerivAppId(value: unknown): string {
  const appId = normalizeDerivAppId(value);
  if (!isValidDerivAppId(appId)) {
    throw new Error(DERIV_APP_ID_ERROR);
  }
  return appId;
}
