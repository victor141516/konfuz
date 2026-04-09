import { z } from 'zod';
import { FieldType, SchemaDescriptor } from './schema-transformer';

export interface EnvFileConfig {
  [key: string]: string;
}

export interface EnvConfig {
  [key: string]: string | number | boolean | undefined;
}

export function parseEnvVariables(
  info: SchemaDescriptor,
  envFileConfig: EnvFileConfig
): EnvConfig {
  const config: EnvConfig = {};

  for (const field of info.fields) {
    const envValue = process.env[field.envName];
    if (envValue !== undefined) {
      config[field.name] = parseWithZod(envValue, field.type, field.enumValues);
    }
  }

  for (const [key, value] of Object.entries(envFileConfig)) {
    const field = info.fields.find((f) => f.envName === key);
    if (field && value !== undefined && config[field.name] === undefined) {
      config[field.name] = parseWithZod(value, field.type, field.enumValues);
    }
  }

  return config;
}

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no']);

function coerceBoolean(value: string): boolean | undefined {
  const lower = value.toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(lower)) return true;
  if (BOOLEAN_FALSE_VALUES.has(lower)) return false;
  return undefined;
}

function isBooleanString(value: string): boolean {
  const lower = value.toLowerCase();
  return BOOLEAN_TRUE_VALUES.has(lower) || BOOLEAN_FALSE_VALUES.has(lower);
}

function parseWithZod(
  value: string,
  type: FieldType,
  enumValues?: string[]
): string | number | boolean | undefined {
  if (type === 'boolean') {
    return coerceBoolean(value);
  }

  if (type === 'number') {
    const numResult = z.coerce.number().safeParse(value);
    if (numResult.success) {
      return numResult.data as number;
    }
    if (isBooleanString(value)) {
      return undefined;
    }
    return undefined;
  }

  if (type === 'enum') {
    const schema = z.enum(enumValues as [string, ...string[]]);
    const result = schema.safeParse(value);
    if (result.success) {
      return result.data as string;
    }
    return undefined;
  }

  return value;
}
