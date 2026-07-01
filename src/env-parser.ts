import { parseStringValueForField } from './primitive-value-utils';
import { SchemaDescriptor } from './schema-transformer';

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
  return {
    ...parseEnvFileVariables(info, envFileConfig),
    ...parseProcessEnvVariables(info),
  };
}

export function parseProcessEnvVariables(info: SchemaDescriptor): EnvConfig {
  const config: EnvConfig = {};
  for (const field of info.fields) {
    const envValue = process.env[field.envName];
    if (envValue !== undefined) {
      config[field.name] = parseStringValueForField(
        envValue,
        field.type,
        field.enumValues
      );
    }
  }

  return config;
}

export function parseEnvFileVariables(
  info: SchemaDescriptor,
  envFileConfig: EnvFileConfig
): EnvConfig {
  const config: EnvConfig = {};

  for (const [key, value] of Object.entries(envFileConfig)) {
    const field = info.fields.find((f) => f.envName === key);
    if (field && value !== undefined) {
      config[field.name] = parseStringValueForField(
        value,
        field.type,
        field.enumValues
      );
    }
  }

  return config;
}
