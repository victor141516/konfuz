import { isJsonObject } from './json-utils';

export interface ConfigLookupPathInput {
  fieldName: string;
  configPath?: string;
}

export interface ConfigLookupPath {
  segments: string[];
  displayPath: string;
}

export type ConfigLookupReadResult =
  | { found: true; value: unknown }
  | { found: false; failedAt?: string };

/**
 * Owns the small dot-notation used for JSON config lookup.
 */
export function parseConfigLookupPath(
  input: ConfigLookupPathInput
): ConfigLookupPath {
  const rawPath = input.configPath;

  if (rawPath === undefined || rawPath === '.') {
    return {
      segments: [input.fieldName],
      displayPath: `.${input.fieldName}`,
    };
  }

  if (!rawPath.startsWith('.')) {
    throw new Error(
      `[konfuz] configPath for "${input.fieldName}" must start with ".".`
    );
  }

  const body = rawPath.slice(1);
  if (body === '') {
    return {
      segments: [input.fieldName],
      displayPath: `.${input.fieldName}`,
    };
  }

  const segments = body.split('.');
  for (const [index, segment] of segments.entries()) {
    const isTrailingEmptySegment =
      segment === '' && index === segments.length - 1;
    if (segment === '' && !isTrailingEmptySegment) {
      throw new Error(
        `[konfuz] configPath for "${input.fieldName}" must not contain empty middle segments.`
      );
    }
  }

  if (segments[segments.length - 1] === '') {
    segments.pop();
    segments.push(input.fieldName);
  }

  return {
    segments,
    displayPath: `.${segments.join('.')}`,
  };
}

export function readConfigLookupPath(
  data: Record<string, unknown>,
  lookupPath: ConfigLookupPath
): ConfigLookupReadResult {
  let current: unknown = data;
  const traversedSegments: string[] = [];

  for (const segment of lookupPath.segments) {
    if (!isJsonObject(current)) {
      return { found: false, failedAt: `.${traversedSegments.join('.')}` };
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false };
    }

    current = current[segment];
    traversedSegments.push(segment);
  }

  return { found: true, value: current };
}
