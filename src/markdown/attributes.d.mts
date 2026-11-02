export function atAttributes(source: string): Record<string, string>;
export function finite(value: string | undefined, fallback?: number): number | undefined;
export function choice<T extends string>(
  value: string | undefined,
  choices: readonly T[],
  fallback: T,
  name: string,
): T;
