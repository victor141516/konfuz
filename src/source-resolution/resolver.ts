import { hideBin } from 'yargs/helpers';
import type { z } from 'zod';
import { parseExplicitCliArguments } from '../sources/cli/parser';
import {
  resolveConfigFileSource,
  type ConfigFileOption,
} from '../sources/config-file/source';
import { parseEnvFileVariables } from '../sources/env-file/parser';
import { loadEnvFile, type EnvFileConfig } from '../sources/env-file/loader';
import { parseProcessEnvVariables } from '../sources/env-var/parser';
import { extractDefaults, type SchemaDescriptor } from '../schema-transformer';
import type { ConfigSourceEntry } from './ledger';
import {
  getCliSourceName,
  getPresentValueAsString,
} from '../utils/source-values';

export interface SourceResolverOptions {
  envPath?: string | string[];
  argv?: string[];
  configFile?: ConfigFileOption;
}

export interface SourceResolution {
  config: Record<string, unknown>;
  sources: Record<string, ConfigSourceEntry>;
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
  const cliConfigValues = {
    ...cliResult.config,
    ...cliResult.rawValues,
  };

  const config: Record<string, unknown> = {
    ...defaults,
    ...configFileSource.defaultConfigFile.config,
    ...envFileConfigValues,
    ...configFileSource.configFile.config,
    ...envConfigValues,
    ...cliConfigValues,
  };

  const sources: Record<string, ConfigSourceEntry> = {};

  for (const field of info.fields) {
    const name = field.name;
    const envValue = process.env[field.envName];
    const envFileValue = envFileConfig[field.envName];
    const defaultConfigFileValue =
      configFileSource.defaultConfigFile.sourceValues[name];
    const configFileValue = configFileSource.configFile.sourceValues[name];
    const cliValue = cliResult.sourceValues[name] ?? cliResult.rawValues[name];

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
    } else {
      const defaultValue = getPresentValueAsString(config, name);
      if (defaultValue !== undefined) {
        entry.finalValue = defaultValue;
      }
    }

    sources[name] = entry;
  }

  return { config, sources };
}
