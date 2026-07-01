import { hasOwn } from './object-utils';

export type SourcePrimitive = string | number | boolean;

export function toSourceValue(value: SourcePrimitive): string {
  return String(value);
}

export function getCliSourceName(cmdName: string): string {
  return cmdName.startsWith('--') ? cmdName : `--${cmdName}`;
}

export function getPresentValueAsString(
  values: Record<string, unknown>,
  name: string
): string | undefined {
  if (!hasOwn(values, name) || values[name] === undefined) {
    return undefined;
  }

  return String(values[name]);
}
