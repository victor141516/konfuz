import { z } from 'zod';
import { FieldType, SchemaDescriptor } from './schema-transformer';

export interface EnvFileConfig {
  [key: string]: string;
}

export interface EnvConfig {
  [key: string]: string | number | boolean | undefined;
}

export interface EnvParseResult {
  /** Coerced values ready for final schema validation. */
  config: EnvConfig;
  /**
   * The original raw string values from process.env / .env files, keyed by
   * the camelCase field name. Useful for producing accurate error messages when
   * coercion fails and `config[field]` is undefined despite a value being set.
   */
  rawValues: Record<string, string>;
}

export function parseEnvVariables(
  info: SchemaDescriptor,
  envFileConfig: EnvFileConfig
): EnvParseResult {
  const config: EnvConfig = {};
  const rawValues: Record<string, string> = {};

  for (const field of info.fields) {
    const envValue = process.env[field.envName];
    if (envValue !== undefined) {
      rawValues[field.name] = envValue;
      config[field.name] = parseWithZod(envValue, field.type, field.enumValues);
    }
  }

  for (const [key, value] of Object.entries(envFileConfig)) {
    const field = info.fields.find((f) => f.envName === key);
    if (field && value !== undefined && config[field.name] === undefined) {
      rawValues[field.name] = value;
      config[field.name] = parseWithZod(value, field.type, field.enumValues);
    }
  }

  return { config, rawValues };
}

function getCoercionSchema(type: FieldType, enumValues?: string[]): z.ZodType {
  switch (type) {
    case 'number':
      return z.coerce.number();
    case 'boolean':
      return z.coerce.boolean();
    case 'enum':
      return z.enum(enumValues as [string, ...string[]]);
    case 'string':
    default:
      return z.string();
  }
}

function parseWithZod(
  value: string,
  type: FieldType,
  enumValues?: string[]
): string | number | boolean | undefined {
  const schema = getCoercionSchema(type, enumValues);
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data as string | number | boolean;
  }
  return undefined;
}
