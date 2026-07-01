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
import { parseExplicitCliArguments } from './cli-parser';
import { parseEnvFileVariables, parseProcessEnvVariables } from './env-parser';
import {
  loadConfigFile,
  normalizeConfigFileOption,
  parseConfigFileCliOption,
  type ConfigFileOption,
} from './config-file-loader';
import {
  parseConfigFileValues,
  type ConfigFileParseResult,
} from './config-file-parser';
import { InternalSources } from './print-config-sources';

export interface ParseMyConfOptions {
  envPath?: string | string[];
  argv?: string[];
  configFile?: ConfigFileOption;
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

export type ConfigSource =
  | 'cli'
  | 'env'
  | 'configFile'
  | 'envFile'
  | 'defaultConfigFile'
  | 'default';

export interface SourceValue {
  name: string;
  value: string;
}

export interface ConfigSourceEntry {
  finalSource: ConfigSource;
  finalValue?: string;
  defaultConfigFile?: SourceValue;
  envFile?: SourceValue;
  configFile?: SourceValue;
  env?: SourceValue;
  cli?: SourceValue;
  secret?: boolean;
}

function emptyConfigFileParseResult(): ConfigFileParseResult {
  return { config: {}, sourceValues: {} };
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getCliSourceName(cmdName: string): string {
  return cmdName.startsWith('--') ? cmdName : `--${cmdName}`;
}

export function configure<T extends ConfigInput>(
  config: T,
  options?: ParseMyConfOptions
): InferConfig<T> {
  const info = extractSchemaInfo(config as ConfigInput);

  const schema: z.ZodObject<Record<string, z.ZodTypeAny>> =
    normalizeToZodObject(config as ConfigInput);

  const defaults = extractDefaults(schema.shape);

  const rawArgv = options?.argv ?? hideBin(process.argv);
  const configFileOption = normalizeConfigFileOption(options?.configFile);
  let argv = rawArgv;
  let defaultConfigFileResult = emptyConfigFileParseResult();
  let configFileResult = emptyConfigFileParseResult();

  if (configFileOption.enabled) {
    const parsedConfigFileCli = parseConfigFileCliOption(rawArgv);
    argv = parsedConfigFileCli.argv;

    if (parsedConfigFileCli.explicitPath !== undefined) {
      const explicitConfigFile = loadConfigFile(
        parsedConfigFileCli.explicitPath,
        {
          required: true,
        }
      );
      if (explicitConfigFile) {
        configFileResult = parseConfigFileValues(info, explicitConfigFile);
      }
    } else if (configFileOption.defaultPath !== undefined) {
      const defaultConfigFile = loadConfigFile(configFileOption.defaultPath, {
        required: false,
      });
      if (defaultConfigFile) {
        defaultConfigFileResult = parseConfigFileValues(
          info,
          defaultConfigFile
        );
      }
    }
  }

  const envFileConfig: EnvFileConfig = options?.envPath
    ? loadEnvFile(options.envPath)
    : loadEnvFile();

  const envFileConfigValues = parseEnvFileVariables(info, envFileConfig);
  const envConfigValues = parseProcessEnvVariables(info);

  const cliResult = parseExplicitCliArguments(info, {
    argv,
  });

  const sources: Record<string, ConfigSourceEntry> = {};

  const merged: Record<string, unknown> = {
    ...defaults,
    ...defaultConfigFileResult.config,
    ...envFileConfigValues,
    ...configFileResult.config,
    ...envConfigValues,
    ...cliResult.config,
  };

  for (const field of info.fields) {
    const name = field.name;
    const envValue = process.env[field.envName];
    const envFileValue = envFileConfig[field.envName];
    const defaultConfigFileValue = defaultConfigFileResult.sourceValues[name];
    const configFileValue = configFileResult.sourceValues[name];
    const cliValue = cliResult.sourceValues[name];

    const entry: ConfigSourceEntry = {
      finalSource: 'default',
      defaultConfigFile: defaultConfigFileValue,
      envFile:
        envFileValue !== undefined
          ? { name: field.envName, value: envFileValue }
          : undefined,
      configFile: configFileValue,
      env:
        envValue !== undefined
          ? { name: field.envName, value: envValue }
          : undefined,
      cli:
        cliValue !== undefined
          ? { name: getCliSourceName(field.cmdName), value: cliValue }
          : undefined,
      secret: field.secret,
    };

    if (entry.cli) {
      entry.finalSource = 'cli';
      entry.finalValue = entry.cli.value;
    } else if (envValue !== undefined) {
      entry.finalSource = 'env';
      entry.finalValue = envValue;
    } else if (configFileValue !== undefined) {
      entry.finalSource = 'configFile';
      entry.finalValue = configFileValue.value;
    } else if (envFileValue !== undefined) {
      entry.finalSource = 'envFile';
      entry.finalValue = envFileValue;
    } else if (defaultConfigFileValue !== undefined) {
      entry.finalSource = 'defaultConfigFile';
      entry.finalValue = defaultConfigFileValue.value;
    } else if (hasOwn(merged, name) && merged[name] !== undefined) {
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
