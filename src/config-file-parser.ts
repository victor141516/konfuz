import type { FieldDescriptor, SchemaDescriptor } from './schema-transformer';
import type { LoadedConfigFile } from './config-file-loader';

interface ConfigFileSourceValue {
  name: string;
  value: string;
}

export interface ConfigFileParseResult {
  config: Record<string, unknown>;
  sourceValues: Record<string, ConfigFileSourceValue>;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function serializeJsonValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

export function resolveConfigLookupPath(field: FieldDescriptor): {
  segments: string[];
  displayPath: string;
} {
  const rawPath = field.configPath;

  if (rawPath === undefined || rawPath === '.') {
    return {
      segments: [field.name],
      displayPath: `.${field.name}`,
    };
  }

  const segments = rawPath.slice(1).split('.');
  if (segments[segments.length - 1] === '') {
    segments.pop();
    segments.push(field.name);
  }

  return {
    segments,
    displayPath: `.${segments.join('.')}`,
  };
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

function readPath(
  file: LoadedConfigFile,
  field: FieldDescriptor,
  segments: string[],
  displayPath: string
): { found: true; value: unknown } | { found: false } {
  let current: unknown = file.data;
  const traversedSegments: string[] = [];

  for (const segment of segments) {
    if (!isJsonObject(current)) {
      warnNonObjectIntermediate(
        file,
        field,
        displayPath,
        `.${traversedSegments.join('.')}`
      );
      return { found: false };
    }

    if (!hasOwn(current, segment)) {
      return { found: false };
    }

    current = current[segment];
    traversedSegments.push(segment);
  }

  return { found: true, value: current };
}

export function parseConfigFileValues(
  info: SchemaDescriptor,
  file: LoadedConfigFile
): ConfigFileParseResult {
  const config: Record<string, unknown> = {};
  const sourceValues: Record<string, ConfigFileSourceValue> = {};

  for (const field of info.fields) {
    const { segments, displayPath } = resolveConfigLookupPath(field);
    const result = readPath(file, field, segments, displayPath);
    if (!result.found) {
      continue;
    }

    config[field.name] = result.value;
    sourceValues[field.name] = {
      name: `${file.path}:${displayPath}`,
      value: serializeJsonValue(result.value),
    };
  }

  return { config, sourceValues };
}
