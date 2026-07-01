import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  emptyConfigFileParseResult,
  parseConfigFileValues,
  type ConfigFileParseResult,
} from './parser';
import { isJsonObject } from '../../utils/json';
import type { SchemaDescriptor } from '../../schema-transformer';
import { getCliSourceName } from '../../utils/source-values';

export type ConfigFileOption =
  | boolean
  | string
  | {
      defaultPath: string;
    };

export interface NormalizedConfigFileOption {
  enabled: boolean;
  defaultPath?: string;
}

export interface ConfigFileCliParseResult {
  argv: string[];
  explicitPath?: string;
}

export interface LoadedConfigFile {
  path: string;
  resolvedPath: string;
  data: Record<string, unknown>;
}

export interface ConfigFileSourceResult {
  argv: string[];
  defaultConfigFile: ConfigFileParseResult;
  configFile: ConfigFileParseResult;
}

export const CONFIG_FILE_FLAG = '--config-file';
const CONFIG_FILE_MISSING_PATH_ERROR =
  '[konfuz] --config-file requires a JSON file path.';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function assertNonEmptyPath(path: string, optionName: string): void {
  if (path === '') {
    throw new Error(`[konfuz] ${optionName} must not be an empty string.`);
  }
}

function assertConfigFileFlagIsAvailable(info: SchemaDescriptor): void {
  const field = info.fields.find(
    (field) => getCliSourceName(field.cmdName) === CONFIG_FILE_FLAG
  );

  if (!field) {
    return;
  }

  throw new Error(
    `[konfuz] ${CONFIG_FILE_FLAG} is reserved for JSON config files when options.configFile is enabled. Field "${field.name}" uses the same CLI flag; set a different cmdName with customConfigElement().`
  );
}

export function normalizeConfigFileOption(
  option: ConfigFileOption | undefined
): NormalizedConfigFileOption {
  if (option === undefined || option === false) {
    return { enabled: false };
  }

  if (option === true) {
    return { enabled: true };
  }

  if (typeof option === 'string') {
    assertNonEmptyPath(option, 'options.configFile');
    return { enabled: true, defaultPath: option };
  }

  assertNonEmptyPath(option.defaultPath, 'options.configFile.defaultPath');
  return { enabled: true, defaultPath: option.defaultPath };
}

export function parseConfigFileCliOption(
  argv: string[]
): ConfigFileCliParseResult {
  const strippedArgv: string[] = [];
  let explicitPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      strippedArgv.push(...argv.slice(index));
      break;
    }

    if (arg === CONFIG_FILE_FLAG) {
      const value = argv[index + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        throw new Error(CONFIG_FILE_MISSING_PATH_ERROR);
      }
      explicitPath = value;
      index += 1;
      continue;
    }

    if (arg.startsWith(`${CONFIG_FILE_FLAG}=`)) {
      const value = arg.slice(CONFIG_FILE_FLAG.length + 1);
      if (value === '') {
        throw new Error(CONFIG_FILE_MISSING_PATH_ERROR);
      }
      explicitPath = value;
      continue;
    }

    strippedArgv.push(arg);
  }

  return { argv: strippedArgv, explicitPath };
}

export function loadConfigFile(
  path: string,
  options: { required: boolean }
): LoadedConfigFile | undefined {
  const resolvedPath = resolve(process.cwd(), path);
  let content: string;

  try {
    content = readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT' && !options.required) {
      return undefined;
    }

    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(`[konfuz] JSON config file not found: ${path}`);
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[konfuz] Could not read JSON config file "${path}": ${reason}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[konfuz] Failed to parse JSON config file "${path}": ${reason}`
    );
  }

  if (!isJsonObject(data)) {
    throw new Error(
      `[konfuz] JSON config file "${path}" must contain a JSON object at the root.`
    );
  }

  return { path, resolvedPath, data };
}

export function resolveConfigFileSource(
  info: SchemaDescriptor,
  option: ConfigFileOption | undefined,
  rawArgv: string[]
): ConfigFileSourceResult {
  const normalizedOption = normalizeConfigFileOption(option);
  const emptyDefault = emptyConfigFileParseResult();
  const emptyExplicit = emptyConfigFileParseResult();

  if (!normalizedOption.enabled) {
    return {
      argv: rawArgv,
      defaultConfigFile: emptyDefault,
      configFile: emptyExplicit,
    };
  }

  assertConfigFileFlagIsAvailable(info);

  const parsedConfigFileCli = parseConfigFileCliOption(rawArgv);

  if (parsedConfigFileCli.explicitPath !== undefined) {
    const explicitConfigFile = loadConfigFile(
      parsedConfigFileCli.explicitPath,
      {
        required: true,
      }
    );

    return {
      argv: parsedConfigFileCli.argv,
      defaultConfigFile: emptyDefault,
      configFile: explicitConfigFile
        ? parseConfigFileValues(info, explicitConfigFile)
        : emptyExplicit,
    };
  }

  if (normalizedOption.defaultPath !== undefined) {
    const defaultConfigFile = loadConfigFile(normalizedOption.defaultPath, {
      required: false,
    });

    return {
      argv: parsedConfigFileCli.argv,
      defaultConfigFile: defaultConfigFile
        ? parseConfigFileValues(info, defaultConfigFile)
        : emptyDefault,
      configFile: emptyExplicit,
    };
  }

  return {
    argv: parsedConfigFileCli.argv,
    defaultConfigFile: emptyDefault,
    configFile: emptyExplicit,
  };
}
