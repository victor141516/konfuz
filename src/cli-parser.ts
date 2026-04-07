import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { SchemaDescriptor } from './schema-transformer';
import { globalGenerator } from './short-param';

export interface CliConfig {
  [key: string]: string | number | boolean | undefined;
}

export function parseCliArguments(info: SchemaDescriptor): CliConfig {
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

    if (field.type === 'number') {
      y = y.number(cliName);
    } else {
      // For booleans and strings, use string type and handle coercion ourselves.
      // Yargs' built-in boolean coercion does not handle --flag=1 / --flag 0 correctly.
      y = y.string(cliName);
    }

    const options: Record<string, unknown> = {};
    if (field.enumValues) {
      options.choices = field.enumValues;
    }
    if (field.cmdDescription) {
      options.describe = field.cmdDescription;
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
      if (field.type === 'boolean') {
        // Determine the actual boolean value from the raw argv rather than
        // relying on yargs, which does not interpret "1" / "0" / "yes" correctly.
        config[field.name] = coerceBooleanField(value);
      } else {
        config[field.name] = value as string | number | boolean;
      }
    } else if (field.defaultValue !== undefined) {
      config[field.name] = field.defaultValue as string | number | boolean;
    }
  }

  return config;
}

/**
 * Determines the boolean value for a CLI flag by inspecting the raw argv.
 *
 * Yargs' `.boolean()` coercion is inconsistent:
 *   --flag        → yargs omits it from output (undefined)  → treat as true
 *   --flag 1      → yargs returns "1" (string)             → treat as true
 *   --flag 0      → yargs returns "0" (string)             → treat as false
 *   --flag=true   → yargs returns "true" (string)         → treat as true
 *   --flag=false  → yargs returns "false" (string)         → treat as false
 *   --flag=1      → yargs returns "1" (string)             → treat as true
 *   --flag=0      → yargs returns "0" (string)             → treat as false
 *   --flag=yes    → yargs returns "yes" (string)           → treat as true
 *   --flag=no     → yargs returns "no" (string)            → treat as false
 *   --no-flag     → yargs returns false (boolean)          → treat as false
 */
function coerceBooleanField(yargsValue: string | boolean): boolean {
  // --no-<flag> style negation results in a boolean false directly
  if (typeof yargsValue === 'boolean') {
    return false;
  }

  // Bare flag with no value (--enabled) returns '' from yargs string mode
  if (yargsValue === '') {
    return true;
  }

  // Flag was provided with an explicit value (--flag value or --flag=value)
  // yargs returns the value as a string — apply our truthy/falsy rules.
  const lower = yargsValue.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}
