export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type UnixMs = Brand<number, "UnixMs">;

export const LINKA_SHARED_CONTRACT_VERSION = "2026-05-19.phase01.shared" as const;

export type LinkaSharedContractVersion = typeof LINKA_SHARED_CONTRACT_VERSION;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const isUnixMs = (value: unknown): value is UnixMs =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 8_640_000_000_000_000;

export const parseUnixMs = (value: unknown): UnixMs | undefined =>
  isUnixMs(value) ? value : undefined;

export const unixMs = (value: number): UnixMs => {
  if (!isUnixMs(value)) {
    throw new TypeError(`Invalid UnixMs: ${String(value)}`);
  }

  return value;
};

export const hasOwnString = <Key extends string>(
  value: Record<string, unknown>,
  key: Key,
): value is Record<Key, string> & Record<string, unknown> => typeof value[key] === "string";
