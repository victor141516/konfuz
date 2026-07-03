import { z } from 'zod';
import type { FieldType } from '../schema-transformer';
import type { SourcePrimitive } from './source-values';

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no']);

export function coerceBooleanString(value: string): boolean | undefined {
  const lower = value.toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(lower)) return true;
  if (BOOLEAN_FALSE_VALUES.has(lower)) return false;
  return undefined;
}

export function coerceCliBooleanValue(
  value: string | boolean
): boolean | undefined {
  if (typeof value === 'boolean') {
    return false;
  }
  if (value === '') {
    return true;
  }
  return coerceBooleanString(value);
}

export function parseStringValueForField(
  value: string,
  type: FieldType,
  enumValues?: string[]
): SourcePrimitive {
  if (type === 'boolean') {
    return coerceBooleanString(value) ?? value;
  }

  if (type === 'number') {
    const numResult = z.coerce.number().safeParse(value);
    if (numResult.success) {
      return numResult.data as number;
    }
    return value;
  }

  if (type === 'enum') {
    const schema = z.enum(enumValues as [string, ...string[]]);
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data as string;
    }
    return value;
  }

  return value;
}
