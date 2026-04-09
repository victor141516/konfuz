import { z } from 'zod';
import { hideBin } from 'yargs/helpers';
import {
  extractSchemaInfo,
  extractDefaults,
  normalizeToZodObject,
  customConfigElement,
  type FieldConfig,
  type ConfigInput,
  type SimpleType,
  type ConfigFieldType,
} from './schema-transformer';
import { loadEnvFile, type EnvFileConfig } from './loader';
import {
  parseCliArguments,
  type CliConfig,
  type CliParseResult,
} from './cli-parser';
import { parseEnvVariables, type EnvConfig } from './env-parser';
import { InternalSources } from './print-config-sources';

export interface ParseMyConfOptions {
  envPath?: string | string[];
  argv?: string[];
}

export { customConfigElement };
export type { SimpleType, ConfigFieldType };

export type InferConfig<T extends ConfigInput> = {
  [K in keyof T]: T[K] extends z.ZodTypeAny
    ? z.infer<T[K]>
    : T[K] extends FieldConfig
      ? T[K]['type'] extends z.ZodTypeAny
        ? z.infer<T[K]['type']>
        : T[K]['type'] extends SimpleType
          ? SimpleToNative<T[K]['type']>
          : never
      : T[K] extends SimpleType
        ? SimpleToNative<T[K]>
        : never;
};

type SimpleToNative<T extends SimpleType> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : never;

export type ConfigSource = 'cli' | 'env' | 'envFile' | 'default';

export interface SourceValue {
  name: string;
  value: string;
}

export interface ConfigSourceEntry {
  finalSource: ConfigSource;
  finalValue?: string;
  envFile?: SourceValue;
  env?: SourceValue;
  cli?: SourceValue;
  secret?: boolean;
}

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

  const cliResult: CliConfig | CliParseResult = parseCliArguments(info, {
    argv: options?.argv,
  });

  const cliConfig: CliConfig =
    (cliResult as CliParseResult).config ?? (cliResult as CliConfig);

  const cliArgsProvided = (options?.argv ?? hideBin(process.argv)).length > 0;

  const sources: Record<string, ConfigSourceEntry> = {};

  const merged: Record<string, unknown> = {
    ...defaults,
    ...envConfig,
    ...cliConfig,
  };

  for (const field of info.fields) {
    const name = field.name;
    const cliValue = cliConfig[name];
    const envValue = process.env[field.envName];
    const envFileValue = envFileConfig[field.envName];

    const cliWasProvided = cliArgsProvided && cliValue !== undefined;

    const entry: ConfigSourceEntry = {
      finalSource: 'default',
      envFile:
        envFileValue !== undefined
          ? { name: field.envName, value: envFileValue }
          : undefined,
      env:
        envValue !== undefined
          ? { name: field.envName, value: envValue }
          : undefined,
      cli: cliWasProvided
        ? { name: `--${field.cmdName}`, value: String(cliValue) }
        : undefined,
      secret: field.secret,
    };

    if (cliWasProvided) {
      entry.finalSource = 'cli';
      entry.finalValue = String(cliValue);
    } else if (envValue !== undefined) {
      entry.finalSource = 'env';
      entry.finalValue = envValue;
    } else if (envFileValue !== undefined) {
      entry.finalSource = 'envFile';
      entry.finalValue = envFileValue;
    } else if (name in merged) {
      entry.finalValue = String(merged[name]);
    }

    sources[name] = entry;
  }

  const result = schema.safeParse(merged);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const fieldName = String(issue.path[0]);
      const field = info.fields.find((f) => f.name === fieldName);
      if (field?.secret) {
        return `${fieldName}: ***`;
      }
      return `${fieldName}: ${issue.message}`;
    });
    const errors = issues.join(', ');
    throw new Error(`Configuration validation failed: ${errors}`);
  }

  const data = result.data as InferConfig<T> & InternalSources;
  data.__$sources__ = sources;

  return data;
}

export { toEnvName, toCliName } from './schema-transformer';
export { printConfiguredSources } from './print-config-sources';
