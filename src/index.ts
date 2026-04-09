import { z } from 'zod';
import {
  extractSchemaInfo,
  extractDefaults,
  normalizeToZodObject,
  customConfigElement,
  type FieldConfig,
  type ConfigInput,
} from './schema-transformer';
import { loadEnvFile, type EnvFileConfig } from './loader';
import { parseEnvVariables } from './env-parser';
import { parseCliArguments, type CliConfig } from './cli-parser';
import { formatValidationError } from './error-formatter';

export interface ParseMyConfOptions {
  envPath?: string | string[];
  argv?: string[];
}

export { customConfigElement };

type InferConfig<T extends ConfigInput> = {
  [K in keyof T]: T[K] extends z.ZodTypeAny
    ? z.infer<T[K]>
    : T[K] extends FieldConfig
      ? z.infer<T[K]['type']>
      : never;
};

export function configure<T extends ConfigInput>(
  config: T,
  options?: ParseMyConfOptions
): InferConfig<T> {
  const info = extractSchemaInfo(config as ConfigInput);

  const schema: z.ZodObject<Record<string, z.ZodTypeAny>> =
    normalizeToZodObject(config as ConfigInput);

  const defaults = extractDefaults(schema.shape);

  const envFileConfig: EnvFileConfig = options?.envPath
    ? loadEnvFile(options.envPath)
    : loadEnvFile();

  const { config: envConfig, rawValues } = parseEnvVariables(
    info,
    envFileConfig
  );

  const cliConfig: CliConfig = parseCliArguments(info);

  const merged: Record<string, unknown> = {
    ...defaults,
    ...envConfig,
    ...cliConfig,
  };

  const result = schema.safeParse(merged);

  if (!result.success) {
    throw new Error(
      formatValidationError(result.error, info, merged, rawValues)
    );
  }

  return result.data as InferConfig<T>;
}

export { toEnvName, toCliName } from './schema-transformer';
