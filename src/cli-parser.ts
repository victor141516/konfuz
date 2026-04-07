import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { SchemaInfo } from './schema-transformer';
import { globalGenerator } from './short-param';

export interface CliConfig {
  [key: string]: string | number | boolean | undefined;
}

export function parseCliArguments(info: SchemaInfo): CliConfig {
  const argv = hideBin(process.argv);
  const config: CliConfig = {};

  globalGenerator.reset();

  if (argv.length === 0) {
    for (const field of info.fields) {
      if (field.defaultValue !== undefined) {
        config[field.name] = field.defaultValue as string | number | boolean;
      }
    }
    return config;
  }

  let y = yargs(argv);

  for (const field of info.fields) {
    const cliName = field.cmdName;
    const shortParam = field.cmdNameShort
      ? globalGenerator.getShortParam(field.name, field.cmdNameShort)
      : globalGenerator.getShortParam(field.name, cliName);

    if (field.type === 'boolean') {
      y = y.boolean(cliName);
    } else if (field.type === 'number') {
      y = y.number(cliName);
    } else {
      y = y.string(cliName);
    }

    const options: Record<string, unknown> = {};
    if (field.enumValues) {
      options.choices = field.enumValues;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (y as any).option(cliName, {
      alias: shortParam,
      ...options,
    });
  }

  const parsed = y.argv;

  for (const field of info.fields) {
    const cliName = field.cmdName;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (parsed as any)[cliName];
    if (value !== undefined) {
      config[field.name] = value as string | number | boolean;
    } else if (field.defaultValue !== undefined) {
      config[field.name] = field.defaultValue as string | number | boolean;
    }
  }

  return config;
}
