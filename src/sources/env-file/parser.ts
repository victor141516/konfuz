import { parseStringValueForField } from '../../utils/primitive-values';
import { SchemaDescriptor } from '../../schema-transformer';

export interface EnvFileConfig {
  [key: string]: string;
}

export interface EnvConfig {
  [key: string]: string | number | boolean | undefined;
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
