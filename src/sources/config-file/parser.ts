import type {
  FieldDescriptor,
  SchemaDescriptor,
} from '../../schema-transformer';
import type { LoadedConfigFile } from './source';
import {
  parseConfigLookupPath,
  readConfigLookupPath,
  type ConfigLookupPath,
} from './lookup-path';
import { stringifyJsonValue } from '../../utils/json';

interface ConfigFileSourceValue {
  name: string;
  value: string;
}

export interface ConfigFileParseResult {
  config: Record<string, unknown>;
  sourceValues: Record<string, ConfigFileSourceValue>;
}

export function emptyConfigFileParseResult(): ConfigFileParseResult {
  return { config: {}, sourceValues: {} };
}

function warnNonObjectIntermediate(
  file: LoadedConfigFile,
  field: FieldDescriptor,
  lookupPath: string,
  traversedPath: string
): void {
  console.warn(
    `[konfuz] Found non-object value at "${traversedPath}" while looking for "${lookupPath}" in configuration file "${file.path}". Treating "${field.name}" as missing from that file.`
  );
}

/**
 * Walks a JSON object by exact key segments. Missing final keys are silent,
 * while non-object intermediate values warn and make the field missing.
 */
function readPath(
  file: LoadedConfigFile,
  field: FieldDescriptor,
  lookupPath: ConfigLookupPath
): { found: true; value: unknown } | { found: false } {
  const result = readConfigLookupPath(file.data, lookupPath);
  if (!result.found && result.failedAt !== undefined) {
    warnNonObjectIntermediate(
      file,
      field,
      lookupPath.displayPath,
      result.failedAt
    );
  }

  return result.found ? result : { found: false };
}

/**
 * Reads every declared config field from a loaded JSON file and returns a flat
 * config object plus JSON-formatted source metadata for values that were found.
 */
export function parseConfigFileValues(
  info: SchemaDescriptor,
  file: LoadedConfigFile
): ConfigFileParseResult {
  const config: Record<string, unknown> = {};
  const sourceValues: Record<string, ConfigFileSourceValue> = {};

  for (const field of info.fields) {
    const lookupPath = parseConfigLookupPath({
      fieldName: field.name,
      configPath: field.configPath,
    });
    const result = readPath(file, field, lookupPath);
    if (!result.found) {
      continue;
    }

    config[field.name] = result.value;
    sourceValues[field.name] = {
      name: `${file.path}:${lookupPath.displayPath}`,
      value: stringifyJsonValue(result.value),
    };
  }

  return { config, sourceValues };
}
