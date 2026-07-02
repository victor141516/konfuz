import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { coerceCliBooleanValue } from '../../utils/primitive-values';
import { SchemaDescriptor } from '../../schema-transformer';
import { globalGenerator } from './short-param';
import { toSourceValue } from '../../utils/source-values';

export interface CliConfig {
  [key: string]: string | number | boolean | undefined;
}

export interface CliParseResult {
  config: CliConfig;
  rawValues: Record<string, string>;
  sourceValues: Record<string, string>;
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
        const coerced = coerceCliBooleanValue(value);
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

export function parseCliArguments(
  info: SchemaDescriptor,
  options?: { argv?: string[] }
): CliConfig | CliParseResult {
  const result = parseConfiguredCliArguments(
    info,
    options?.argv ?? hideBin(process.argv)
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
