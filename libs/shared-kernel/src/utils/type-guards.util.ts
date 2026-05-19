export const isNil = (val: unknown): val is null | undefined =>
  val === null || val === undefined;

export const isUndefined = (val: unknown): val is undefined =>
  val === undefined;

export const isEmpty = (val: unknown[] | null | undefined): boolean =>
  isNil(val) || (val as unknown[]).length === 0;
