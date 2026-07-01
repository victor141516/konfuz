export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringifyJsonValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}
