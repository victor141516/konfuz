import { z } from 'zod';
import { ConfigFieldType, SchemaInfo } from './schema-transformer';

export interface EnvFileConfig {
  [key: string]: string;
}

export interface EnvConfig {
  [key: string]: string | number | boolean | undefined;
}

export function parseEnvVariables(
  info: SchemaInfo,
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

function getCoercionSchema(
  type: ConfigFieldType,
  enumValues?: string[]
): z.ZodType {
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
  type: ConfigFieldType,
  enumValues?: string[]
): string | number | boolean | undefined {
  const schema = getCoercionSchema(type, enumValues);
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data as string | number | boolean;
  }
  return undefined;
}
