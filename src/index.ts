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
import { parseEnvVariables, type EnvConfig } from './env-parser';
import { parseCliArguments, type CliConfig } from './cli-parser';

export interface ParseMyConfOptions {
  envPath?: string;
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

  const envConfig: EnvConfig = parseEnvVariables(info, envFileConfig);

  const cliConfig: CliConfig = parseCliArguments(info);

  const merged: Record<string, unknown> = {
    ...defaults,
    ...envConfig,
    ...cliConfig,
  };

  const result = schema.safeParse(merged);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Configuration validation failed: ${errors}`);
  }

  return result.data as InferConfig<T>;
}

export { toEnvName, toCliName } from './schema-transformer';
