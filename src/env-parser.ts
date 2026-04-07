import { ConfigField, SchemaInfo } from './schema-transformer';

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
      config[field.name] = convertValue(envValue, field.type);
    }
  }

  for (const [key, value] of Object.entries(envFileConfig)) {
    const field = info.fields.find((f) => f.envName === key);
    if (field && value !== undefined && config[field.name] === undefined) {
      config[field.name] = convertValue(value, field.type);
    }
  }

  return config;
}

function convertValue(
  value: string,
  type: ConfigField['type']
): string | number | boolean {
  switch (type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return isTruthyBoolean(value);
    case 'enum':
      return value;
    case 'string':
    default:
      return value;
  }
}

function isTruthyBoolean(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}
