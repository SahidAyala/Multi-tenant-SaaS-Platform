export type Result<T, E extends Error = Error> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: E };

export const Result = {
  ok: <T>(value: T): Result<T> => ({ success: true, value }),
  fail: <T, E extends Error = Error>(error: E): Result<T, E> => ({ success: false, error }),
};
