import { hideBin } from 'yargs/helpers';
import type { z } from 'zod';
import { parseExplicitCliArguments } from './cli-parser';
import {
  resolveConfigFileSource,
  type ConfigFileOption,
} from './config-file-loader';
import { parseEnvFileVariables, parseProcessEnvVariables } from './env-parser';
import { loadEnvFile, type EnvFileConfig } from './loader';
import { extractDefaults, type SchemaDescriptor } from './schema-transformer';
import type { ConfigSourceEntry } from './source-ledger';

export interface SourceResolverOptions {
  envPath?: string | string[];
  argv?: string[];
  configFile?: ConfigFileOption;
}

export interface SourceResolution {
  config: Record<string, unknown>;
  sources: Record<string, ConfigSourceEntry>;
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getCliSourceName(cmdName: string): string {
  return cmdName.startsWith('--') ? cmdName : `--${cmdName}`;
}

function getMergedFinalValue(
  merged: Record<string, unknown>,
  name: string
): string | undefined {
  if (!hasOwn(merged, name) || merged[name] === undefined) {
    return undefined;
  }

  return String(merged[name]);
}

export function resolveConfigSources(
  info: SchemaDescriptor,
  shape: Record<string, z.ZodType>,
  options?: SourceResolverOptions
): SourceResolution {
  const defaults = extractDefaults(shape);
  const rawArgv = options?.argv ?? hideBin(process.argv);
  const configFileSource = resolveConfigFileSource(
    info,
    options?.configFile,
    rawArgv
  );

  const envFileConfig: EnvFileConfig = options?.envPath
    ? loadEnvFile(options.envPath)
    : loadEnvFile();

  const envFileConfigValues = parseEnvFileVariables(info, envFileConfig);
  const envConfigValues = parseProcessEnvVariables(info);
  const cliResult = parseExplicitCliArguments(info, {
    argv: configFileSource.argv,
  });

  const config: Record<string, unknown> = {
    ...defaults,
    ...configFileSource.defaultConfigFile.config,
    ...envFileConfigValues,
    ...configFileSource.configFile.config,
    ...envConfigValues,
    ...cliResult.config,
  };

  const sources: Record<string, ConfigSourceEntry> = {};

  for (const field of info.fields) {
    const name = field.name;
    const envValue = process.env[field.envName];
    const envFileValue = envFileConfig[field.envName];
    const defaultConfigFileValue =
      configFileSource.defaultConfigFile.sourceValues[name];
    const configFileValue = configFileSource.configFile.sourceValues[name];
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
      entry.finalValue = getMergedFinalValue(config, name);
    } else if (envFileValue !== undefined) {
      entry.finalSource = 'envFile';
      entry.finalValue = envFileValue;
    } else if (defaultConfigFileValue !== undefined) {
      entry.finalSource = 'defaultConfigFile';
      entry.finalValue = getMergedFinalValue(config, name);
    } else if (hasOwn(config, name) && config[name] !== undefined) {
      entry.finalValue = String(config[name]);
    }

    sources[name] = entry;
  }

  return { config, sources };
}
