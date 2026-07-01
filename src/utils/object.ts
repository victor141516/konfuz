export function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
