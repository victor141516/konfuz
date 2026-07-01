import { parseStringValueForField } from '../../utils/primitive-values';
import { SchemaDescriptor } from '../../schema-transformer';
import type { EnvConfig } from '../env-file/parser';

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
