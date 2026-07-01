import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { SchemaDescriptor } from './schema-transformer';
import { globalGenerator } from './short-param';

export interface CliConfig {
  [key: string]: string | number | boolean | undefined;
}

export interface CliParseResult {
  config: CliConfig;
  rawValues: Record<string, string>;
  sourceValues: Record<string, string>;
}

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no']);

function coerceBooleanValue(value: string | boolean): boolean | undefined {
  if (typeof value === 'boolean') {
    return false;
  }
  if (value === '') {
    return true;
  }
  const lower = value.toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(lower)) return true;
  if (BOOLEAN_FALSE_VALUES.has(lower)) return false;
  return undefined;
}

function toSourceValue(value: string | number | boolean): string {
  return String(value);
}

function parseConfiguredCliArguments(
  info: SchemaDescriptor,
  argv: string[]
): CliParseResult {
  const config: CliConfig = {};
  const rawValues: Record<string, string> = {};
  const sourceValues: Record<string, string> = {};

  globalGenerator.reset();

  if (argv.length === 0) {
    return { config, rawValues, sourceValues };
  }

  let y = yargs(argv);

  for (const field of info.fields) {
    const cliName = field.cmdName;
    const shortParam = field.cmdNameShort
      ? field.cmdNameShort
      : globalGenerator.getShortParam(field.name);

    if (field.type === 'number') {
      y = y.number(cliName);
    } else {
      y = y.string(cliName);
    }

    const opts: Record<string, unknown> = {};
    if (field.enumValues) {
      opts.choices = field.enumValues;
    }
    if (field.cmdDescription) {
      opts.describe = field.cmdDescription;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (y as any).option(cliName, {
      alias: shortParam,
      ...opts,
    });
  }

  const parsed = y.argv;

  for (const field of info.fields) {
    const cliName = field.cmdName;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (parsed as any)[cliName];
    if (value !== undefined) {
      if (field.type === 'boolean') {
        const coerced = coerceBooleanValue(value);
        if (coerced !== undefined) {
          config[field.name] = coerced;
          sourceValues[field.name] = toSourceValue(coerced);
        } else {
          rawValues[field.name] = value;
        }
      } else {
        config[field.name] = value as string | number | boolean;
        sourceValues[field.name] = toSourceValue(value);
      }
    }
  }

  return { config, rawValues, sourceValues };
}

function addDefaultValues(
  info: SchemaDescriptor,
  result: CliParseResult
): CliParseResult {
  for (const field of info.fields) {
    if (
      field.defaultValue !== undefined &&
      result.config[field.name] === undefined &&
      result.rawValues[field.name] === undefined
    ) {
      result.config[field.name] = field.defaultValue as
        | string
        | number
        | boolean;
    }
  }

  return result;
}

export function parseCliArguments(
  info: SchemaDescriptor,
  options?: { argv?: string[] }
): CliConfig | CliParseResult {
  const result = addDefaultValues(
    info,
    parseConfiguredCliArguments(info, options?.argv ?? hideBin(process.argv))
  );

  if (Object.keys(result.rawValues).length > 0) {
    return result;
  }
  return result.config;
}

export function parseExplicitCliArguments(
  info: SchemaDescriptor,
  options?: { argv?: string[] }
): CliParseResult {
  return parseConfiguredCliArguments(
    info,
    options?.argv ?? hideBin(process.argv)
  );
}
