import { z } from 'zod';
import { hideBin } from 'yargs/helpers';
import {
  extractSchemaInfo,
  extractDefaults,
  normalizeToZodObject,
  customConfigElement,
  type FieldConfig,
  type ConfigInput,
} from './schema-transformer';
import { loadEnvFile, type EnvFileConfig } from './loader';
import {
  parseCliArguments,
  type CliConfig,
  type CliParseResult,
} from './cli-parser';
import { validateSupportedSchemas } from './validate-schemas';
import { parseEnvVariables, type EnvConfig } from './env-parser';

export interface ParseMyConfOptions {
  envPath?: string | string[];
  argv?: string[];
}

export { customConfigElement };

export type InferConfig<T extends ConfigInput> = {
  [K in keyof T]: T[K] extends z.ZodTypeAny
    ? z.infer<T[K]>
    : T[K] extends FieldConfig
      ? z.infer<T[K]['type']>
      : never;
};

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
}

declare module 'zod' {
  interface ZodError {
    __$sources__?: Record<string, ConfigSourceEntry>;
  }
}

export function configure<T extends ConfigInput>(
  config: T,
  options?: ParseMyConfOptions
): InferConfig<T> & { __$sources__?: Record<string, ConfigSourceEntry> } {
  // validateSupportedSchemas(config as ConfigInput);

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
    result.error.__$sources__ = sources;
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

  const data = result.data as InferConfig<T>;
  Object.defineProperty(data, '__$sources__', {
    value: sources,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return data as InferConfig<T>;
}

export { toEnvName, toCliName } from './schema-transformer';
export { printConfiguredSources } from './print-config-sources';
